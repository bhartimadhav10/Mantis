import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getProduct, addMaterial } from "@/lib/data";
import { addMaterialChunks, chunkText } from "@/lib/retrieval";
import { PDFParse } from "pdf-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
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

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are supported here." },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());

    // Save for user download.
    const dir = path.join(process.cwd(), "public", "uploads", product.id);
    fs.mkdirSync(dir, { recursive: true });
    const fname = safeName(file.name);
    fs.writeFileSync(path.join(dir, fname), buf);
    const url = `/uploads/${product.id}/${fname}`;

    // Extract text, chunk it, and index into the product's MOSS index.
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    let text = "";
    try {
      const parsed = await parser.getText();
      text = (parsed?.text || "").trim();
    } finally {
      await parser.destroy();
    }
    if (!text) {
      return NextResponse.json(
        { error: "Couldn't extract text from this PDF (is it a scan/image?)." },
        { status: 422 }
      );
    }

    const chunks = chunkText(text, `${file.name} (PDF)`);
    const idPrefix = `pdf-${safeName(file.name)}`;
    const indexed = await addMaterialChunks(product, chunks, idPrefix);

    const material = {
      id: idPrefix,
      kind: "pdf" as const,
      title: file.name,
      url,
    };
    addMaterial(product.id, material);

    return NextResponse.json({
      ok: true,
      material,
      chunks: chunks.length,
      indexed,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err?.message ?? "PDF upload failed" },
      { status: 500 }
    );
  }
}
