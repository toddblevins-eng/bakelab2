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
  "inclusions": [{ "name": string, "pct": number }],  // % of total flour, added post-mix
  "liquids": [{ "name": string, "pct": number, "factor": number }]  // pct = % of total flour; factor = % of that liquid's weight that is water (milk 88, egg 75, cream 60)
}`;

const CREATE_SYSTEM = `You are a sourdough formulation assistant inside BakeLab, a professional micro-bakery's production app. The baker describes a bread in plain English — style, hydration ballpark, inclusions, levain character, bake notes, anything — and you turn it into ONE complete recipe object in BakeLab's exact schema below, using sound bread-baking judgment to fill in anything they didn't specify (reasonable hydration for the style, a typical levain build, a sane bake temp/time for the loaf weight and inclusions).

You are producing structured INPUTS, not doing the arithmetic: percentages, flours, levain build parameters, bake settings. BakeLab's own engine computes every actual gram, true hydration, batch weight, and schedule from what you return — never invent computed totals or grams yourself, only baker's-percentage inputs.

SCHEMA
