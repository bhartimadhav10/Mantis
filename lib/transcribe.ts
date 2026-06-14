import fs from "fs";

// Adapter for your Hugging Face Space running Whisper (or any ASR model).
//
// CONTRACT your HF Space must implement:
//   POST  ${HF_TRANSCRIBE_URL}
//   Body: multipart/form-data with a file field named "audio" (mp3, 16kHz mono)
//   Auth: optional  "Authorization: Bearer ${HF_TOKEN}"
//   Returns JSON (Whisper's native shape):
//     {
//       "text": "full transcript ...",
//       "segments": [ { "start": 0.0, "end": 5.2, "text": "..." }, ... ]
//     }
//   "segments" is optional but enables "watch 3:25-4:10" citations.

export type Segment = { start: number; end: number; text: string };
export type Transcript = { text: string; segments: Segment[] };

export function transcribeEnabled(): boolean {
  return !!process.env.HF_TRANSCRIBE_URL;
}

export async function transcribeAudio(audioPath: string): Promise<Transcript> {
  const url = process.env.HF_TRANSCRIBE_URL;
  if (!url) {
    throw new Error(
      "Transcription endpoint not configured. Set HF_TRANSCRIBE_URL in .env.local."
    );
  }

  const bytes = fs.readFileSync(audioPath);
  const form = new FormData();
  form.append("audio", new Blob([bytes], { type: "audio/mpeg" }), "audio.mp3");

  const headers: Record<string, string> = {};
  if (process.env.HF_TOKEN) headers.Authorization = `Bearer ${process.env.HF_TOKEN}`;

  const res = await fetch(url, { method: "POST", body: form, headers });
  if (!res.ok) {
    throw new Error(
      `HF transcription failed (${res.status}): ${(await res.text()).slice(0, 200)}`
    );
  }

  const data: any = await res.json();
  const text: string = data.text ?? data.transcription ?? "";
  const segments: Segment[] = Array.isArray(data.segments)
    ? data.segments.map((s: any) => ({
        start: Number(s.start) || 0,
        end: Number(s.end) || 0,
        text: String(s.text ?? "").trim(),
      }))
    : [];

  return { text: text.trim(), segments };
}
