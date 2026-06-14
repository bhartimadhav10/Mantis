import { MossClient } from "@moss-dev/moss";
import type { Product } from "./data";

// Retrieval layer: MOSS is the vector database. We chunk each product's manual,
// index it in MOSS, and at diagnosis time retrieve the most relevant passages.
// Everything degrades gracefully: if MOSS creds are missing or a call fails,
// the caller falls back to feeding the full manual to the LLM.

export type Passage = { text: string; location: string; score: number };
export type RetrievalResult = {
  used: boolean; // did MOSS actually serve this?
  passages: Passage[];
  ms: number; // query latency reported by MOSS
};

// Singleton client: loadIndex() caches the index in this instance's memory, so
// we must reuse the same client across requests for fast local queries.
let _client: MossClient | null | undefined;
function client(): MossClient | null {
  if (_client !== undefined) return _client;
  const id = process.env.MOSS_PROJECT_ID;
  const key = process.env.MOSS_PROJECT_KEY;
  _client = id && key ? new MossClient(id, key) : null;
  return _client;
}

export function mossEnabled(): boolean {
  return !!(process.env.MOSS_PROJECT_ID && process.env.MOSS_PROJECT_KEY);
}

const indexName = (productId: string) => `mantis-${productId}`;

// Split a manual into citeable chunks. Prefer "SECTION ..." boundaries; fall
// back to blank-line paragraphs. The first line becomes the citation location.
export function chunkManual(manual: string): { text: string; location: string }[] {
  const bySection = manual
    .split(/\n(?=SECTION )/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const raw =
    bySection.length > 1
      ? bySection
      : manual
          .split(/\n\s*\n/)
          .map((s) => s.trim())
          .filter(Boolean);

  return raw.map((text) => {
    const firstLine = text.split("\n")[0].trim();
    const location =
      firstLine.length > 0 && firstLine.length <= 80 ? firstLine : "Manual";
    return { text, location };
  });
}

// Generic chunker for free-form text (PDF body, transcript) without SECTION
// headers: groups paragraphs into ~maxChars chunks under one location label.
export function chunkText(
  text: string,
  location: string,
  maxChars = 900
): { text: string; location: string }[] {
  const paras = text
    .split(/\n\s*\n/)
    .map((s) => s.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);

  const out: string[] = [];
  let buf = "";
  for (const p of paras) {
    if (buf && (buf + " " + p).length > maxChars) {
      out.push(buf);
      buf = p;
    } else {
      buf = buf ? buf + " " + p : p;
    }
  }
  if (buf) out.push(buf);
  return out.map((t) => ({ text: t, location }));
}

// Module-level memo so we don't re-create / re-load indexes every request
// (resets on dev hot-reload, which is fine).
const ensured = new Set<string>();
const loaded = new Set<string>();
const CACHE_PATH = ".moss-cache";

async function ensureIndexed(c: MossClient, product: Product): Promise<void> {
  const name = indexName(product.id);
  if (ensured.has(name)) return;

  try {
    await c.getIndex(name); // throws if it doesn't exist
    ensured.add(name);
    return;
  } catch {
    // not found -> create it
  }

  let base = chunkManual(product.manual);
  // A product can start with no manual text (PDF/links only). Seed with the
  // name + description so the index is never empty.
  if (base.length === 0) {
    base = [
      {
        text: `${product.name}. ${product.category}. ${product.description}`,
        location: "Product overview",
      },
    ];
  }
  const docs = base.map((ch, i) => ({
    id: `c${i}`,
    text: ch.text,
    metadata: { location: ch.location },
  }));
  await c.createIndex(name, docs);
  ensured.add(name);
}

export async function indexProduct(product: Product): Promise<boolean> {
  const c = client();
  if (!c) return false;
  try {
    // Re-create so edits to the manual are reflected.
    ensured.delete(indexName(product.id));
    loaded.delete(indexName(product.id));
    try {
      await c.deleteIndex(indexName(product.id));
    } catch {}
    await ensureIndexed(c, product);
    return true;
  } catch (e) {
    console.error("MOSS indexProduct failed:", (e as Error)?.message);
    return false;
  }
}

// Add extra material (PDF text, video transcript) into a product's index.
// idPrefix keeps ids unique per material; meta is merged into each doc's
// metadata (e.g. { kind, source, t0, t1 } for video timestamps).
export async function addMaterialChunks(
  product: Product,
  chunks: { text: string; location: string; meta?: Record<string, string> }[],
  idPrefix: string
): Promise<boolean> {
  const c = client();
  if (!c || chunks.length === 0) return false;
  try {
    await ensureIndexed(c, product);
    const name = indexName(product.id);
    const docs = chunks.map((ch, i) => ({
      id: `${idPrefix}-${i}`,
      text: ch.text,
      metadata: { location: ch.location, ...(ch.meta ?? {}) },
    }));
    await c.addDocs(name, docs, { upsert: true });
    loaded.delete(name); // force a fresh loadIndex so new docs are searchable
    return true;
  } catch (e) {
    console.error("MOSS addMaterialChunks failed:", (e as Error)?.message);
    return false;
  }
}

export async function retrieve(
  product: Product,
  query: string,
  topK = 4
): Promise<RetrievalResult | null> {
  const c = client();
  if (!c || !query.trim()) return null;

  try {
    await ensureIndexed(c, product);

    const name = indexName(product.id);
    if (!loaded.has(name)) {
      try {
        await c.loadIndex(name, { cachePath: CACHE_PATH });
        loaded.add(name);
      } catch {
        // querying still works against the cloud endpoint
      }
    }

    let res;
    for (let i = 0; i < 3; i++) {
      try {
        res = await c.query(name, query, { topK });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    if (!res) return null;

    return {
      used: true,
      ms: res.timeTakenInMs ?? 0,
      passages: res.docs.map((d) => ({
        text: d.text,
        location: d.metadata?.location || "Manual",
        score: d.score,
      })),
    };
  } catch (e) {
    console.error("MOSS retrieve failed:", (e as Error)?.message);
    return null;
  }
}
