"""
Mantis transcription endpoint — a Hugging Face Space (Docker SDK) that runs
faster-whisper and matches the contract Mantis expects:

  POST /transcribe   multipart/form-data, file field "audio" (mp3)
  ->  { "text": "...", "segments": [ {"start": 0.0, "end": 5.2, "text": "..."} ] }
"""
from fastapi import FastAPI, UploadFile, File
from faster_whisper import WhisperModel
import tempfile, os

app = FastAPI()

# "base" is a good speed/accuracy balance on the free CPU tier.
# Use "tiny" for faster, "small"/"medium" for more accuracy (needs more RAM/GPU).
model = WhisperModel("base", device="cpu", compute_type="int8")


@app.get("/")
def health():
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as f:
        f.write(await audio.read())
        path = f.name
    try:
        segments, _info = model.transcribe(path, beam_size=1)
        segs, full = [], []
        for s in segments:
            t = s.text.strip()
            segs.append({"start": s.start, "end": s.end, "text": t})
            full.append(t)
        return {"text": " ".join(full), "segments": segs}
    finally:
        os.remove(path)
