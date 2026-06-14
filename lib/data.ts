// Catalog store. For the hackathon MVP a product's full manual fits in the
// model's context, so we attach manual text directly instead of running a
// vector DB. Products are persisted to data/products.json so companies can add
// their own at runtime. Swap this for a real DB + RAG later without touching
// the agent.

import fs from "fs";
import path from "path";

export type Material = {
  id: string;
  kind: "pdf" | "video" | "link" | "text";
  title: string;
  url?: string; // download path (/uploads/...) or external/video link
  addedAt?: string;
  // For videos: the saved transcript so we never re-transcribe.
  transcript?: string;
};

export type Product = {
  id: string;
  name: string;
  category: string;
  description: string;
  emoji: string;
  accent: string; // CSS gradient used for the product "photo" tile
  image?: string; // optional real image path (e.g. /products/scooter.jpg)
  specs: { label: string; value: string }[];
  manual: string;
  materials?: Material[];
};

const DEFAULTS: Product[] = [
  {
    id: "zephyr-e1",
    name: "Zephyr E1 Electric Scooter",
    category: "Electric Mobility",
    description:
      "Urban electric scooter with a 48V system, regenerative braking, and a 40 km range.",
    emoji: "🛵",
    accent: "linear-gradient(135deg, #00c896 0%, #0a8f6e 45%, #1e1a2b 100%)",
    image: "/products/scooter.jpg",
    specs: [
      { label: "Battery", value: "48V Li-ion" },
      { label: "Range", value: "40 km" },
      { label: "Top speed", value: "25 km/h" },
    ],
    manual: `ZEPHYR E1 - SERVICE MANUAL (EXCERPTS)

SECTION 4 - ELECTRICAL SYSTEM
The E1 runs on a 48V lithium battery feeding a central fuse box beneath the
front panel. Remove the four Phillips screws on the front panel to access it.

Fuse layout (Figure 4.2, front fuse box):
- F1 (30A) - Motor controller main
- F2 (15A) - Lighting circuit (headlight, tail light, indicators)
- F3 (10A) - Horn and low-voltage accessories
- F4 (5A)  - Dashboard / display unit

SECTION 4.3 - HORN
The horn is powered through fuse F3 (10A) and triggered by the left-hand horn
button. The horn relay (R2) sits next to the fuse box. Symptoms and causes:
- Completely silent horn, lights work normally: most likely a blown F3 fuse or
  a failed horn unit. Check F3 first.
- Weak or distorted horn sound: usually a failing horn unit or low battery
  voltage, NOT the fuse (a blown fuse gives no sound at all).
- Horn and lights both dead: suspect a main wiring or battery issue, not F3.
- Horn worked then died suddenly after a bump or service: likely a loose
  connector at the horn button (J7) or relay R2.

SECTION 4.4 - LIGHTING
Headlight and indicators run on fuse F2 (15A). If lights are dim, check battery
state of charge before suspecting the fuse.

SECTION 6 - BATTERY & CHARGING
Charge fully before first use. A battery that drains overnight while parked
indicates a parasitic draw - check the dashboard unit (F4) which can stay live
if the main switch contact sticks.

SECTION 8 - MAINTENANCE SCHEDULE
- Brake pads: inspect every 1,000 km
- Tyre pressure: check every 2 weeks (recommended 45 PSI)
- Firmware: update via the companion app quarterly`,
  },
  {
    id: "purewave-x",
    name: "PureWave X Water Purifier",
    category: "Home Appliances",
    description:
      "Under-sink RO + UV water purifier with a 4-stage filtration system and smart leak sensor.",
    emoji: "💧",
    accent: "linear-gradient(135deg, #3aa0ff 0%, #2356c8 45%, #1e1a2b 100%)",
    image: "/products/purifier.jpg",
    specs: [
      { label: "Stages", value: "4 (RO + UV)" },
      { label: "Tank", value: "8 L" },
      { label: "Sensor", value: "Smart leak" },
    ],
    manual: `PUREWAVE X - OWNER & SERVICE MANUAL (EXCERPTS)

SECTION 2 - FILTRATION STAGES
Stage 1: Sediment filter (white)  - replace every 6 months
Stage 2: Carbon block (black)     - replace every 6 months
Stage 3: RO membrane              - replace every 24 months
Stage 4: UV lamp                  - replace every 12 months

SECTION 5 - INDICATOR LIGHTS (front panel)
- Solid GREEN: normal operation
- Blinking BLUE: filter replacement due soon
- Solid RED: UV lamp failure OR water flow fault - see Section 6
- Blinking RED + beeping: leak sensor triggered, unit has shut the inlet valve

SECTION 6 - TROUBLESHOOTING
No water / very slow flow:
- First check the inlet valve is fully open.
- Low input pressure (below 0.3 MPa) starves the RO membrane; a booster pump
  may be required.
- A clogged Stage 1 sediment filter is the most common cause of slow flow after
  6+ months of use.

Water tastes bad / odour:
- Usually an exhausted carbon block (Stage 2). Replace it.
- A fouled RO membrane can also cause taste issues if overdue.

Red light, no leak:
- Solid RED with normal water flow almost always means the UV lamp has failed.
- Solid RED with no/low flow points to a flow-sensor or pressure fault instead.

SECTION 9 - MAINTENANCE SCHEDULE
See Section 2 for filter intervals. Sanitise the storage tank annually.`,
  },
];

// ---- File-backed store ----------------------------------------------------

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "products.json");

function ensureStore(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(DEFAULTS, null, 2), "utf8");
  }
}

export function getAllProducts(): Product[] {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8")) as Product[];
  } catch {
    return DEFAULTS;
  }
}

export function getProduct(id: string): Product | undefined {
  return getAllProducts().find((p) => p.id === id);
}

function saveAll(products: Product[]): void {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(products, null, 2), "utf8");
}

// Attach a material (PDF / video / link) to a product and persist it.
export function addMaterial(
  productId: string,
  material: Material
): Product | undefined {
  const products = getAllProducts();
  const product = products.find((p) => p.id === productId);
  if (!product) return undefined;
  product.materials = [...(product.materials ?? []), material];
  saveAll(products);
  return product;
}

const ACCENTS = [
  "linear-gradient(135deg, #7b2fbe 0%, #4a1d73 45%, #1e1a2b 100%)",
  "linear-gradient(135deg, #ff8c42 0%, #c0492b 45%, #1e1a2b 100%)",
  "linear-gradient(135deg, #00c896 0%, #0a8f6e 45%, #1e1a2b 100%)",
  "linear-gradient(135deg, #3aa0ff 0%, #2356c8 45%, #1e1a2b 100%)",
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export type NewProduct = {
  name: string;
  category: string;
  description: string;
  manual: string;
  emoji?: string;
  image?: string;
  specs?: { label: string; value: string }[];
};

export function addProduct(input: NewProduct): Product {
  const products = getAllProducts();

  // Unique id derived from the name.
  const base = slugify(input.name) || "product";
  let id = base;
  let n = 2;
  while (products.some((p) => p.id === id)) id = `${base}-${n++}`;

  const product: Product = {
    id,
    name: input.name.trim(),
    category: input.category.trim() || "Uncategorized",
    description: input.description.trim(),
    manual: input.manual.trim(),
    emoji: input.emoji?.trim() || "📦",
    image: input.image?.trim() || undefined,
    accent: ACCENTS[products.length % ACCENTS.length],
    specs: (input.specs ?? []).filter((s) => s.label && s.value),
  };

  products.push(product);
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(products, null, 2), "utf8");
  return product;
}
