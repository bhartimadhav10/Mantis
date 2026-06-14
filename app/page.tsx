import { getAllProducts } from "@/lib/data";
import SearchableGrid from "./SearchableGrid";

export const dynamic = "force-dynamic";

export default function Home() {
  const products = getAllProducts();

  return (
    <div>
      <section className="hero">
        <div className="hero-row">
          <div>
            <h1>Diagnose any product like a technician would.</h1>
            <p>
              Pick a product and describe what&apos;s wrong. Mantis investigates
              by asking the right questions, rules out causes, and points you to
              the exact fix — every step traceable to the official manual.
            </p>
          </div>
          <a href="/add" className="btn-primary">
            ＋ Add a product
          </a>
        </div>
      </section>

      <SearchableGrid products={products} />
    </div>
  );
}
