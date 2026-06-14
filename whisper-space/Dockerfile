# HF Spaces (Docker SDK) serve on port 7860.
FROM python:3.11-slim

# ffmpeg lets faster-whisper decode mp3/other formats.
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

# Cache the model into a writable dir (HF Spaces run as non-root).
ENV HF_HOME=/tmp/hf
EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
