import { NextRequest, NextResponse } from "next/server";
import { addProduct, getAllProducts, type NewProduct } from "@/lib/data";
import { indexProduct } from "@/lib/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getAllProducts());
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as NewProduct;

    if (!body?.name?.trim()) {
      return NextResponse.json(
        { error: "Product name is required." },
        { status: 400 }
      );
    }

    const product = addProduct({ ...body, manual: body.manual ?? "" });

    // Index the manual into MOSS so the assistant can retrieve from it. Don't
    // fail the request if indexing has a hiccup — chat retrieval will retry.
    const indexed = await indexProduct(product).catch(() => false);

    return NextResponse.json({ ...product, indexed }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to add product" },
      { status: 500 }
    );
  }
}
