import { NextRequest, NextResponse } from "next/server";
import { synthesize, voiceFor } from "@/lib/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { text, language, voice } = (await req.json()) as {
      text: string;
      language?: string;
      voice?: string;
    };
    if (!text?.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const audio = await synthesize(text.slice(0, 3000), voice || voiceFor(language));

    return new NextResponse(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err?.message ?? "TTS failed" },
      { status: 500 }
    );
  }
}
