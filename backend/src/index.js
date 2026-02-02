import express from "express";
import session from "express-session";
import cors from "cors";
import dotenv from "dotenv";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { MongoClient } from "mongodb";

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

const getUsersCollection = async () => {
  if (!mongoUri) {
    return null;
  }

  if (usersCollection) {
    return usersCollection;
  }

  mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  const db = mongoClient.db(mongoDbName);
  usersCollection = db.collection("users");
  return usersCollection;
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

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
