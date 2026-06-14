import { NextRequest, NextResponse } from "next/server";
import { getProduct, addMaterial } from "@/lib/data";
import { addMaterialChunks, chunkText } from "@/lib/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Strip an HTML page down to readable text (best-effort, no deps).
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const product = getProduct(params.id);
    if (!product) {
      return NextResponse.json({ error: "Unknown product" }, { status: 404 });
    }

    const { url, title } = (await req.json()) as { url: string; title?: string };
    if (!url?.trim()) {
      return NextResponse.json({ error: "A URL is required." }, { status: 400 });
    }
    let host = url;
    try {
      host = new URL(url).hostname;
    } catch {
      return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
    }
    const label = title?.trim() || host;

    // Best-effort: fetch the page text and index it so the assistant can use it.
    let indexed = false;
    let chunkCount = 0;
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (MantisBot)" },
      });
      if (res.ok) {
        const text = htmlToText(await res.text()).slice(0, 20000);
        if (text.length > 80) {
          const chunks = chunkText(text, `Link: ${label}`);
          chunkCount = chunks.length;
          indexed = await addMaterialChunks(
            product,
            chunks,
            `link-${encodeURIComponent(host)}`
          );
        }
      }
    } catch {
      // Still register the link as a browsable resource even if fetch failed.
    }

    const material = {
      id: `link-${Date.now()}`,
      kind: "link" as const,
      title: label,
      url,
      addedAt: new Date().toISOString(),
    };
    addMaterial(product.id, material);

    return NextResponse.json({ ok: true, material, indexed, chunks: chunkCount });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to add link" },
      { status: 500 }
    );
  }
}
