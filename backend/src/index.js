import express from "express";
import session from "express-session";
import cors from "cors";
import dotenv from "dotenv";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import crypto from "crypto";
import { Blob } from "buffer";
import { promises as fs } from "fs";
import fsSync from "fs";
import { MongoClient, ObjectId } from "mongodb";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const fetchCloudinaryImageResource = async ({ account, apiSecret, publicId }) => {
  const authHeader = Buffer.from(`${account.apiKey}:${apiSecret}`).toString(
    "base64"
  );
  const apiUrl = `https://api.cloudinary.com/v1_1/${account.cloudName}/resources/image/upload/${encodeURIComponent(
    publicId
  )}`;
  const response = await fetch(apiUrl, {
    method: "GET",
    headers: {
      Authorization: `Basic ${authHeader}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`cloudinary-resource-failed:${response.status}:${errorBody}`);
  }

  return response.json();
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

const downloadImageToFile = async (url, destination, { timeoutMs = 30000 } = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`image-download-failed:${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(destination, buffer);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`image-download-timeout:${timeoutMs}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const runFfmpeg = async (args) =>
  new Promise((resolve, reject) => {
    const process = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    process.on("error", (error) => {
      reject(error);
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg-failed:${code}:${stderr}`));
      }
    });
  });

const runFfprobe = async (args) =>
  new Promise((resolve, reject) => {
    const process = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    process.on("error", (error) => {
      reject(error);
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`ffprobe-failed:${code}:${stderr}`));
      }
    });
  });

const getAudioFiles = async (directory) => {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp3"))
      .map((entry) => path.join(directory, entry.name));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

const getMediaDurationSeconds = async (filePath) => {
  const output = await runFfprobe([
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const value = Number.parseFloat(output);
  return Number.isFinite(value) ? value : 0;
};

const renderReelVideo = async ({
  images,
  outputPath,
  durationSeconds = 2,
  transitionSeconds = 0.5,
  zoomAmount = 0.05,
  fps = 30,
  width = 1080,
  height = 1920,
  fadeOutToBlack = true,
  onProgress,
}) => {
  const logProgress = typeof onProgress === "function" ? onProgress : () => {};
  const baseTempDir = path.join(process.cwd(), "tmp", "reels");
  await fs.mkdir(baseTempDir, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(baseTempDir, "clippilot-reel-"));
  try {
    logProgress("render-temp-dir", { imageCount: images.length });
    const imagePaths = [];
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      const imagePath = path.join(tempDir, `frame_${index + 1}.jpg`);
      const downloadUrl = image.secureUrl || image.url;
      const downloadStart = Date.now();
      logProgress("render-download-start", {
        index: index + 1,
        total: images.length,
        url: downloadUrl,
      });
      await downloadImageToFile(downloadUrl, imagePath);
      logProgress("render-download-complete", {
        index: index + 1,
        total: images.length,
        durationMs: Date.now() - downloadStart,
      });
      imagePaths.push(imagePath);
    }

    const safeZoomAmount = Math.max(0.01, Math.min(0.3, zoomAmount));
    const safeDuration = Math.max(0.5, durationSeconds);
    const safeTransition = Math.max(0, Math.min(2, transitionSeconds, safeDuration));
    const fadeDuration = Math.min(
      Math.max(0.1, safeTransition || 0.5),
      safeDuration / 2
    );
    const effectiveClipDuration = Math.max(0, safeDuration - safeTransition);
    const totalDuration =
      imagePaths.length > 0
        ? safeDuration + effectiveClipDuration * (imagePaths.length - 1)
        : 0;

    const audioDirectory = path.resolve(__dirname, "..", "audio");
    const audioFiles = await getAudioFiles(audioDirectory);
    const selectedAudio =
      totalDuration > 0 && audioFiles.length > 0
        ? audioFiles[Math.floor(Math.random() * audioFiles.length)]
        : null;
    logProgress("render-audio-scan", {
      audioDirectory,
      audioCount: audioFiles.length,
      totalDuration,
      selectedAudio,
    });
    if (!selectedAudio) {
      logProgress("render-audio-skip", {
        reason:
          totalDuration <= 0
            ? "empty-duration"
            : audioFiles.length === 0
              ? "no-audio-files"
              : "no-selection",
      });
    }

    const inputArgs = [];
    const filterParts = [];
    const streamLabels = [];

    const buildZoomExpression = (frameCount) => {
      const zoomIn = Math.random() >= 0.5;
      const startZoom = zoomIn ? 1 : 1 + safeZoomAmount;
      const endZoom = zoomIn ? 1 + safeZoomAmount : 1;
      const step =
        frameCount > 1 ? (endZoom - startZoom) / (frameCount - 1) : 0;
      const stepExpr = `${step >= 0 ? "+" : ""}${step.toFixed(8)}`;
      return {
        startZoom: startZoom.toFixed(8),
        stepExpr,
      };
    };

    imagePaths.forEach((imagePath, index) => {
      const seconds = safeDuration;
      inputArgs.push("-i", imagePath);
      const frameCount = Math.max(1, Math.round(seconds * fps));
      const { startZoom, stepExpr } = buildZoomExpression(frameCount);
      const inputLabel = `[${index}:v]`;
      const outputLabel = `[v${index}]`;
      const zoompan = [
        `zoompan=z='if(eq(on,0),${startZoom},zoom${stepExpr})'`,
        "x='iw/2-(iw/zoom/2)'",
        "y='ih/2-(ih/zoom/2)'",
        `d=${frameCount}`,
        `s=${width}x${height}`,
        `fps=${fps}`,
      ].join(":");
      const baseTransform =
        `${inputLabel}scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,${zoompan}`;
      const fadeIn =
        index === 0 && fadeOutToBlack ? `,fade=t=in:st=0:d=${fadeDuration}` : "";
      filterParts.push(`${baseTransform}${fadeIn}${outputLabel}`);
      streamLabels.push(outputLabel);
    });

    let currentLabel = streamLabels[0];
    for (let index = 1; index < streamLabels.length; index += 1) {
      const nextLabel = streamLabels[index];
      const outputLabel = `[xf${index}]`;
      const offset = Math.max(0, effectiveClipDuration * index).toFixed(3);
      filterParts.push(
        `${currentLabel}${nextLabel}xfade=transition=fade:duration=${safeTransition}:offset=${offset}${outputLabel}`
      );
      currentLabel = outputLabel;
    }

    if (fadeOutToBlack) {
      const fadeOutStart = Math.max(0, totalDuration - fadeDuration).toFixed(3);
      filterParts.push(
        `${currentLabel}fade=t=out:st=${fadeOutStart}:d=${fadeDuration},format=yuv420p[video]`
      );
    } else {
      filterParts.push(`${currentLabel}format=yuv420p[video]`);
    }

    let audioLabel = null;
    if (selectedAudio) {
      const audioDuration = await getMediaDurationSeconds(selectedAudio);
      const hasRoomForStart = audioDuration > totalDuration;
      const maxStart = hasRoomForStart ? audioDuration - totalDuration : 0;
      const startTime = hasRoomForStart ? Math.random() * maxStart : 0;
      const audioStart = Math.max(0, startTime).toFixed(3);
      logProgress("render-audio-selected", {
        audioDuration,
        audioStart,
        hasRoomForStart,
      });
      if (!hasRoomForStart) {
        inputArgs.push("-stream_loop", "-1");
      }
      inputArgs.push("-ss", audioStart, "-t", totalDuration.toFixed(3), "-i", selectedAudio);

      const audioInputIndex = imagePaths.length;
      const audioFadeOutStart = Math.max(0, totalDuration - fadeDuration).toFixed(3);
      const audioFilters =
        `[${audioInputIndex}:a]` +
        `atrim=0:${totalDuration.toFixed(3)},` +
        "asetpts=PTS-STARTPTS," +
        `afade=t=in:st=0:d=${fadeDuration},` +
        `afade=t=out:st=${audioFadeOutStart}:d=${fadeDuration}` +
        "[audio]";
      filterParts.push(audioFilters);
      audioLabel = "[audio]";
    }

    const filterComplex = filterParts
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter((part) => part.length > 0)
      .join(";");
    if (!filterComplex) {
      throw new Error("ffmpeg-filter-empty");
    }

    logProgress("render-ffmpeg-start", {
      imageCount: imagePaths.length,
      fps,
      durationSeconds: safeDuration,
      transitionSeconds: safeTransition,
    });
    const ffmpegStart = Date.now();
    await runFfmpeg([
      "-y",
      ...inputArgs,
      "-filter_complex",
      filterComplex,
      "-map",
      "[video]",
      ...(audioLabel ? ["-map", audioLabel] : []),
      "-r",
      String(fps),
      "-c:v",
      "libx264",
      ...(audioLabel ? ["-c:a", "aac", "-b:a", "192k"] : []),
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
    logProgress("render-ffmpeg-complete", { durationMs: Date.now() - ffmpegStart });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
    try {
      const remaining = await fs.readdir(baseTempDir);
      if (remaining.length === 0) {
        await fs.rmdir(baseTempDir);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }
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
      isFinal:
        (Array.isArray(resource.tags) && resource.tags.includes("final")) ||
        resource.metadata?.final === true ||
        resource.metadata?.final === "true" ||
        resource.context?.custom?.final === true ||
        resource.context?.custom?.final === "true",
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

    const limit = Math.min(Number(req.query.limit) || 50, 200);
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
      isFinal:
        (Array.isArray(resource.tags) && resource.tags.includes("final")) ||
        resource.metadata?.final === true ||
        resource.metadata?.final === "true" ||
        resource.context?.custom?.final === true ||
        resource.context?.custom?.final === "true",
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

app.post(
  "/api/accounts/:id/images/:publicId(*)/final",
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
      console.info("[final] update request", {
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
        tag: "final",
        timestamp,
        type: deliveryType,
        public_ids: publicId,
      };
      const signature = buildCloudinarySignature(signatureParams, apiSecret);

      tagParams.append("command", command);
      tagParams.append("tag", "final");
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
        console.error("[final] tag update failed", {
          status: response.status,
          body: errorBody,
        });
        return res.status(response.status).json({
          error: "cloudinary-update-failed",
          details: errorBody || null,
        });
      }

      return res.json({ ok: true, isFinal: parsedEnabled });
    } catch (error) {
      return next(error);
    }
  }
);

app.post("/api/accounts/:id/reels", ensureAuthenticated, async (req, res, next) => {
  try {
    const logStep = (step, details = {}) => {
      console.info("[reel]", step, details);
    };
    logStep("start", {
      accountId: req.params.id,
      count: req.body?.count,
      imagePublicIds: Array.isArray(req.body?.imagePublicIds)
        ? req.body.imagePublicIds.length
        : 0,
      secondsPerImage: req.body?.secondsPerImage,
      zoomAmount: req.body?.zoomAmount,
      fadeOutToBlack: req.body?.fadeOutToBlack,
    });
    const accounts = await getAccountsCollection();
    const reels = await getReelsCollection();
    if (!accounts || !reels) {
      logStep("storage-unavailable");
      return res.status(503).json({ error: "storage-unavailable", step: "storage" });
    }

    const { id } = req.params;
    let accountId;
    try {
      accountId = new ObjectId(id);
    } catch (err) {
      logStep("invalid-account");
      return res.status(400).json({ error: "invalid-account", step: "account" });
    }

    const account = await accounts.findOne({ _id: accountId, userId: req.user.id });
    if (!account) {
      logStep("account-not-found", { accountId: accountId.toString() });
      return res.status(404).json({ error: "account-not-found", step: "account" });
    }

    const requestedImagePublicIds = Array.isArray(req.body?.imagePublicIds)
      ? req.body.imagePublicIds
          .filter((publicId) => typeof publicId === "string")
          .map((publicId) => publicId.trim())
          .filter(Boolean)
      : [];
    const requestedCount = Number(req.body?.count) || 0;
    const requestedSecondsPerImage = req.body?.secondsPerImage;
    const requestedZoomAmount = req.body?.zoomAmount;
    const requestedFadeOutToBlack = req.body?.fadeOutToBlack;
    if (!requestedImagePublicIds.length && requestedCount <= 0) {
      logStep("invalid-count", { requestedCount });
      return res.status(400).json({ error: "invalid-count", step: "input" });
    }
    if (
      requestedSecondsPerImage !== undefined &&
      (!Number.isFinite(Number(requestedSecondsPerImage)) ||
        Number(requestedSecondsPerImage) <= 0)
    ) {
      logStep("invalid-duration", { requestedSecondsPerImage });
      return res
        .status(400)
        .json({ error: "invalid-duration", step: "input" });
    }
    if (
      requestedZoomAmount !== undefined &&
      (!Number.isFinite(Number(requestedZoomAmount)) ||
        Number(requestedZoomAmount) <= 0)
    ) {
      logStep("invalid-zoom", { requestedZoomAmount });
      return res.status(400).json({ error: "invalid-zoom", step: "input" });
    }

    const secondsPerImage =
      requestedSecondsPerImage !== undefined
        ? Number(requestedSecondsPerImage)
        : 2;
    const zoomAmount =
      requestedZoomAmount !== undefined ? Number(requestedZoomAmount) : 0.05;
    const fadeOutToBlack =
      requestedFadeOutToBlack === undefined
        ? true
        : Boolean(requestedFadeOutToBlack);

    const apiSecret = decryptSecret(account.apiSecret);
    if (!account.cloudName || !account.apiKey || !apiSecret) {
      logStep("cloudinary-credentials-missing");
      return res
        .status(400)
        .json({ error: "cloudinary-credentials-missing", step: "credentials" });
    }

    let selected = [];

    if (requestedImagePublicIds.length) {
      const uniqueIds = new Set(requestedImagePublicIds);
      if (uniqueIds.size !== requestedImagePublicIds.length) {
        logStep("duplicate-images");
        return res.status(400).json({ error: "duplicate-images", step: "input" });
      }

      logStep("fetch-images", { requestedCount: requestedImagePublicIds.length });
      const selectedResources = [];
      for (const publicId of requestedImagePublicIds) {
        const resource = await fetchCloudinaryImageResource({
          account,
          apiSecret,
          publicId,
        });

        if (!resource) {
          logStep("image-not-found", { publicId });
          return res.status(404).json({
            error: "image-not-found",
            step: "images",
            publicId,
          });
        }
        selectedResources.push(resource);
      }

      if (!selectedResources.length) {
        logStep("invalid-selection");
        return res
          .status(400)
          .json({ error: "invalid-selection", step: "images" });
      }

      const finalImages = await fetchCloudinaryImages({
        account,
        apiSecret,
        maxResults: 50,
        expression: "resource_type:image AND tags=final",
      });

      if (finalImages.length === 0) {
        logStep("no-final-image");
        return res.status(409).json({
          error: "no-final-image",
          step: "images",
        });
      }

      const selectedPublicIds = new Set(
        selectedResources.map((resource) => resource.public_id)
      );
      const availableFinalImages = finalImages.filter(
        (resource) => !selectedPublicIds.has(resource.public_id)
      );
      const finalResource =
        shuffleArray(availableFinalImages)[0] ?? shuffleArray(finalImages)[0];

      const finalPayload = {
        publicId: finalResource.public_id,
        secureUrl: finalResource.secure_url,
        url: finalResource.url,
      };
      selected = [
        finalPayload,
        ...selectedResources.map((resource) => ({
          publicId: resource.public_id,
          secureUrl: resource.secure_url,
          url: resource.url,
        })),
        finalPayload,
      ];
    } else {
      logStep("fetch-images", { requestedCount });
      const nonFinalCount = Math.max(0, requestedCount - 2);
      const availableImages =
        nonFinalCount > 0
          ? await fetchCloudinaryImages({
              account,
              apiSecret,
              maxResults: Math.max(50, nonFinalCount * 3),
              expression: "resource_type:image AND -tags=reel",
            })
          : [];
      const finalImages = await fetchCloudinaryImages({
        account,
        apiSecret,
        maxResults: 50,
        expression: "resource_type:image AND tags=final",
      });

      if (finalImages.length === 0) {
        logStep("no-final-image");
        return res.status(409).json({
          error: "no-final-image",
          step: "images",
        });
      }

      const finalResource = shuffleArray(finalImages)[0];
      const filteredAvailableImages = availableImages.filter(
        (resource) => resource.public_id !== finalResource.public_id
      );

      if (filteredAvailableImages.length < nonFinalCount) {
        logStep("not-enough-images", { available: filteredAvailableImages.length });
        return res.status(409).json({
          error: "not-enough-images",
          step: "images",
          available: filteredAvailableImages.length,
        });
      }

      const finalPayload = {
        publicId: finalResource.public_id,
        secureUrl: finalResource.secure_url,
        url: finalResource.url,
      };
      selected = [
        finalPayload,
        ...shuffleArray(filteredAvailableImages)
          .slice(0, nonFinalCount)
          .map((resource) => ({
            publicId: resource.public_id,
            secureUrl: resource.secure_url,
            url: resource.url,
          })),
        finalPayload,
      ];
    }

    logStep("render-local-start", { selectedCount: selected.length });
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `reel_${Date.now()}`;
    const folder = "reels";
    const signatureParams = {
      folder,
      public_id: publicId,
      timestamp,
    };
    const signature = buildCloudinarySignature(signatureParams, apiSecret);

    const tempOutputPath = path.join(os.tmpdir(), `${publicId}.mp4`);
    let uploadResponse;
    try {
      await renderReelVideo({
        images: selected,
        outputPath: tempOutputPath,
        durationSeconds: secondsPerImage,
        zoomAmount,
        fadeOutToBlack,
        onProgress: (step, details) => logStep(step, details),
      });
      logStep("render-local-complete", { publicId });

      const videoBuffer = await fs.readFile(tempOutputPath);
      const videoBlob = new Blob([videoBuffer], { type: "video/mp4" });
      const uploadParams = new FormData();
      uploadParams.append("file", videoBlob, `${publicId}.mp4`);
      uploadParams.append("api_key", account.apiKey);
      uploadParams.append("timestamp", String(timestamp));
      uploadParams.append("public_id", publicId);
      uploadParams.append("folder", folder);
      uploadParams.append("signature", signature);

      const uploadUrl = `https://api.cloudinary.com/v1_1/${account.cloudName}/video/upload`;
      logStep("upload-start", { uploadUrl, publicId });
      uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        body: uploadParams,
      });
    } finally {
      await fs.rm(tempOutputPath, { force: true });
    }

    if (!uploadResponse) {
      throw new Error("upload-not-started");
    }

    if (!uploadResponse.ok) {
      const errorBody = await uploadResponse.text();
      logStep("upload-failed", { status: uploadResponse.status });
      return res.status(uploadResponse.status).json({
        error: "cloudinary-upload-failed",
        step: "upload",
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

    logStep("persist-reel", { publicId: reelDoc.publicId });
    await reels.insertOne(reelDoc);
    const uniqueSelectedPublicIds = [
      ...new Set(selected.map((item) => item.publicId)),
    ];
    logStep("tag-images", { count: uniqueSelectedPublicIds.length });
    await updateCloudinaryTags({
      account,
      apiSecret,
      publicIds: uniqueSelectedPublicIds,
      command: "add",
      tag: "reel",
    });

    logStep("complete", { publicId: reelDoc.publicId });
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

app.get(
  "/api/accounts/:id/reels/summary",
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

      const fetchCount = async (expression) => {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            Authorization: `Basic ${authHeader}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ expression, max_results: 1 }),
        });

        if (!response.ok) {
          return null;
        }

        const result = await response.json();
        const total = Number(result.total_count);
        return Number.isFinite(total) ? total : null;
      };

      const [totalCount, reelCount] = await Promise.all([
        fetchCount("resource_type:image"),
        fetchCount("resource_type:image AND tags=reel"),
      ]);

      const availableCount =
        Number.isFinite(totalCount) && Number.isFinite(reelCount)
          ? Math.max(totalCount - reelCount, 0)
          : null;

      return res.json({ totalCount, reelCount, availableCount });
    } catch (error) {
      return next(error);
    }
  }
);

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
