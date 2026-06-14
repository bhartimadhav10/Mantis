import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

// Free, high-quality neural TTS via Microsoft Edge's voices. Runs server-side
// and returns mp3 bytes. Voice is chosen to match the chat language.
const VOICES: Record<string, string> = {
  Auto: "en-US-AriaNeural",
  English: "en-US-AriaNeural",
  // Hindi (India) voice handles code-mixed Hinglish naturally — pronounces both
  // Hindi and English words authentically. Use hi-IN-MadhurNeural for a male voice.
  Hinglish: "hi-IN-SwaraNeural",
  Hindi: "hi-IN-SwaraNeural",
  Spanish: "es-ES-ElviraNeural",
  French: "fr-FR-DeniseNeural",
  German: "de-DE-KatjaNeural",
  Arabic: "ar-SA-ZariyahNeural",
  Tamil: "ta-IN-PallaviNeural",
};

export function voiceFor(language?: string): string {
  return VOICES[language || "Auto"] || VOICES.Auto;
}

export async function synthesize(text: string, voice: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    audioStream.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
    audioStream.on("end", () => resolve(Buffer.concat(chunks)));
    audioStream.on("error", reject);
  });
}
