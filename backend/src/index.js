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

const callbackUrl =
  process.env.GOOGLE_CALLBACK_URL ||
  "http://localhost:4000/auth/google/callback";
const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB || "clippilot";
const allowedEmailDomain = "gmail.com";

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
  apiSecret: account.apiSecret,
  libraries: account.libraries || [],
});

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
      apiSecret: apiSecret || "",
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
    if (apiSecret !== undefined) update.apiSecret = apiSecret;

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

    const tag = (req.query.tag || "").toString().trim();
    if (!tag) {
      return res.status(400).json({ error: "tag-required" });
    }

    const filter = { userId: req.user.id };
    if (req.query.accountId) {
      try {
        filter._id = new ObjectId(req.query.accountId.toString());
      } catch (err) {
        return res.status(400).json({ error: "invalid-account" });
      }
    }

    const normalizedTag = tag.toLowerCase();
    const userAccounts = await accounts.find(filter).toArray();
    const images = [];

    userAccounts.forEach((account) => {
      (account.libraries || []).forEach((library) => {
        if ((library.tag || "").toLowerCase() !== normalizedTag) {
          return;
        }

        const total = Number(library.imageCount) || 0;
        for (let index = 0; index < total; index += 1) {
          images.push({
            id: `${library.id}-${index + 1}`,
            label: `Imagen ${index + 1}`,
            tag: library.tag,
            libraryName: library.name,
            libraryId: library.id,
            accountId: account._id.toString(),
          });
        }
      });
    });

    return res.json({ images });
  } catch (error) {
    return next(error);
  }
});

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
