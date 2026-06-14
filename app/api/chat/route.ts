import { NextRequest, NextResponse } from "next/server";
import { getProduct } from "@/lib/data";
import { diagnose, analyzeImage, type ChatTurn } from "@/lib/agent";
import { retrieve } from "@/lib/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { productId, history, language, image } = (await req.json()) as {
      productId: string;
      history: ChatTurn[];
      language?: string;
      image?: string; // data URL of an uploaded photo
    };

    const product = getProduct(productId);
    if (!product) {
      return NextResponse.json({ error: "Unknown product" }, { status: 404 });
    }
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: "Server is missing GROQ_API_KEY (set it in .env.local)." },
        { status: 500 }
      );
    }

    let turns = history ?? [];

    // Image-based troubleshooting: analyse the photo and fold its description
    // into the latest user turn so the diagnosis can reason about it.
    let imageNote = "";
    if (image && turns.length) {
      imageNote = await analyzeImage(image, product.name);
      if (imageNote) {
        turns = turns.map((t, i) =>
          i === turns.length - 1 && t.role === "user"
            ? { ...t, content: `${t.content}\n\n[Photo the user attached shows: ${imageNote}]` }
            : t
        );
      }
    }

    // Build a retrieval query from the recent user turns (+ image note), then
    // ask MOSS for the most relevant manual passages to ground the diagnosis.
    const queryText = (
      turns
        .filter((t) => t.role === "user")
        .slice(-3)
        .map((t) => t.content)
        .join(" ") +
      " " +
      imageNote
    ).trim();

    const retrieval = await retrieve(product, queryText);
    const result = await diagnose(product, turns, retrieval?.passages, language);

    return NextResponse.json({
      ...result,
      imageAnalysis: imageNote || undefined,
      moss: retrieval
        ? { used: true, ms: retrieval.ms, count: retrieval.passages.length }
        : { used: false },
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err?.message ?? "Diagnostic failed" },
      { status: 500 }
    );
  }
}
