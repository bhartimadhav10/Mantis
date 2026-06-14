# Running Mantis (dev)

1. **Get a free Groq key:** https://console.groq.com/keys
2. **Create `.env.local`** in the project root:
   ```
   GROQ_API_KEY=gsk_your_key_here
   ```
3. **Install & run:**
   ```
   npm install
   npm run dev
   ```
4. Open http://localhost:3000 → pick a product → describe a problem.

## Demo script (the money shot)
On the **Zephyr E1 Scooter**, type: *"My scooter horn is not working."*
The assistant will ask a discriminating question (e.g. "Do the lights work?"),
rule causes in/out in the side panel, then diagnose: **check fuse F3 (10A)** —
with the manual citation. Mirrors the README's example exactly.

## Swapping the LLM
All model code is in `lib/agent.ts`. It uses Groq's OpenAI-compatible API, so
pointing at MOSS or any OpenAI-compatible endpoint is a one-file change
(URL + model name).
