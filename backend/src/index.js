import express from "express";
import session from "express-session";
import cors from "cors";
import dotenv from "dotenv";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import crypto from "crypto";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment.");
}
if (!process.env.MONGODB_URI) {
  console.warn("Missing MONGODB_URI in environment. Users will not persist.");
}
if (!process.env.ACCOUNT_SECRET_KEY && !process.env.SESSION_SECRET) {
  console.warn("Missing ACCOUNT_SECRET_KEY or SESSION_SECRET in environment.");
}

const callbackUrl =
  process.env.GOOGLE_CALLBACK_URL ||
  "http://localhost:4000/auth/google/callback";
const mongoUri = process.env.MONGODB_URI;
const defaultDbName = "clippilot";
const resolveMongoDbName = () => {
  if (process.env.MONGODB_DB) {
    return process.env.MONGODB_DB;
  }

  if (!mongoUri) {
    return defaultDbName;
  }

  try {
    const parsed = new URL(mongoUri);
    const candidate = parsed.pathname?.replace("/", "").trim();
    return candidate || defaultDbName;
  } catch (error) {
    return defaultDbName;
  }
};
const mongoDbName = resolveMongoDbName();
const allowedEmailDomain = "gmail.com";
const accountSecretSource =
  process.env.ACCOUNT_SECRET_KEY || process.env.SESSION_SECRET || "dev-secret";
const accountSecretKey = crypto
  .createHash("sha256")
  .update(accountSecretSource)
  .digest();

let mongoClient;
let usersCollection;
let accountsCollection;

app.use(
  cors({
    origin: frontendUrl,
    credentials: true,
  })
);

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      sameSite: "lax",
      secure: false,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

const getMongoClient = async () => {
  if (!mongoUri) {
    return null;
  }

  if (mongoClient) {
    return mongoClient;
  }

  mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  return mongoClient;
};

const getUsersCollection = async () => {
  if (usersCollection) {
    return usersCollection;
  }

  const client = await getMongoClient();
  if (!client) {
    return null;
  }

  const db = client.db(mongoDbName);
  usersCollection = db.collection("users");
  return usersCollection;
};

const getAccountsCollection = async () => {
  if (accountsCollection) {
    return accountsCollection;
  }

  const client = await getMongoClient();
  if (!client) {
    return null;
  }

  const db = client.db(mongoDbName);
  accountsCollection = db.collection("accounts");
  return accountsCollection;
};

const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }

  return res.status(401).json({ error: "unauthenticated" });
};

const serializeAccount = (account) => ({
  id: account._id.toString(),
  name: account.name,
  cloudName: account.cloudName,
  apiKey: account.apiKey,
  apiSecretConfigured: Boolean(account.apiSecret),
  libraries: account.libraries || [],
});

const encryptSecret = (value) => {
  if (!value) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", accountSecretKey, iv);
  let encrypted = cipher.update(value, "utf8", "base64");
  encrypted += cipher.final("base64");
  const tag = cipher.getAuthTag().toString("base64");
  return `${iv.toString("base64")}:${tag}:${encrypted}`;
};

const decryptSecret = (value) => {
  if (!value) return "";
  const parts = value.split(":");
  if (parts.length !== 3) {
    return value;
  }
  const [ivPart, tagPart, encryptedPart] = parts;
  try {
    const iv = Buffer.from(ivPart, "base64");
    const tag = Buffer.from(tagPart, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", accountSecretKey, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedPart, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    return "";
  }
};

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      callbackURL: callbackUrl,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase() || "";
        const domain = email.split("@")[1] || "";

        if (!email || domain !== allowedEmailDomain) {
          return done(null, false, { message: "gmail-only" });
        }

        const users = await getUsersCollection();
        const now = new Date();
        const userPayload = {
          id: profile.id,
          displayName: profile.displayName,
          emails: profile.emails,
          photos: profile.photos,
        };

        if (!users) {
          return done(null, { ...userPayload, role: "free" });
        }

        const result = await users.findOneAndUpdate(
          { googleId: profile.id },
          {
            $set: {
              displayName: profile.displayName,
              email,
              photo: profile.photos?.[0]?.value || null,
              updatedAt: now,
            },
            $setOnInsert: {
              googleId: profile.id,
              role: "free",
              createdAt: now,
            },
          },
          {
            upsert: true,
            returnDocument: "after",
          }
        );

        const dbUser = result.value;
        if (dbUser && !dbUser.role) {
          await users.updateOne(
            { _id: dbUser._id },
            { $set: { role: "free", updatedAt: now } }
          );
          dbUser.role = "free";
        }

        return done(null, {
          ...userPayload,
          role: dbUser?.role || "free",
          dbId: dbUser?._id?.toString(),
        });
      } catch (error) {
        return done(error);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

app.get("/auth/google/callback", (req, res, next) => {
  passport.authenticate("google", (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      const reason = info?.message === "gmail-only" ? "gmail-only" : "auth";
      return res.redirect(`${frontendUrl}/?error=${reason}`);
    }

    req.logIn(user, (loginError) => {
      if (loginError) {
        return next(loginError);
      }
      return res.redirect(`${frontendUrl}/?login=success`);
    });
  })(req, res, next);
});

app.get("/auth/me", (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ user: null });
  }

  return res.json({ user: req.user });
});

app.post("/auth/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });
});

app.get("/api/accounts", ensureAuthenticated, async (req, res, next) => {
  try {
    const accounts = await getAccountsCollection();
    if (!accounts) {
      return res.status(503).json({ error: "storage-unavailable" });
    }

    const userAccounts = await accounts
      .find({ userId: req.user.id })
      .toArray();

    return res.json({ accounts: userAccounts.map(serializeAccount) });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/accounts", ensureAuthenticated, async (req, res, next) => {
  try {
    const accounts = await getAccountsCollection();
    if (!accounts) {
      return res.status(503).json({ error: "storage-unavailable" });
    }

    const { name, cloudName, apiKey, apiSecret } = req.body || {};
    if (!name || !cloudName || !apiKey) {
      return res.status(400).json({ error: "missing-fields" });
    }

    const now = new Date();
    const accountDoc = {
      userId: req.user.id,
      name,
      cloudName,
      apiKey,
      apiSecret: encryptSecret(apiSecret),
      libraries: [],
      createdAt: now,
      updatedAt: now,
    };

    const result = await accounts.insertOne(accountDoc);
    const created = await accounts.findOne({ _id: result.insertedId });
    return res.status(201).json({ account: serializeAccount(created) });
  } catch (error) {
    return next(error);
  }
});

app.put("/api/accounts/:id", ensureAuthenticated, async (req, res, next) => {
  try {
    const accounts = await getAccountsCollection();
    if (!accounts) {
      return res.status(503).json({ error: "storage-unavailable" });
    }

    const { id } = req.params;
    let accountId;
    try {
      accountId = new ObjectId(id);
    } catch (err) {
      return res.status(400).json({ error: "invalid-account" });
    }

    const { name, cloudName, apiKey, apiSecret } = req.body || {};
    const update = {
      updatedAt: new Date(),
    };

    if (name) update.name = name;
    if (cloudName) update.cloudName = cloudName;
    if (apiKey) update.apiKey = apiKey;
    if (apiSecret !== undefined) update.apiSecret = encryptSecret(apiSecret);

    const result = await accounts.findOneAndUpdate(
      { _id: accountId, userId: req.user.id },
      { $set: update },
      { returnDocument: "after" }
    );

    if (!result.value) {
      return res.status(404).json({ error: "not-found" });
    }

    return res.json({ account: serializeAccount(result.value) });
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/accounts/:id", ensureAuthenticated, async (req, res, next) => {
  try {
    const accounts = await getAccountsCollection();
    if (!accounts) {
      return res.status(503).json({ error: "storage-unavailable" });
    }

    const { id } = req.params;
    let accountId;
    try {
      accountId = new ObjectId(id);
    } catch (err) {
      return res.status(400).json({ error: "invalid-account" });
    }

    const result = await accounts.deleteOne({ _id: accountId, userId: req.user.id });
    if (!result.deletedCount) {
      return res.status(404).json({ error: "not-found" });
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

app.post(
  "/api/accounts/:id/libraries",
  ensureAuthenticated,
  async (req, res, next) => {
    try {
      const accounts = await getAccountsCollection();
      if (!accounts) {
        return res.status(503).json({ error: "storage-unavailable" });
      }

      const { id } = req.params;
      let accountId;
      try {
        accountId = new ObjectId(id);
      } catch (err) {
        return res.status(400).json({ error: "invalid-account" });
      }

      const { name, tag, imageCount } = req.body || {};
      if (!name || !tag) {
        return res.status(400).json({ error: "missing-fields" });
      }

      const library = {
        id: crypto.randomUUID(),
        name,
        tag,
        imageCount: Number(imageCount) || 0,
        createdAt: new Date(),
      };

      const result = await accounts.findOneAndUpdate(
        { _id: accountId, userId: req.user.id },
        {
          $push: { libraries: library },
          $set: { updatedAt: new Date() },
        },
        { returnDocument: "after" }
      );

      if (!result.value) {
        return res.status(404).json({ error: "not-found" });
      }

      return res.status(201).json({ account: serializeAccount(result.value) });
    } catch (error) {
      return next(error);
    }
  }
);

app.delete(
  "/api/accounts/:id/libraries/:libraryId",
  ensureAuthenticated,
  async (req, res, next) => {
    try {
      const accounts = await getAccountsCollection();
      if (!accounts) {
        return res.status(503).json({ error: "storage-unavailable" });
      }

      const { id, libraryId } = req.params;
      let accountId;
      try {
        accountId = new ObjectId(id);
      } catch (err) {
        return res.status(400).json({ error: "invalid-account" });
      }

      const result = await accounts.findOneAndUpdate(
        { _id: accountId, userId: req.user.id },
        {
          $pull: { libraries: { id: libraryId } },
          $set: { updatedAt: new Date() },
        },
        { returnDocument: "after" }
      );

      if (!result.value) {
        return res.status(404).json({ error: "not-found" });
      }

      return res.json({ account: serializeAccount(result.value) });
    } catch (error) {
      return next(error);
    }
  }
);

app.get("/api/images", ensureAuthenticated, async (req, res, next) => {
  try {
    const accounts = await getAccountsCollection();
    if (!accounts) {
      return res.status(503).json({ error: "storage-unavailable" });
    }

    const filter = { userId: req.user.id };
    if (req.query.accountId) {
      try {
        filter._id = new ObjectId(req.query.accountId.toString());
      } catch (err) {
        return res.status(400).json({ error: "invalid-account" });
      }
    }

    const account = await accounts.findOne(filter);
    if (!account) {
      return res.status(404).json({ error: "account-not-found" });
    }

    const apiSecret = decryptSecret(account.apiSecret);
    if (!account.cloudName || !account.apiKey || !apiSecret) {
      return res.status(400).json({ error: "cloudinary-credentials-missing" });
    }

    const authHeader = Buffer.from(`${account.apiKey}:${apiSecret}`).toString(
      "base64"
    );
    const apiUrl = new URL(
      `https://api.cloudinary.com/v1_1/${account.cloudName}/resources/image`
    );
    apiUrl.searchParams.set("max_results", "5");
    apiUrl.searchParams.set("direction", "desc");
    apiUrl.searchParams.set("tags", "true");
    apiUrl.searchParams.set("context", "true");
    apiUrl.searchParams.set("metadata", "true");

    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Basic ${authHeader}`,
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: "cloudinary-fetch-failed" });
    }

    const result = await response.json();
    const images = (result.resources || []).slice(0, 5).map((resource) => ({
      id: resource.asset_id || resource.public_id,
      publicId: resource.public_id,
      format: resource.format,
      width: resource.width,
      height: resource.height,
      url: resource.url,
      secureUrl: resource.secure_url,
      createdAt: resource.created_at,
      type: resource.type || "upload",
      tags: Array.isArray(resource.tags) ? resource.tags : [],
      context: resource.context || null,
      metadata: resource.metadata || null,
      isReel:
        (Array.isArray(resource.tags) && resource.tags.includes("reel")) ||
        resource.metadata?.reel === true ||
        resource.metadata?.reel === "true" ||
        resource.context?.custom?.reel === true ||
        resource.context?.custom?.reel === "true",
    }));

    return res.json({ images });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/accounts/:id/images", ensureAuthenticated, async (req, res, next) => {
  try {
    const accounts = await getAccountsCollection();
    if (!accounts) {
      return res.status(503).json({ error: "storage-unavailable" });
    }

    const { id } = req.params;
    let accountId;
    try {
      accountId = new ObjectId(id);
    } catch (err) {
      return res.status(400).json({ error: "invalid-account" });
    }

    const account = await accounts.findOne({ _id: accountId, userId: req.user.id });
    if (!account) {
      return res.status(404).json({ error: "account-not-found" });
    }

    const apiSecret = decryptSecret(account.apiSecret);
    if (!account.cloudName || !account.apiKey || !apiSecret) {
      return res.status(400).json({ error: "cloudinary-credentials-missing" });
    }

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const authHeader = Buffer.from(`${account.apiKey}:${apiSecret}`).toString(
      "base64"
    );
    const apiUrl = new URL(
      `https://api.cloudinary.com/v1_1/${account.cloudName}/resources/image`
    );
    apiUrl.searchParams.set("max_results", limit.toString());
    apiUrl.searchParams.set("direction", "desc");
    apiUrl.searchParams.set("tags", "true");
    apiUrl.searchParams.set("context", "true");
    apiUrl.searchParams.set("metadata", "true");
    if (req.query.cursor) {
      apiUrl.searchParams.set("next_cursor", req.query.cursor.toString());
    }

    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Basic ${authHeader}`,
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: "cloudinary-fetch-failed" });
    }

    const result = await response.json();
    const images = (result.resources || []).map((resource) => ({
      id: resource.asset_id || resource.public_id,
      publicId: resource.public_id,
      format: resource.format,
      width: resource.width,
      height: resource.height,
      url: resource.url,
      secureUrl: resource.secure_url,
      createdAt: resource.created_at,
      type: resource.type || "upload",
      tags: Array.isArray(resource.tags) ? resource.tags : [],
      context: resource.context || null,
      metadata: resource.metadata || null,
      isReel:
        (Array.isArray(resource.tags) && resource.tags.includes("reel")) ||
        resource.metadata?.reel === true ||
        resource.metadata?.reel === "true" ||
        resource.context?.custom?.reel === true ||
        resource.context?.custom?.reel === "true",
    }));

    return res.json({ images, nextCursor: result.next_cursor || null });
  } catch (error) {
    return next(error);
  }
});

app.post(
  "/api/accounts/:id/images/:publicId(*)/reel",
  ensureAuthenticated,
  async (req, res, next) => {
    try {
      const accounts = await getAccountsCollection();
      if (!accounts) {
        return res.status(503).json({ error: "storage-unavailable" });
      }

      const { id, publicId } = req.params;
      const { enabled, type } = req.body || {};
      const parsedEnabled =
        typeof enabled === "boolean"
          ? enabled
          : typeof enabled === "string"
            ? enabled.toLowerCase() === "true"
            : null;
      if (parsedEnabled === null) {
        return res.status(400).json({ error: "invalid-request" });
      }

      let accountId;
      try {
        accountId = new ObjectId(id);
      } catch (err) {
        return res.status(400).json({ error: "invalid-account" });
      }

      const account = await accounts.findOne({
        _id: accountId,
        userId: req.user.id,
      });
      if (!account) {
        return res.status(404).json({ error: "account-not-found" });
      }

      const apiSecret = decryptSecret(account.apiSecret);
      if (!account.cloudName || !account.apiKey || !apiSecret) {
        return res.status(400).json({ error: "cloudinary-credentials-missing" });
      }

      const baseUrl = `https://api.cloudinary.com/v1_1/${account.cloudName}/image/tags`;
      const tagParams = new URLSearchParams();
      const deliveryType =
        typeof type === "string" && type.trim() ? type.trim() : "upload";
      console.info("[reel] update request", {
        accountId: accountId.toString(),
        publicId,
        deliveryType,
        enabled: parsedEnabled,
      });
      const isAdd = parsedEnabled === true;
      const command = isAdd ? "add" : "remove";
      const timestamp = Math.floor(Date.now() / 1000);
      const signatureParams = {
        command,
        tag: "reel",
        timestamp,
        type: deliveryType,
        public_ids: publicId,
      };
      const signature = crypto
        .createHash("sha1")
        .update(
          Object.entries(signatureParams)
            .filter(([, value]) => value !== undefined && value !== null)
            .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
            .map(([key, value]) => `${key}=${value}`)
            .join("&") + apiSecret
        )
        .digest("hex");

      tagParams.append("command", command);
      tagParams.append("tag", "reel");
      tagParams.append("public_ids[]", publicId);
      tagParams.append("type", deliveryType);
      tagParams.append("timestamp", String(timestamp));
      tagParams.append("api_key", account.apiKey);
      tagParams.append("signature", signature);
      const apiUrl = new URL(baseUrl);
      console.info("[reel] tag update request", {
        method: "POST",
        url: apiUrl.toString(),
        body: tagParams.toString(),
      });
      const requestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tagParams.toString(),
      };

      const response = await fetch(apiUrl, requestInit);
      console.info("[reel] tag update response", {
        status: response.status,
        ok: response.ok,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("[reel] tag update failed", {
          status: response.status,
          body: errorBody,
        });
        return res.status(response.status).json({
          error: "cloudinary-update-failed",
          details: errorBody || null,
        });
      }

      const contextUrl = `https://api.cloudinary.com/v1_1/${account.cloudName}/resources/image/context`;
      const contextParams = new URLSearchParams();
      contextParams.append("public_ids[]", publicId);
      contextParams.append("type", deliveryType);
      contextParams.append(
        "context",
        `reel=${parsedEnabled === true ? "true" : "false"}`
      );
      console.info("[reel] context update request", {
        url: contextUrl,
        body: contextParams.toString(),
      });
      const contextResponse = await fetch(contextUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${authHeader}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: contextParams.toString(),
      });
      console.info("[reel] context update response", {
        status: contextResponse.status,
        ok: contextResponse.ok,
      });

      if (!contextResponse.ok) {
        const errorBody = await contextResponse.text();
        console.error("[reel] context update failed", {
          status: contextResponse.status,
          body: errorBody,
        });
        return res.status(contextResponse.status).json({
          error: "cloudinary-metadata-update-failed",
          details: errorBody || null,
        });
      }

      return res.json({ ok: true, isReel: parsedEnabled });
    } catch (error) {
      return next(error);
    }
  }
);

app.get(
  "/api/accounts/:id/images/count",
  ensureAuthenticated,
  async (req, res, next) => {
    try {
      const accounts = await getAccountsCollection();
      if (!accounts) {
        return res.status(503).json({ error: "storage-unavailable" });
      }

      const { id } = req.params;
      let accountId;
      try {
        accountId = new ObjectId(id);
      } catch (err) {
        return res.status(400).json({ error: "invalid-account" });
      }

      const account = await accounts.findOne({
        _id: accountId,
        userId: req.user.id,
      });
      if (!account) {
        return res.status(404).json({ error: "account-not-found" });
      }

      const apiSecret = decryptSecret(account.apiSecret);
      if (!account.cloudName || !account.apiKey || !apiSecret) {
        return res.status(400).json({ error: "cloudinary-credentials-missing" });
      }

      const authHeader = Buffer.from(`${account.apiKey}:${apiSecret}`).toString(
        "base64"
      );
      const apiUrl = `https://api.cloudinary.com/v1_1/${account.cloudName}/resources/search`;
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${authHeader}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expression: "resource_type:image",
          max_results: 1,
        }),
      });

      if (!response.ok) {
        return res.status(502).json({ error: "cloudinary-fetch-failed" });
      }

      const result = await response.json();
      const totalCount = Number.isFinite(Number(result.total_count))
        ? Number(result.total_count)
        : null;

      return res.json({ totalCount });
    } catch (error) {
      return next(error);
    }
  }
);

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
