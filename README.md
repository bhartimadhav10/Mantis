<div align="center">

<br/>

```
███╗   ███╗ █████╗ ███╗   ██╗████████╗██╗███████╗
████╗ ████║██╔══██╗████╗  ██║╚══██╔══╝██║██╔════╝
██╔████╔██║███████║██╔██╗ ██║   ██║   ██║███████╗
██║╚██╔╝██║██╔══██║██║╚██╗██║   ██║   ██║╚════██║
██║ ╚═╝ ██║██║  ██║██║ ╚████║   ██║   ██║███████║
╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝╚══════╝
```

### **Assistant for Your Products**

An intelligent diagnostic assistant that troubleshoots products like a
technician — by investigation and elimination — using each product's own
documentation, with every answer traceable to the source.

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge)]()
[![MOSS](https://img.shields.io/badge/Retrieval-MOSS-7B2FBE?style=for-the-badge)]()
[![Groq](https://img.shields.io/badge/LLM-Groq-00C896?style=for-the-badge)]()

<br/>

</div>

---

## What it is

Manuals are long, scattered across PDFs, sites and videos, and nobody reads
them — so people call a technician for things they could fix themselves.

**Mantis** is a platform where companies list products and attach their support
material, and every product gets a dedicated **diagnostic assistant**. The
assistant does **not** dump manual text at you like a search box. It behaves
like a mechanic: it asks the single most useful question, rules causes in and
out, and arrives at a probable diagnosis with a concrete fix — every claim
**cited back to the official documentation**.

---

## Key features

| | Feature | Notes |
|---|---|---|
| 🔧 | **Diagnostic assistant** | Hypothesis-driven loop: ask → eliminate → diagnose. Structured output with ranked candidate causes and confidence. |
| 🔎 | **MOSS-powered retrieval** | Each product's materials are chunked and indexed in **MOSS** (semantic vector search, sub-10ms). The assistant retrieves the relevant passages, then reasons over them. |
| 📚 | **Knowledge repository** | Companies upload **manual text, PDFs, external links, and videos**. All are indexed for the assistant and browsable/downloadable by users. |
| 🎬 | **Video support** | Videos (upload or YouTube/URL) are transcribed **once** via a Whisper HF Space; the assistant cites the exact timestamp to watch (e.g. *"watch 2:10–2:40"*). |
| 📷 | **Image troubleshooting** | Upload a photo of an error light / damaged part — a vision model describes it and folds it into the diagnosis. |
| 🎤 | **Voice** | Hands-free: speak your problem (Web Speech API) and have replies read aloud. |
| 🌍 | **Multi-language** | Ask and get answers in multiple languages. |
| 🛒 | **Marketplace** | Browse, **search**, and add products (manual / PDF / links in one form). |

---

## Architecture

```
                       ┌─────────────────────────────────────────┐
   Company adds        │            INGESTION (once)              │
   materials  ───────► │  manual text ─┐                          │
                       │  PDF  ─► text ─┤► chunk ─► MOSS index     │
                       │  link ─► text ─┤        (per product)     │
                       │  video ─► audio ─► Whisper(HF) ─► chunks  │
                       └─────────────────────────────────────────┘
                                          │
   User asks a                            ▼
   question  ───────►  MOSS.query(symptoms)  ─►  top passages
                                          │
                                          ▼
                          Groq LLM (technician prompt, tool-calling)
                                          │
                                          ▼
                  question / diagnosis + ranked causes + citations
```

- **MOSS** is the vector database / retrieval layer — it stores chunks, embeds
  them, and serves semantic search. No separate vector DB is needed.
- **Groq** (Llama 3.3 70B) does the diagnostic reasoning with forced
  function-calling, so every turn returns structured `{action, message, causes,
  citations}`.
- If MOSS is unavailable, the assistant gracefully falls back to feeding the
  full manual to the LLM.

---

## Tech stack

- **Next.js 14** (App Router, TypeScript) — UI + API routes
- **MOSS** (`@moss-dev/moss`) — semantic retrieval / vector store
- **Groq** — LLM (`llama-3.3-70b-versatile`) + vision (`llama-4-scout`)
- **Hugging Face Space** (FastAPI + faster-whisper) — video transcription
- **ffmpeg-static** + **ytdl-core** — audio extraction; **pdf-parse** — PDF text
- Storage: JSON catalog + local file uploads (swap for a DB/Blob in production)

---

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev                  # http://localhost:3000
```

### Environment variables (`.env.local`)

```bash
GROQ_API_KEY=gsk_...                 # https://console.groq.com/keys
MANTIS_MODEL=llama-3.3-70b-versatile
MANTIS_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

MOSS_PROJECT_ID=...                  # https://moss.dev (free tier)
MOSS_PROJECT_KEY=moss_...

# Video transcription (optional — PDF/text/links work without it)
HF_TRANSCRIBE_URL=https://<user>-<space>.hf.space/transcribe
HF_TOKEN=hf_...                      # only if the Space is private
```

> Without MOSS keys the app still runs (falls back to full-manual context).
> Without `HF_TRANSCRIBE_URL` everything works except video.

### Whisper transcription Space

A ready-to-deploy Hugging Face Space lives in [`whisper-space/`](./whisper-space)
(FastAPI + faster-whisper, Docker SDK). Deploy it, then set `HF_TRANSCRIBE_URL`.
Contract:

```
POST /transcribe   multipart field "audio" (mp3)
->  { "text": "...", "segments": [ { "start", "end", "text" } ] }
```

---

## Deployment

Deploy to **Render** (or Railway) — a persistent container so runtime
product-adding, uploads, and ffmpeg all work as they do locally. A
[`render.yaml`](./render.yaml) blueprint is included; set the secret env vars in
the dashboard. (Vercel works for the read/diagnose core, but its serverless
filesystem breaks runtime uploads/adds without swapping to KV + Blob storage.)

---

## Project structure

```
app/
  page.tsx                 catalog + search
  add/page.tsx             add product (manual / PDF / links)
  products/[id]/           product page + chat + materials
  api/
    chat/                  diagnostic agent endpoint
    products/              create product
    products/[id]/pdf      PDF upload  -> MOSS
    products/[id]/link     link ingest -> MOSS
    products/[id]/video    video -> audio -> Whisper -> MOSS
lib/
  agent.ts                 Groq diagnostic loop + vision
  retrieval.ts             MOSS indexing + retrieval + chunking
  media.ts                 ffmpeg audio extraction
  transcribe.ts            HF Whisper adapter
  data.ts                  catalog store
whisper-space/             deployable HF Whisper Space
```

---

<div align="center">

*Built for the PClub × MOSS hackathon.*

</div>
```
