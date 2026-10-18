// BakeLab — recipe analysis relay (Vercel serverless function)
// Deploy path in your repo: /api/analyze.js  (repo ROOT, not src/)
// Set ANTHROPIC_API_KEY in Vercel → Project → Settings → Environment Variables.
// The browser calls /api/analyze; this file holds the key and talks to Claude.

const MODEL = "claude-sonnet-5-5"; // swap to "claude-opus-4-8" for a deeper (slower, pricier) read

const SYSTEM = `You are a master sourdough baker and bakery production consultant reviewing a recipe from BakeLab, the app of a naturally-leavened micro-boulangerie. The baker is fully fluent in baker's percentages, levain math, and fermentation — never explain fundamentals and never pad with encouragement. Be specific to the numbers given, concise, and honest about tradeoffs and risks. Use the stated loaf count plus the baker's mixer and oven capacity to flag scaling issues: total levain to build, number of mixer batches, oven loads, and timing knock-ons.

Reply with ONLY a JSON object — no prose, no code fences — in exactly this shape:
{
  "summary": "one sentence read on the recipe",
  "expected": ["2-5 short strings on crumb, dough handling, flavor, and fermentation behavior given the formula"],
  "optimizations": [{"issue": "short label", "note": "specific suggestion, tied to the numbers or loaf count where relevant"}]
}
Keep every string tight. Return an empty optimizations array if nothing genuinely needs changing — do not invent problems.`;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ error: "ANTHROPIC_API_KEY is not set in Vercel." }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const userMsg = "Analyze this recipe.\n\n" + JSON.stringify(body, null, 2);

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      res.status(502).json({ error: "Anthropic API " + r.status, detail: t.slice(0, 300) });
      return;
    }

    const data = await r.json();
    const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
    if (!text) {
      const types = (data.content || []).map((c) => c.type).join(", ") || "none";
      res.status(502).json({ error: "Claude returned no text (stop_reason: " + data.stop_reason + ", blocks: " + types + ")." });
      return;
    }
    let parsed = null;
    try { parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim()); } catch (e) { parsed = null; }
    if (parsed && typeof parsed === "object") res.status(200).json(parsed);
    else res.status(200).json({ raw: text });
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || "Server error" });
  }
}
