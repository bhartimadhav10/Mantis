"use client";

import { useMemo, useState } from "react";
import Thumb from "./Thumb";
import type { Product } from "@/lib/data";

export default function SearchableGrid({ products }: { products: Product[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return products;
    return products.filter((p) =>
      `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(t)
    );
  }, [q, products]);

  return (
    <div>
      <input
        className="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍  Search products by name, category, or description…"
      />

      {filtered.length === 0 ? (
        <div className="empty" style={{ marginTop: 24 }}>
          No products match “{q}”.
        </div>
      ) : (
        <div className="grid">
          {filtered.map((p) => (
            <a key={p.id} href={`/products/${p.id}`} className="card">
              <Thumb
                emoji={p.emoji}
                accent={p.accent}
                image={p.image}
                className="card-thumb"
              />
              <div className="card-body">
                <span className="pill">{p.category}</span>
                <h3>{p.name}</h3>
                <p>{p.description}</p>
                <span className="card-cta">Ask the assistant →</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
