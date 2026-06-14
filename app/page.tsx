import { PRODUCTS } from "@/lib/data";
import Thumb from "./Thumb";

export default function Home() {
  return (
    <div>
      <section className="hero">
        <h1>Diagnose any product like a technician would.</h1>
        <p>
          Pick a product and describe what&apos;s wrong. Mantis investigates by
          asking the right questions, rules out causes, and points you to the
          exact fix — every step traceable to the official manual.
        </p>
      </section>

      <div className="grid">
        {PRODUCTS.map((p) => (
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
    </div>
  );
}
