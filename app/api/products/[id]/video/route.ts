import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getProduct, addMaterial } from "@/lib/data";
import { addMaterialChunks, chunkText } from "@/lib/retrieval";
import { audioFromVideoBuffer, audioFromUrl, cleanup } from "@/lib/media";
import { transcribeAudio, transcribeEnabled, type Segment } from "@/lib/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// Group short Whisper segments into ~45s windows for "watch X-Y" citations.
function groupSegments(
  segs: Segment[],
  title: string,
  maxSec = 45,
  maxChars = 700
) {
  const chunks: { t0: number; t1: number; text: string }[] = [];
  let cur: { t0: number; t1: number; text: string } | null = null;
  for (const s of segs) {
    if (!cur) {
      cur = { t0: s.start, t1: s.end, text: s.text };
    } else if (s.end - cur.t0 > maxSec || (cur.text + " " + s.text).length > maxChars) {
      chunks.push(cur);
      cur = { t0: s.start, t1: s.end, text: s.text };
    } else {
      cur.t1 = s.end;
      cur.text += " " + s.text;
    }
  }
  if (cur) chunks.push(cur);

  return chunks
    .filter((c) => c.text.trim())
    .map((c) => ({
      text: c.text.trim(),
      location: `Video: ${title} (watch ${fmt(c.t0)}-${fmt(c.t1)})`,
      meta: { kind: "video", t0: String(Math.floor(c.t0)), t1: String(Math.floor(c.t1)) },
    }));
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const product = getProduct(params.id);
  if (!product) {
    return NextResponse.json({ error: "Unknown product" }, { status: 404 });
  }
  if (!transcribeEnabled()) {
    return NextResponse.json(
      {
        error:
          "Video transcription isn't configured yet. Set HF_TRANSCRIBE_URL (your Whisper HF Space) in .env.local.",
      },
      { status: 503 }
    );
  }

  let audioPath: string | undefined;
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const url = (form.get("url") as string | null)?.trim() || "";
    const title =
      (form.get("title") as string | null)?.trim() ||
      file?.name ||
      (url ? new URL(url).hostname : "Support video");

    let videoUrl = url;

    if (file) {
      const buf = Buffer.from(await file.arrayBuffer());
      // Save the uploaded video for download.
      const dir = path.join(process.cwd(), "public", "uploads", product.id);
      fs.mkdirSync(dir, { recursive: true });
      const fname = safeName(file.name);
      fs.writeFileSync(path.join(dir, fname), buf);
      videoUrl = `/uploads/${product.id}/${fname}`;
      audioPath = await audioFromVideoBuffer(buf);
    } else if (url) {
      audioPath = await audioFromUrl(url);
    } else {
      return NextResponse.json(
        { error: "Provide a video file or a video URL." },
        { status: 400 }
      );
    }

    // Transcribe ONCE; we persist the result so we never re-transcribe.
    const transcript = await transcribeAudio(audioPath);
    if (!transcript.text) {
      return NextResponse.json(
        { error: "Transcription returned no text." },
        { status: 422 }
      );
    }

    const idPrefix = `video-${safeName(title)}-${Date.now()}`;
    const chunks =
      transcript.segments.length > 0
        ? groupSegments(transcript.segments, title)
        : chunkText(transcript.text, `Video: ${title}`);

    const indexed = await addMaterialChunks(product, chunks, idPrefix);

    const material = {
      id: idPrefix,
      kind: "video" as const,
      title,
      url: videoUrl || undefined,
      addedAt: new Date().toISOString(),
      transcript: transcript.text,
    };
    addMaterial(product.id, material);

    return NextResponse.json({
      ok: true,
      material: { id: material.id, kind: material.kind, title, url: material.url },
      chunks: chunks.length,
      hasTimestamps: transcript.segments.length > 0,
      indexed,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err?.message ?? "Video processing failed" },
      { status: 500 }
    );
  } finally {
    cleanup(audioPath);
  }
}
