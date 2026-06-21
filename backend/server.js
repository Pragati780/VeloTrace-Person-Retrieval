/**
 * VIDEO_AI — Node.js Backend
 * ===========================
 * Responsibilities:
 *   1. Receive video upload from Next.js frontend
 *   2. Store video to disk
 *   3. Spawn Python AI pipeline as a child process
 *   4. Stream progress updates via Server-Sent Events (SSE)
 *   5. Return ranked results + serve crop images
 *
 * Why Node for the backend?
 *   • Non-blocking I/O → can handle multiple concurrent uploads
 *     while Python jobs run in separate processes.
 *   • Native SSE support → real-time progress without WebSocket overhead.
 *   • Fast JSON marshalling to/from the Python subprocess.
 */


const express     = require("express");
const cors        = require("cors");
const multer      = require("multer");
const { spawn }   = require("child_process");
const path        = require("path");
const fs          = require("fs");
const { v4: uuid } = require("uuid");

const app    = express();
const PORT   = process.env.PORT || 4000;

// ─── Directories ──────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, "uploads");
const OUTPUTS_DIR = path.join(__dirname, "outputs");
const PYTHON_BIN =
  process.env.PYTHON_BIN ||
  "D:\\Softwares\\Conda\\python.exe";

console.log("Using Python:", PYTHON_BIN);
const PIPELINE    = path.join(__dirname, "../python/src/pipeline.py");

[UPLOADS_DIR, OUTPUTS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ─── In-memory job registry ───────────────────────────────────
// Production: replace with Redis + Bull queue.
const jobs = new Map(); // jobId → { status, progress, result, sseClients }

// ─── Middleware ───────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json());

// Serve cropped person images directly (prefixed with /crops)
app.use("/crops", express.static(OUTPUTS_DIR));

// ─── Multer: accept only video files up to 500 MB ─────────────
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = ["video/mp4", "video/x-matroska", "video/avi", "video/quicktime"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ─── Helper: push SSE event to all listeners of a job ─────────
function pushSSE(jobId, event, data) {
  const job = jobs.get(jobId);
  if (!job) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  job.sseClients.forEach(res => {
    try { res.write(payload); } catch (_) {}
  });
}

// ─── Helper: format elapsed time ──────────────────────────────
function elapsed(startMs) {
  return `${((Date.now() - startMs) / 1000).toFixed(1)}s`;
}

// ═══════════════════════════════════════════════════════════════
//  POST /api/analyse
//  Body (multipart):
//    video      – the video file
//    attributes – JSON string: [{ name, priority }]
// ═══════════════════════════════════════════════════════════════
app.post("/api/analyse", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No video file received." });
  }

  let attributes;
  try {
    attributes = JSON.parse(req.body.attributes || "[]");
    if (!attributes.length) throw new Error("empty");
  } catch {
    return res.status(400).json({ error: "attributes must be a non-empty JSON array." });
  }

  const jobId     = uuid();
  const videoPath = req.file.path;

  // Initialise job entry
  jobs.set(jobId, {
    status:     "queued",
    progress:   0,
    result:     null,
    error:      null,
    sseClients: [],
    videoPath,
    startedAt:  Date.now(),
  });

  // Return jobId immediately; client will open SSE stream next
  res.json({ jobId });

  // ── Spawn Python in the background ──────────────────────────
  setImmediate(() => runPipeline(jobId, videoPath, attributes));
});

// ═══════════════════════════════════════════════════════════════
//  GET /api/progress/:jobId
//  Server-Sent Events stream for real-time progress updates.
// ═══════════════════════════════════════════════════════════════
app.get("/api/progress/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: "Job not found." });
  }

  // SSE headers
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  // Register this response as an SSE client
  job.sseClients.push(res);

  // If job already finished, replay the final event immediately
  if (job.status === "done") {
    res.write(`event: done\ndata: ${JSON.stringify(job.result)}\n\n`);
    res.end();
    return;
  }
  if (job.status === "error") {
    res.write(`event: error\ndata: ${JSON.stringify({ message: job.error })}\n\n`);
    res.end();
    return;
  }

  // Heartbeat keeps the connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch (_) { clearInterval(heartbeat); }
  }, 15_000);

  // Clean up when the client disconnects
  req.on("close", () => {
    clearInterval(heartbeat);
    const j = jobs.get(jobId);
    if (j) j.sseClients = j.sseClients.filter(c => c !== res);
  });
});

// ═══════════════════════════════════════════════════════════════
//  GET /api/result/:jobId
//  Fetch final result once polling confirms "done".
// ═══════════════════════════════════════════════════════════════
app.get("/api/result/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job)                    return res.status(404).json({ error: "Job not found." });
  if (job.status !== "done")   return res.status(202).json({ status: job.status, progress: job.progress });
  res.json(job.result);
});

// ─── Internal: spawn Python pipeline ──────────────────────────
function runPipeline(jobId, videoPath, attributes) {
  const job = jobs.get(jobId);
  job.status = "running";
  pushSSE(jobId, "progress", { step: "starting", progress: 2, message: "Pipeline initialising…" });

  const attrsJson = JSON.stringify(attributes);
  const args = [PIPELINE, videoPath, attrsJson, jobId, OUTPUTS_DIR];

  const py = spawn(PYTHON_BIN, args, { cwd: __dirname });

  let stdoutBuf = "";
  let stderrBuf = "";

  py.stdout.on("data", chunk => { stdoutBuf += chunk.toString(); });

  // Parse progress lines from Python logs (written to stderr)
  py.stderr.on("data", chunk => {
    const text = chunk.toString();
    stderrBuf += text;

    // Pattern: "[INFO] … Sampled N frames"
    if (text.includes("Sampled"))      pushSSE(jobId, "progress", { step: "sampling",   progress: 15, message: "Frames sampled" });
    if (text.includes("person crops")) pushSSE(jobId, "progress", { step: "detecting",  progress: 35, message: "Persons detected" });
    if (text.includes("crops processed")) {
      // Extract N/Total for fine-grained progress
      const m = text.match(/(\d+)\/(\d+) crops/);
      if (m) {
        const frac  = parseInt(m[1]) / parseInt(m[2]);
        const pct   = 35 + Math.round(frac * 50);
        pushSSE(jobId, "progress", { step: "attributes", progress: pct, message: `Analysing attributes (${m[1]}/${m[2]})` });
      }
    }
    if (text.includes("Pipeline done")) pushSSE(jobId, "progress", { step: "ranking", progress: 95, message: "Ranking results…" });
  });

  py.on("close", code => {
    if (code !== 0) {
      job.status = "error";
      job.error  = stderrBuf.slice(-500);
      pushSSE(jobId, "error", { message: "Pipeline failed. Check server logs." });
      console.error(`[job ${jobId}] Python exit ${code}\n${stderrBuf}`);
      return;
    }

    // Python prints JSON result to stdout
    let result;
    try {
      result = JSON.parse(stdoutBuf.trim());
    } catch {
      // Fall back: read the JSON sidecar file written by pipeline.py
      const sidecar = path.join(OUTPUTS_DIR, jobId, "result.json");
      if (fs.existsSync(sidecar)) {
        result = JSON.parse(fs.readFileSync(sidecar, "utf8"));
      } else {
        job.status = "error";
        job.error  = "Could not parse pipeline output.";
        pushSSE(jobId, "error", { message: job.error });
        return;
      }
    }

    // Rewrite crop_path to a URL the frontend can fetch
    result.matches = result.matches.map(m => ({
      ...m,
      image_url: `/crops/${jobId}/crops/${path.basename(m.crop_path)}`,
    }));

    job.status = "done";
    job.result = result;
    pushSSE(jobId, "done", result);

    // Keep job in memory for 30 min, then clean up
    setTimeout(() => {
      jobs.delete(jobId);
      fs.rmSync(path.join(OUTPUTS_DIR, jobId), { recursive: true, force: true });
      fs.unlinkSync(videoPath);
    }, 30 * 60 * 1000);

    console.log(`[job ${jobId}] done in ${elapsed(job.startedAt)} — ${result.matches.length} matches`);
  });
}

app.get("/", (req, res) => {
  res.json({
    status: "Backend Running",
    port: PORT
  });
});
// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`Backend ready on http://localhost:${PORT}`));
