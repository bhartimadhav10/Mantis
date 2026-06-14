import type { Product } from "./data";
import type { Passage } from "./retrieval";

// Single place that talks to the model. We use Groq's OpenAI-compatible
// chat-completions API with forced function-calling so the model always
// returns structured diagnostic output. Swap the URL/model here to retarget
// any other OpenAI-compatible provider (incl. MOSS) without touching the app.
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.MANTIS_MODEL || "llama-3.3-70b-versatile";
const VISION_MODEL =
  process.env.MANTIS_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

export type Cause = {
  cause: string;
  confidence: number; // 0..1
  status: "open" | "likely" | "eliminated";
};

export type Citation = { quote: string; location: string };

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type DiagnosticResult = {
  action: "ask" | "diagnose";
  message: string; // question to ask OR the diagnosis + recommended fix
  causes: Cause[]; // current hypotheses, ranked
  citations: Citation[]; // traceable back to the manual
};

const SYSTEM = `You are Mantis, an expert service technician for a specific product.
You diagnose problems the way a real mechanic does: by investigation and
elimination — NOT by dumping manual text or listing every possible cause.

RULES:
- Work from the PRODUCT MANUAL provided. Never invent facts not supported by it.
- Maintain a ranked list of candidate causes with confidence and status.
- Each turn, decide: ASK the single most discriminating follow-up question that
  eliminates the most candidates, OR DIAGNOSE if one cause is clearly most
  likely (confidence >= 0.8) or you have enough evidence.
- Ask ONE focused question at a time. Be concise and friendly.
- When you diagnose, give the probable root cause AND a concrete, safe fix with
  exact references (fuse numbers, figures, sections) from the manual.
- Every factual claim must be backed by a citation quoting the manual.
- In each citation's "location", copy the label shown in parentheses before the
  passage VERBATIM (including any "watch M:SS-M:SS" timestamp for videos). Never
  invent a section number.
- When a cited passage is a video (its label starts with "Video:" and has a
  "watch M:SS-M:SS" timestamp), explicitly tell the user which video and
  timestamp to watch.
- Use plain ASCII characters only. Use a hyphen (-) instead of em/en dashes, and
  straight quotes instead of smart quotes.
- Always call the report_diagnosis function. Never reply in plain text.`;

const TOOL = {
  type: "function",
  function: {
    name: "report_diagnosis",
    description: "Report the current diagnostic step.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["ask", "diagnose"],
          description: "ask a follow-up question, or give the diagnosis",
        },
        message: {
          type: "string",
          description:
            "What to show the user: a single follow-up question, or the diagnosis with a concrete recommended fix.",
        },
        causes: {
          type: "array",
          description: "Ranked candidate causes considered so far.",
          items: {
            type: "object",
            properties: {
              cause: { type: "string" },
              confidence: { type: "number" },
              status: {
                type: "string",
                enum: ["open", "likely", "eliminated"],
              },
            },
            required: ["cause", "confidence", "status"],
          },
        },
        citations: {
          type: "array",
          description: "Manual excerpts supporting the reasoning.",
          items: {
            type: "object",
            properties: {
              quote: { type: "string" },
              location: {
                type: "string",
                description: "e.g. 'Section 4.3 — Horn'",
              },
            },
            required: ["quote", "location"],
          },
        },
      },
      required: ["action", "message", "causes", "citations"],
    },
  },
};

// Safety net: Groq's tool-call argument encoding can turn UTF-8 punctuation
// (em dashes, smart quotes) into "mojibake" like "â€"". Fix the common cases.
function fixText(s: string): string {
  if (!s) return s;
  return s
    .replace(/â€”/g, "-") // em dash
    .replace(/â€“/g, "-") // en dash
    .replace(/â€˜/g, "'") // left single quote
    .replace(/â€™/g, "'") // right single quote / apostrophe
    .replace(/â€œ/g, '"') // left double quote
    .replace(/â€/g, '"') // right double quote
    .replace(/â€/g, "-"); // any leftover
}

// Image-based troubleshooting: describe an uploaded photo (error light, broken
// part, warning indicator) using a Groq vision model, so its description can be
// fed into the diagnostic loop. Returns "" on failure (feature degrades safely).
export async function analyzeImage(
  imageDataUrl: string,
  productName: string
): Promise<string> {
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `This is a photo related to a ${productName}. Describe precisely what you see that is relevant to diagnosing a fault: any warning lights and their colour/state, error codes/text on a display, visible damage, broken or worn parts, leaks, or burn marks. Be specific and factual; do not speculate about causes.`,
              },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || "";
  } catch {
    return "";
  }
}

export async function diagnose(
  product: Product,
  history: ChatTurn[],
  passages?: Passage[] | null,
  language?: string
): Promise<DiagnosticResult> {
  // When MOSS returns relevant passages, diagnose from those (precise + scales
  // to large manuals). Otherwise fall back to the full manual text.
  const knowledge =
    passages && passages.length
      ? passages
          .map(
            (p, i) =>
              `[${i + 1}] (${p.location}) ${p.text}`
          )
          .join("\n\n")
      : product.manual;

  const knowledgeLabel =
    passages && passages.length
      ? "RELEVANT MANUAL PASSAGES (retrieved by semantic search)"
      : "PRODUCT MANUAL";

  const body = {
    model: MODEL,
    temperature: 0.3,
    tools: [TOOL],
    tool_choice: {
      type: "function",
      function: { name: "report_diagnosis" },
    },
    messages: [
      {
        role: "system",
        content:
          SYSTEM +
          (language && language !== "Auto"
            ? `\n- IMPORTANT: Write the "message" field in ${language}. Keep citation quotes in their original language.`
            : `\n- Write the "message" field in the same language the user is writing in.`),
      },
      {
        role: "user",
        content: `PRODUCT: ${product.name} (${product.category})\n\n${knowledgeLabel}:\n"""\n${knowledge}\n"""\n\nUse the text above as your only source of truth for the conversation that follows.`,
      },
      {
        role: "assistant",
        content:
          "Understood. I'll diagnose issues with this product like a technician, asking one question at a time and citing the manual.",
      },
      ...history,
    ],
  };

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Groq API error (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  const args = call?.function?.arguments;

  if (!args) {
    return {
      action: "ask",
      message:
        "Sorry, I couldn't process that. Could you describe the problem again?",
      causes: [],
      citations: [],
    };
  }

  try {
    const parsed = JSON.parse(args) as DiagnosticResult;
    return {
      action: parsed.action === "diagnose" ? "diagnose" : "ask",
      message: fixText(parsed.message ?? ""),
      causes: Array.isArray(parsed.causes)
        ? parsed.causes.map((c) => ({ ...c, cause: fixText(c.cause) }))
        : [],
      citations: Array.isArray(parsed.citations)
        ? parsed.citations.map((c) => ({
            quote: fixText(c.quote),
            location: fixText(c.location),
          }))
        : [],
    };
  } catch {
    return {
      action: "ask",
      message: typeof args === "string" ? args : "Could you tell me more?",
      causes: [],
      citations: [],
    };
  }
}
