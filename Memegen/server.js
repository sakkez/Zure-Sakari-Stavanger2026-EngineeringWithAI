import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, extname, basename, resolve } from "node:path";
import sharp from "sharp";
import { choice, image, TypeSafeClient } from "@typesafe-ai/sdk";

const ROOT = import.meta.dirname;
const MEMES_DIR = join(ROOT, "memes");
const PORT = process.env.PORT || 3000;

// Load .env (supports "export KEY=value" lines)
if (existsSync(join(ROOT, ".env"))) {
  for (const line of readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

// Each Choice option is defined by the meme image itself. Images are padded to
// 280x280 (the API minimum) so all 100 fit within one question's context.
const IMAGE_SIDE = 280;
const fileByName = {};
const criteria = {};
for (const file of readdirSync(MEMES_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort()) {
  const name = basename(file, extname(file)).replace(/^\d+_/, "").replace(/_/g, " ");
  const buf = await sharp(join(MEMES_DIR, file))
    .rotate()
    .resize(IMAGE_SIDE, IMAGE_SIDE, { fit: "contain", background: "#fff" })
    .jpeg({ quality: 85 })
    .toBuffer();
  fileByName[name] = file;
  criteria[name] = image(new Blob([buf], { type: "image/jpeg" }));
}

const client = new TypeSafeClient({ defaultHeaders: { "TypeSafe-Danger-Zone-Images": "true" } });

async function pickMeme(text) {
  const { answers } = await client.systemOne({
    model: "jev-latest",
    state: { text },
    questions: {
      meme: choice(
        "Which meme template best expresses the feeling or situation described in `text`?",
        criteria,
      ),
    },
  });
  const { choice: name, probabilities, confidence } = answers.meme;
  const alternatives = Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .filter(([, p], i) => i === 0 || p >= 0.01)
    .map(([n, p]) => ({ name: n, file: fileByName[n], probability: p }));
  return { name, file: fileByName[name], confidence, alternatives };
}

const TYPES = { ".html": "text/html; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };

async function sendFile(res, path) {
  try {
    const data = await readFile(path);
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  // Allow the page to be opened directly from disk (file:// sends Origin "null")
  if (req.headers.origin === "null") {
    res.setHeader("Access-Control-Allow-Origin", "null");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.writeHead(204).end();
  }

  if (req.method === "POST" && url.pathname === "/api/meme") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const text = String(JSON.parse(body).text || "").trim().slice(0, 2000);
      if (!text) throw Object.assign(new Error("Type something first"), { status: 400 });
      const result = await pickMeme(text);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
    } catch (err) {
      console.error(err);
      res.writeHead(err.status || 500, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname.startsWith("/memes/")) {
    const path = resolve(MEMES_DIR, decodeURIComponent(url.pathname.slice("/memes/".length)));
    if (!path.startsWith(MEMES_DIR)) return res.writeHead(403).end();
    return sendFile(res, path);
  }

  if (url.pathname === "/") return sendFile(res, join(ROOT, "index.html"));
  res.writeHead(404).end("Not found");
}).listen(PORT, () => console.log(`Memegen running at http://localhost:${PORT}`));
