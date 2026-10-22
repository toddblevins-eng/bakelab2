// BakeLab — recipe assistant relay (Vercel serverless function)
// Deploy path in your repo: /api/recipe-assist.js  (repo ROOT, not src/)
// Uses the same ANTHROPIC_API_KEY you already set for /api/analyze.js in Vercel.
// The browser calls /api/recipe-assist; this file holds the key and talks to Claude.
//
// Two modes, picked by the client:
//   mode: "create"  -> Claude invents a full recipe object from a plain-English description
//   mode: "edit"    -> Claude returns ONLY the fields that should change on an existing recipe
//
// Claude never sees or touches baker's-percentage math: it produces the recipe's INPUTS
// (flours, hydration %, levain build, bake settings) in BakeLab's own schema. The app's
// existing engine (ingLines, trueHydration, scaldInfo, etc.) does every calculation from
// there, exactly as when you type the numbers in by hand. This endpoint never writes
// anywhere by itself — the client always shows a preview/diff and the user clicks Save.

const MODEL = "claude-sonnet-5-5";

// The exact shape blankRecipe() produces in BakeLab.jsx. Keep this in sync with that function.
const SCHEMA = `{
  "name": string,
  "loafWeight": number (grams, finished loaf incl. inclusions),
  "shape": "round" | "oval" | "pullman1" | "pullman2",
  "flours": [{ "name": string, "pct": number }],   // FIRST entry is the main flour — its pct is Treated as the balance to 100 and MAY be omitted or left approximate; the app recalculates it. Every other flour's pct is exact baker's-percentage of total flour.
  "water": number,          // % of total flour — the MAIN mix water line (do not pre-subtract bassinage or scald; the app carves those out)
  "salt": number,           // % of total flour
  "levain": number,         // % of total flour
  "levHyd": number,         // levain hydration %, e.g. 80 liquid, 50 stiff
  "levInoc": number,        // working inoculation % (seed as % of levain flour)
  "levRefInoc": number,     // usually same as levInoc unless the baker calibrated separately
  "levBuildHrs": number,    // hours to peak at ref temp
  "levRefTemp": number,     // °C
  "levWhole": number,       // % whole grain in the levain's own flour, 0-100
  "levExpNote": string,     // short note on the levain flour / experiment, e.g. "straight bread flour"
  "ddt": number,            // target dough temp, °C (76°F ≈ 24.4°C if not specified)
  "bakeTemp": number,       // °C
  "bakeMin": number,
  "steamMin": number,
  "autolyse": number,       // minutes
  "calNote": string,        // optional free note
  "bassinage": boolean, "bassinagePct": number,       // % of water held back post-mix, 0 if unused
  "notes": string,          // bake notes / what to expect
  "price": number,          // wholesale $ / loaf, 0 if unknown — NEVER invent a price, leave 0
  "scald": boolean, "scaldFlour": string, "scaldPct": number, "scaldHyd": number, "scaldLiquid": string, "scaldMethod": "cooked" | "poured",
  "inclusions": [{ "name": string, "pct": number, "when": "" | "autolyse" | "mix" | "fold1" | "fold2" | "fold3" }],  // % of total flour; "when" = when it goes in, "" = automatic
  "liquids": [{ "name": string, "pct": number, "factor": number, "when": "" | "autolyse" | "mix" | "fold1" | "fold2" | "fold3" }]  // pct = % of total flour; factor = % of that liquid's weight that is water (milk 88, egg 75, cream 60)
}`;

const CREATE_SYSTEM = `You are a sourdough formulation assistant inside BakeLab, a professional micro-bakery's production app. The baker describes a bread in plain English — style, hydration ballpark, inclusions, levain character, bake notes, anything — and you turn it into ONE complete recipe object in BakeLab's exact schema below, using sound bread-baking judgment to fill in anything they didn't specify (reasonable hydration for the style, a typical levain build, a sane bake temp/time for the loaf weight and inclusions).

You are producing structured INPUTS, not doing the arithmetic: percentages, flours, levain build parameters, bake settings. BakeLab's own engine computes every actual gram, true hydration, batch weight, and schedule from what you return — never invent computed totals or grams yourself, only baker's-percentage inputs.

SCHEMA (return exactly these fields, correct types, no extra fields):
${SCHEMA}

When added: every liquid and inclusion may carry a "when" value. Leave it "" (automatic) unless the baker says when something goes in; otherwise use "autolyse", "mix", "fold1", "fold2" or "fold3". The app fixes these itself and they are never set with "when": flours and water go in the autolyse, salt and levain in the mix, bassinage at the very end of the mix. A liquid that goes in the scald is chosen with the scald fields (scaldLiquid), never with "when".\n\nScald / tangzhong / yudane: switch scald on only when the baker asks for one or the style classically uses one (Japanese milk bread -> tangzhong). When on, you MUST fill every scald field with real amounts: scaldFlour = the name of one of the recipe's flours, scaldPct = % of total flour (usually 5-20), scaldHyd = liquid per 100 of scald flour (tangzhong 500, yudane 200), scaldLiquid = "" for water or the name of a liquid already in the recipe, scaldMethod. Never leave scald true with zero or missing amounts.\n\nIn rationale text, give temperatures in °F and weights in grams or kilograms (field values keep the schema's units).\n\nReply with ONLY a JSON object of this shape — no prose, no code fences:
{ "recipe": <the full recipe object>, "rationale": "2-4 short sentences on the key choices you made and why, written to a baker who already knows the craft" }`;

const EDIT_SYSTEM = `You are a sourdough formulation assistant inside BakeLab, a professional micro-bakery's production app. You are given an EXISTING recipe (in BakeLab's schema) and an instruction for how to change it. Return ONLY the fields that should change — never the whole recipe, never fields the baker didn't ask to touch. If the instruction implies editing one item in an array (one flour, one liquid, one inclusion), return that whole array with the one item changed, not a fragment.

Treat the instruction literally and conservatively: a request to "add 5% rye to the levain" means levWhole or levExpNote, a request to "raise hydration 3%" means water, a request to "make it a Pullman loaf" means shape. Don't change fields the baker didn't mention. If the instruction is genuinely ambiguous, make the most standard baker's reading and say so in the rationale rather than asking a clarifying question.

CURRENT RECIPE:
CURRENT_RECIPE_PLACEHOLDER

SCHEMA (the full set of fields that exist; only return ones that change):
${SCHEMA}

When added: every liquid and inclusion may carry a "when" value. Leave it "" (automatic) unless the baker says when something goes in; otherwise use "autolyse", "mix", "fold1", "fold2" or "fold3". The app fixes these itself and they are never set with "when": flours and water go in the autolyse, salt and levain in the mix, bassinage at the very end of the mix. A liquid that goes in the scald is chosen with the scald fields (scaldLiquid), never with "when".\n\nScald / tangzhong / yudane: switch scald on only when the baker asks for one or the style classically uses one (Japanese milk bread -> tangzhong). When on, you MUST fill every scald field with real amounts: scaldFlour = the name of one of the recipe's flours, scaldPct = % of total flour (usually 5-20), scaldHyd = liquid per 100 of scald flour (tangzhong 500, yudane 200), scaldLiquid = "" for water or the name of a liquid already in the recipe, scaldMethod. Never leave scald true with zero or missing amounts.\n\nIn rationale text, give temperatures in °F and weights in grams or kilograms (field values keep the schema's units).\n\nReply with ONLY a JSON object of this shape — no prose, no code fences:
{ "changes": { <only the changed fields, same schema/types> }, "rationale": "1-3 short sentences on what changed and why" }`;


// A scald that is switched on without real amounts would show up as a half-filled, error-flagged section in the form.
// If Claude ever does that, switch it off and say so, instead of passing it through.
const SCALD_NOTE = " Scald was left off because no amounts came back for it; use the Tangzhong preset in the form to add one.";
const scaldBroken = (r) => !!r && r.scald === true && !((+r.scaldPct > 0) && (+r.scaldHyd > 0));

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ error: "ANTHROPIC_API_KEY is not set in Vercel." }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const mode = body.mode === "edit" ? "edit" : "create";
    const instruction = String(body.instruction || "").trim();
    if (!instruction) { res.status(400).json({ error: "No instruction given." }); return; }

    let system, userMsg;
    if (mode === "create") {
      system = CREATE_SYSTEM;
      userMsg = "Create a recipe for: " + instruction;
    } else {
      const current = body.recipe && typeof body.recipe === "object" ? body.recipe : null;
      if (!current) { res.status(400).json({ error: "edit mode requires body.recipe (the current recipe)." }); return; }
      system = EDIT_SYSTEM.replace("CURRENT_RECIPE_PLACEHOLDER", JSON.stringify(current, null, 2));
      userMsg = "Change requested: " + instruction;
    }

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 16000, system, messages: [{ role: "user", content: userMsg }] }),
    });

    if (!r.ok) {
      const t = await r.text();
      res.status(502).json({ error: "Anthropic API " + r.status, detail: t.slice(0, 300) });
      return;
    }

    const data = await r.json();
    const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
    if (data.stop_reason === "max_tokens") {
      res.status(502).json({ error: "Claude's reply was cut off before it finished. Try again, or raise max_tokens in " + "api/" + "recipe-assist.js." });
      return;
    }
    if (!text) {
      const types = (data.content || []).map((c) => c.type).join(", ") || "none";
      res.status(502).json({ error: "Claude returned no text (stop_reason: " + data.stop_reason + ", blocks: " + types + ")." });
      return;
    }
    const tryParse = (t) => { const a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a < 0 || b <= a) return null; try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; } };
    let parsed = tryParse(text);
    if (!parsed || typeof parsed !== "object") { res.status(200).json({ raw: text }); return; }

    if (mode === "create") {
      if (!parsed.recipe || typeof parsed.recipe !== "object" || !Array.isArray(parsed.recipe.flours) || parsed.recipe.flours.length === 0) {
        res.status(200).json({ error: "Claude's reply didn't include a valid recipe.", raw: text });
        return;
      }
      let rationale = parsed.rationale || "";
      if (scaldBroken(parsed.recipe)) { parsed.recipe.scald = false; rationale += SCALD_NOTE; }
      res.status(200).json({ mode: "create", recipe: parsed.recipe, rationale });
    } else {
      if (!parsed.changes || typeof parsed.changes !== "object") {
        res.status(200).json({ error: "Claude's reply didn't include a valid change set.", raw: text });
        return;
      }
      let rationale = parsed.rationale || "";
      const merged = { ...(body.recipe || {}), ...parsed.changes };
      if (parsed.changes.scald === true && scaldBroken(merged)) { delete parsed.changes.scald; rationale += SCALD_NOTE; }
      res.status(200).json({ mode: "edit", changes: parsed.changes, rationale });
    }
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || "Server error" });
  }
}
