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
let reelsCollection;

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

const getReelsCollection = async () => {
  if (reelsCollection) {
    return reelsCollection;
  }

  const client = await getMongoClient();
  if (!client) {
    return null;
  }

  const db = client.db(mongoDbName);
  reelsCollection = db.collection("reels");
  return reelsCollection;
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

const fetchCloudinaryImages = async ({
  account,
  apiSecret,
  maxResults = 100,
  expression = "resource_type:image",
}) => {
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
      expression,
      max_results: maxResults,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`cloudinary-search-failed:${response.status}:${errorBody}`);
  }

  const result = await response.json();
  return result.resources || [];
};

const updateCloudinaryTags = async ({
  account,
  apiSecret,
  publicIds,
  command,
  tag,
}) => {
  if (!publicIds.length) return;
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureParams = {
    command,
    tag,
    timestamp,
    public_ids: publicIds.join(","),
    type: "upload",
  };
  const signature = buildCloudinarySignature(signatureParams, apiSecret);
  const tagParams = new URLSearchParams();
  tagParams.append("command", command);
  tagParams.append("tag", tag);
  publicIds.forEach((publicId) => tagParams.append("public_ids[]", publicId));
  tagParams.append("type", "upload");
  tagParams.append("timestamp", String(timestamp));
  tagParams.append("api_key", account.apiKey);
  tagParams.append("signature", signature);

  const apiUrl = `https://api.cloudinary.com/v1_1/${account.cloudName}/image/tags`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tagParams.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`cloudinary-tag-failed:${response.status}:${errorBody}`);
  }
};

const buildCloudinarySignature = (params, apiSecret) =>
  crypto
    .createHash("sha1")
    .update(
      Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null)
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, value]) => `${key}=${value}`)
        .join("&") + apiSecret
    )
    .digest("hex");

const formatOverlayPublicId = (publicId) => publicId.replace(/\//g, ":");

const buildReelTransformation = (images) => {
  const durationSeconds = 3;
  const fps = 30;
  const frames = durationSeconds * fps;

  const baseTransform = (publicId, index, isSplice) => {
    const zoom = index % 2 === 0 ? 1.1 : 0.9;
    const parts = [
      "w_1080",
      "h_1920",
      "c_fit",
      "b_black",
      `e_zoompan:mode_ofp;zoom_${zoom};d_${frames};fps_${fps}`,
      `du_${durationSeconds}`,
    ];

    if (isSplice) {
      const overlayId = formatOverlayPublicId(publicId);
      return [`fl_splice`, `l_image:${overlayId}`, ...parts].join(",");
    }

    return parts.join(",");
  };

  return images
    .map((image, index) => baseTransform(image.publicId, index, index !== 0))
    .join("/");
};

const shuffleArray = (values) => {
  const array = [...values];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
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
      const signature = buildCloudinarySignature(signatureParams, apiSecret);

      tagParams.append("command", command);
      tagParams.append("tag", "reel");
      tagParams.append("public_ids[]", publicId);
      tagParams.append("type", deliveryType);
      tagParams.append("timestamp", String(timestamp));
      tagParams.append("api_key", account.apiKey);
      tagParams.append("signature", signature);
      const apiUrl = new URL(baseUrl);
      const requestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tagParams.toString(),
      };

      const response = await fetch(apiUrl, requestInit);

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

      const contextUrl = `https://api.cloudinary.com/v1_1/${account.cloudName}/image/context`;
      const contextParams = new URLSearchParams();
      const contextCommand = "add";
      const timestamp2 = Math.floor(Date.now() / 1000);
      const contextValue = `reel=${parsedEnabled === true ? "true" : "false"}`;
      const contextSignatureParams = {
        command: contextCommand,
        context: contextValue,
        timestamp: timestamp2,
        type: deliveryType,
        public_ids: publicId,
      };
      const contextSignature = buildCloudinarySignature(
        contextSignatureParams,
        apiSecret
      );

      contextParams.append("command", contextCommand);
      contextParams.append("context", contextValue);
      contextParams.append("public_ids[]", publicId);
      contextParams.append("type", deliveryType);
      contextParams.append("timestamp", String(timestamp2));
      contextParams.append("api_key", account.apiKey);
      contextParams.append("signature", contextSignature);
      const contextResponse = await fetch(contextUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: contextParams.toString(),
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

app.post("/api/accounts/:id/reels", ensureAuthenticated, async (req, res, next) => {
  try {
    const accounts = await getAccountsCollection();
    const reels = await getReelsCollection();
    if (!accounts || !reels) {
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

    const requestedCount = Number(req.body?.count) || 0;
    if (requestedCount <= 0) {
      return res.status(400).json({ error: "invalid-count" });
    }

    const apiSecret = decryptSecret(account.apiSecret);
    if (!account.cloudName || !account.apiKey || !apiSecret) {
      return res.status(400).json({ error: "cloudinary-credentials-missing" });
    }

    const availableImages = await fetchCloudinaryImages({
      account,
      apiSecret,
      maxResults: Math.max(50, requestedCount * 3),
      expression: "resource_type:image AND -tags=reel",
    });

    if (availableImages.length < requestedCount) {
      return res.status(409).json({
        error: "not-enough-images",
        available: availableImages.length,
      });
    }

    const selected = shuffleArray(availableImages)
      .slice(0, requestedCount)
      .map((resource) => ({
        publicId: resource.public_id,
        secureUrl: resource.secure_url,
        url: resource.url,
      }));

    const transformation = buildReelTransformation(selected);
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `reel_${Date.now()}`;
    const folder = "reels";
    const signatureParams = {
      folder,
      public_id: publicId,
      timestamp,
      transformation,
    };
    const signature = buildCloudinarySignature(signatureParams, apiSecret);

    const uploadParams = new URLSearchParams();
    uploadParams.append("file", selected[0].secureUrl || selected[0].url);
    uploadParams.append("api_key", account.apiKey);
    uploadParams.append("timestamp", String(timestamp));
    uploadParams.append("public_id", publicId);
    uploadParams.append("folder", folder);
    uploadParams.append("resource_type", "video");
    uploadParams.append("transformation", transformation);
    uploadParams.append("signature", signature);

    const uploadUrl = `https://api.cloudinary.com/v1_1/${account.cloudName}/video/upload`;
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: uploadParams.toString(),
    });

    if (!uploadResponse.ok) {
      const errorBody = await uploadResponse.text();
      return res.status(uploadResponse.status).json({
        error: "cloudinary-upload-failed",
        details: errorBody || null,
      });
    }

    const uploadResult = await uploadResponse.json();
    const now = new Date();
    const reelDoc = {
      userId: req.user.id,
      accountId: accountId.toString(),
      accountName: account.name,
      publicId: uploadResult.public_id || publicId,
      url: uploadResult.url,
      secureUrl: uploadResult.secure_url,
      createdAt: now,
      imagePublicIds: selected.map((item) => item.publicId),
      imageCount: selected.length,
    };

    await reels.insertOne(reelDoc);
    await updateCloudinaryTags({
      account,
      apiSecret,
      publicIds: selected.map((item) => item.publicId),
      command: "add",
      tag: "reel",
    });

    return res.status(201).json({
      reel: reelDoc,
      images: selected,
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/reels", ensureAuthenticated, async (req, res, next) => {
  try {
    const reels = await getReelsCollection();
    if (!reels) {
      return res.status(503).json({ error: "storage-unavailable" });
    }

    const items = await reels
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({
      reels: items.map((reel) => ({
        id: reel._id.toString(),
        accountId: reel.accountId,
        accountName: reel.accountName,
        publicId: reel.publicId,
        url: reel.url,
        secureUrl: reel.secureUrl,
        createdAt: reel.createdAt,
        imageCount: reel.imageCount,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

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
