import type { Product } from "./data";

// Single place that talks to the model. We use Groq's OpenAI-compatible
// chat-completions API with forced function-calling so the model always
// returns structured diagnostic output. Swap the URL/model here to retarget
// any other OpenAI-compatible provider (incl. MOSS) without touching the app.
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.MANTIS_MODEL || "llama-3.3-70b-versatile";

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

export async function diagnose(
  product: Product,
  history: ChatTurn[]
): Promise<DiagnosticResult> {
  const body = {
    model: MODEL,
    temperature: 0.3,
    tools: [TOOL],
    tool_choice: {
      type: "function",
      function: { name: "report_diagnosis" },
    },
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `PRODUCT: ${product.name} (${product.category})\n\nPRODUCT MANUAL:\n"""\n${product.manual}\n"""\n\nUse the manual above as your only source of truth for the conversation that follows.`,
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
