// BakeLab — Help chat relay (Vercel serverless function)
// Deploy path in your repo: /api/mix-help.js   (the "api" folder at the repo ROOT, next to src/)
// Uses the same ANTHROPIC_API_KEY you already set in Vercel. Nothing else to configure.
//
// The Help button on a mix card opens a chat. The browser sends the conversation plus a summary of that
// exact mix (recipe, this batch's weights, temperatures, schedule). This file adds the house rules and the
// knowledge below, asks Claude, and streams the answer back as plain text so it appears as it is written.
// Claude can only advise. It never changes the recipe or the app.
//
// ============================  EDIT THE KNOWLEDGE BELOW  ============================
// This text is sent with every question (and cached by Anthropic so repeat questions stay cheap and quick).
// Keep it to baking facts you want Claude to know. Plain text only: do NOT type a backtick or a dollar sign
// followed by a curly brace anywhere inside it, or the file will stop working.
// If your GitHub repo is public, so is this text. Keep the repo private.

const KNOWLEDGE = `
HOUSE AU PAIN BENCH KNOWLEDGE (starter draft: edit and add to it)

THE BAKERY
- House au Pain is a small sourdough micro-bakery in Calgary.
- Mixer: large spiral mixer, about 19 kg dough capacity.
- Main oven: Rational iCombi Pro, practical load 12 loaves. Its bake protocol: fan on lowest, humidity maxed, 15-minute steam phase, pre-spritz before loading, baking steels preheated to about 500°F. Its available levers are already maxed out and it cannot match Dutch oven quality.
- Fallback: Dutch ovens in two non-convection ovens (one holds 4, one holds 2). 500°F preheat, drop to 450°F on loading, about 20 minutes covered, then an uncovered phase.
- Fermentation tools: an aliquot jar (to judge bulk by volume), a Goldie proofing device, and a self-built 18-quart Cambro proofing box. pH is used as a diagnostic too.
- Flour: Harvest Moon Mills stone-ground sifted bread flour is the primary flour (the bakery is mid-transition to it). P&H Mills strong baker's flour is the legacy backup.

THELMA, THE STARTER
- The starter is called Thelma. She is kept awake and never refrigerated, so a levain can be built on short notice (as little as about 4 hours). A dormant starter would need at least one full feed cycle after waking, so two feeds before baking.
- Thelma is fed at 1:10:8 (starter : flour : water), which is 80% hydration.
- Her feed flour is a bulk mix of 1000 g organic red fife roller-milled flour, 250 g organic red fife whole wheat stone-ground, and 250 g organic stone-ground rye, until a white bread flour is used.
- No discard: levain is built by feeding the whole culture.
- Levains are fed with sifted flour to control crumb darkening.

HOW THE BAKER WORKS
- Baker's percentages everywhere.
- Gate bulk fermentation to volume (the aliquot jar), not the clock, especially when honey or another mild accelerant is in the dough.
- Never stack variables. Levain changes, flour transitions and new inclusions should be isolated. Run one or two calibration loaves before committing a full production run, and read them for paste spread, tunnelling and oven spring.
- Stretch and folds have diminishing returns after about four well-spaced rounds (30 to 45+ minutes apart). If the dough is still slack after four rounds, suspect hydration, dough temperature or the flour, not too little folding. Extra folds extend fermentation and risk overproofing even when pH still looks acceptable.
- Stone-milled flour reads slacker than roller-milled flour at the same hydration and protein, because bran interrupts the gluten network. It also has more enzyme activity, so it browns faster: adjust bake temperature and time.
- Rye levain ripens noticeably faster than white levain (amylase, minerals, pentosans). Build it later or leaner.
- Honey reads as a mild net accelerant. Swirl pastes: put flour in the paste (not water thinning) to reduce tunnelling, warm a thick paste and add soft butter rather than water, and keep honey in the base dough, not the paste.

WHAT THE APP'S TERMS MEAN
- Autolyse: flours and main water, rested before the final mix.
- Final mix: salt, levain, and anything set to Mix are added. Bassinage is water held back and worked in a little at a time at the very end of the mix, never at the folds.
- Fold 1, 2 or 3: an ingredient added at that stretch and fold.
- Scald (tangzhong or yudane): part of the flour and liquid made ahead as a cooked or poured paste, cooled, then added. It is carved out of the recipe's own flour and liquid, so total flour and hydration do not change.
- Sugar in the levain: sugar built into the levain (a sweet stiff levain), as a percentage of the levain's flour, on top of any sugar in the dough itself.
- Build to peak: the hours the levain takes to peak at the reference temperature, entered per recipe from experience. The app scales it for inoculation, hydration and temperature but does not predict the effect of sugar.
- True hydration counts the water in milk and egg and the water and flour inside the levain.
`;

// ============================  HOUSE RULES (usually leave alone)  ============================
const RULES = `
You are the bench assistant inside BakeLab, the production app for House au Pain. You are talking to the baker while they are mid-production, often with floury hands on an iPad, so be brief and practical.

How to answer:
- Lead with the answer or the next action. No openers, no flattery, no recap of the question.
- Keep it short, usually under 120 words, in plain text. A short list with "- " is fine. No headers, tables or markdown formatting.
- Use the CURRENT MIX numbers. When you recommend an amount, give it in grams for THIS batch and show the arithmetic in a few words, for example "20 g = 1% of 2,003 g flour". Never invent a measurement that is not in the CURRENT MIX or in the baker's message.
- If a missing fact changes the answer (the actual dough temperature, the time since mixing, how the dough feels), either answer for the likely cases or ask ONE short question.
- Be honest and direct. If something in the numbers looks wrong or risky, say so plainly, even if the baker did not ask. Do not simply agree.
- Use the temperature unit given in CURRENT MIX (units). Weights in grams or kilograms, liquids in litres.
- You can only advise. You cannot change the recipe or the app, so say what to change and where.
- Respect the baker's tested protocols below, and change one variable at a time.
- If a photo is attached, say what you can and cannot judge from a photo.
- You are not a food-safety authority. If something sounds unsafe, say so and suggest the safe option.
`;

export const config = { maxDuration: 60 };

const MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 6000;
const MAX_MESSAGES = 30;
const MAX_TEXT = 8000;
const MAX_IMAGE_CHARS = 1400000; // base64 characters, about 1 MB
const MAX_CONTEXT_CHARS = 12000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Turn whatever the browser sent into a valid Claude conversation: alternating user / assistant, starting and
// ending with the user. Photos are only kept on the final message. Returns { messages } or { error }.
function cleanMessages(input) {
  if (!Array.isArray(input)) return { error: "No question to answer." };
  const out = [];
  const list = input.slice(-MAX_MESSAGES);
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const last = i === list.length - 1;
    let blocks = [];
    if (typeof m.content === "string") {
      if (m.content.trim()) blocks.push({ type: "text", text: m.content.slice(0, MAX_TEXT) });
    } else if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if (!b) continue;
        if (b.type === "text" && typeof b.text === "string" && b.text.trim()) blocks.push({ type: "text", text: b.text.slice(0, MAX_TEXT) });
        else if (b.type === "image" && m.role === "user") {
          const s = b.source || {};
          if (!last) { blocks.push({ type: "text", text: "[a photo was attached here]" }); continue; }
          if (s.type !== "base64" || IMAGE_TYPES.indexOf(s.media_type) === -1 || typeof s.data !== "string") continue;
          if (s.data.length > MAX_IMAGE_CHARS) return { error: "That photo is too large. Try a smaller one." };
          blocks.push({ type: "image", source: { type: "base64", media_type: s.media_type, data: s.data } });
        }
      }
    }
    if (!blocks.length) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) prev.content.push(...blocks);
    else out.push({ role: m.role, content: blocks });
  }
  while (out.length && out[0].role !== "user") out.shift();
  if (!out.length || out[out.length - 1].role !== "user") return { error: "No question to answer." };
  return { messages: out };
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ error: "ANTHROPIC_API_KEY is not set in Vercel." }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const cleaned = cleanMessages(body.messages);
    if (cleaned.error) { res.status(400).json({ error: cleaned.error }); return; }
    let ctx = "{}";
    try { ctx = JSON.stringify(body.context || {}, null, 1); } catch (e) { ctx = "{}"; }
    if (ctx.length > MAX_CONTEXT_CHARS) ctx = ctx.slice(0, MAX_CONTEXT_CHARS) + "\n…(trimmed)";

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        stream: true,
        // The rules and knowledge never change between questions, so they are cached; the mix summary changes, so it comes after the cached part.
        system: [
          { type: "text", text: RULES.trim() + "\n\nBAKERY KNOWLEDGE:\n" + KNOWLEDGE.trim(), cache_control: { type: "ephemeral" } },
          { type: "text", text: "CURRENT MIX (from the app, JSON):\n" + ctx },
        ],
        messages: cleaned.messages,
      }),
    });

    if (!upstream.ok) {
      const t = await upstream.text();
      res.status(502).json({ error: "Anthropic API " + upstream.status, detail: t.slice(0, 300) });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");

    // Claude streams server-sent events. Forward only the visible text, never the reasoning blocks.
    const dec = new TextDecoder();
    let buf = "", stop = "";
    for await (const chunk of upstream.body) {
      buf += dec.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let ev;
        try { ev = JSON.parse(data); } catch (e) { continue; }
        if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta" && ev.delta.text) res.write(ev.delta.text);
        else if (ev.type === "message_delta" && ev.delta && ev.delta.stop_reason) stop = ev.delta.stop_reason;
        else if (ev.type === "error") res.write("\n\n(The reply was interrupted: " + ((ev.error && ev.error.message) || "error") + ")");
      }
    }
    if (stop === "max_tokens") res.write("\n\n(Cut off. Ask me to continue.)");
    res.end();
  } catch (e) {
    if (!res.headersSent) { res.status(500).json({ error: (e && e.message) || "Server error" }); return; }
    res.write("\n\n(The reply was interrupted.)");
    res.end();
  }
}
