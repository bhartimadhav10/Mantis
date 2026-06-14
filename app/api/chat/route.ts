import { NextRequest, NextResponse } from "next/server";
import { getProduct } from "@/lib/data";
import { diagnose, type ChatTurn } from "@/lib/agent";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { productId, history } = (await req.json()) as {
      productId: string;
      history: ChatTurn[];
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

    const result = await diagnose(product, history ?? []);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err?.message ?? "Diagnostic failed" },
      { status: 500 }
    );
  }
}
