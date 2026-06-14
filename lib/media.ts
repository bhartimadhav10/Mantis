import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import ffmpegPath from "ffmpeg-static";
import ytdl from "@distube/ytdl-core";

// Audio extraction for the video pipeline. Uses the bundled ffmpeg binary
// (no system install). Output is mp3, mono, 16kHz — small and ASR-friendly.

function tmpFile(ext: string): string {
  return path.join(
    os.tmpdir(),
    `mantis-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  );
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("ffmpeg binary not found"));
    const proc = spawn(ffmpegPath, args);
    let err = "";
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error("ffmpeg failed: " + err.slice(-300)))
    );
  });
}

const TO_MP3 = ["-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", "-y"];

export async function audioFromVideoBuffer(buf: Buffer): Promise<string> {
  const inPath = tmpFile("bin");
  const outPath = tmpFile("mp3");
  fs.writeFileSync(inPath, buf);
  try {
    await runFfmpeg(["-i", inPath, ...TO_MP3, outPath]);
    return outPath;
  } finally {
    if (fs.existsSync(inPath)) fs.unlinkSync(inPath);
  }
}

export async function audioFromUrl(url: string): Promise<string> {
  // YouTube (and similar) -> grab the audio-only stream, then transcode.
  if (ytdl.validateURL(url)) {
    const dl = tmpFile("webm");
    await new Promise<void>((resolve, reject) => {
      const stream = ytdl(url, { filter: "audioonly", quality: "highestaudio" });
      const out = fs.createWriteStream(dl);
      stream.on("error", reject);
      out.on("error", reject);
      out.on("finish", () => resolve());
      stream.pipe(out);
    });
    const outPath = tmpFile("mp3");
    try {
      await runFfmpeg(["-i", dl, ...TO_MP3, outPath]);
      return outPath;
    } finally {
      if (fs.existsSync(dl)) fs.unlinkSync(dl);
    }
  }

  // Direct media URL (.mp4/.mov/.mp3...): download then transcode.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch media URL (${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  return audioFromVideoBuffer(buf);
}

export function cleanup(p?: string): void {
  if (p && fs.existsSync(p)) {
    try {
      fs.unlinkSync(p);
    } catch {}
  }
}
