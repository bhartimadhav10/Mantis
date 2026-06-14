import { notFound } from "next/navigation";
import { getProduct } from "@/lib/data";
import Thumb from "@/app/Thumb";
import Chat from "./Chat";

export default function ProductPage({ params }: { params: { id: string } }) {
  const product = getProduct(params.id);
  if (!product) notFound();

  return (
    <div>
      <a href="/" className="back">
        ← All products
      </a>

      <section className="product-hero">
        <Thumb
          emoji={product.emoji}
          accent={product.accent}
          image={product.image}
          className="hero-thumb"
        />
        <div className="product-hero-info">
          <span className="pill">{product.category}</span>
          <h1>{product.name}</h1>
          <p>{product.description}</p>
          <div className="specs">
            {product.specs.map((s) => (
              <div className="spec" key={s.label}>
                <span className="spec-label">{s.label}</span>
                <span className="spec-value">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <h2 className="section-title">🔧 Diagnostic Assistant</h2>
      <Chat productId={product.id} productName={product.name} />
    </div>
  );
}
