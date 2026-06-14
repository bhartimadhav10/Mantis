---
title: Mantis Whisper
emoji: 🎙️
colorFrom: purple
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Mantis Whisper transcription Space

A tiny FastAPI + faster-whisper service for the Mantis video pipeline.

**Endpoint:** `POST /transcribe` — multipart field `audio` (mp3) →
`{ "text": "...", "segments": [{ "start", "end", "text" }] }`

Point Mantis at it with, in `.env.local`:

```
HF_TRANSCRIBE_URL=https://<your-username>-<space-name>.hf.space/transcribe
```
