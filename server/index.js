import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "storage.json");
const PORT = process.env.PORT || 3001;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

if (!process.env.GEMINI_API_KEY) {
  console.warn("\n⚠️  GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.\n");
}

function readDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  } catch {
    return {};
  }
}
function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// --- Gemini API proxy -------------------------------------------------
// Keeps the same request/response shape the frontend already expects
// ({ content: [{ type: "text", text }] }), so client code needs no changes.
app.post("/api/messages", async (req, res) => {
  try {
    const { system, messages, max_tokens } = req.body;
    const userText = (messages || []).map((m) => m.content).join("\n");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system || "" }] },
          contents: [{ role: "user", parts: [{ text: userText }] }],
          generationConfig: { maxOutputTokens: max_tokens || 1000 },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "Gemini API error" });
    }

    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
    res.json({ content: [{ type: "text", text }] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Simple key/value storage (stand-in for window.storage) ---------------
app.get("/api/storage/:key", (req, res) => {
  const db = readDb();
  const value = db[req.params.key];
  if (value === undefined) return res.status(404).json({ error: "not found" });
  res.json({ key: req.params.key, value });
});

app.post("/api/storage/:key", (req, res) => {
  const db = readDb();
  db[req.params.key] = req.body.value;
  writeDb(db);
  res.json({ key: req.params.key, value: req.body.value });
});

// --- Serve the built frontend in production -------------------------------
const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Study Buddy server running on http://localhost:${PORT}`);
  console.log(`Using model: ${MODEL}`);
});
