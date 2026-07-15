# Build "VeriCIF" — AI Invoice Valuation Auditor for Customs Agencies

## Goal
Build a complete, runnable web app for customs brokers and agencies that analyzes commercial invoices (photos, PDFs, Excel/CSV) and flags likely **under-declaration of value** (undervaluation to evade import duties). It must verify declared prices against realistic market price ranges, check Incoterm consistency (detect FOB values passed off as CIF), and produce a clear ✅/⚠️/❌ verdict per line item plus an exportable report. Optimize for ease of use by non-technical customs agents.

## Tech stack
- **Frontend + backend:** Next.js (App Router) + React + Tailwind CSS, single deployable app with API routes.
- **AI:** OpenRouter (OpenAI-compatible API) — see "Model configuration" below.
- **Document parsing:**
  - Images (JPG/PNG/WEBP/HEIC) and scanned PDFs → vision model extraction.
  - Text PDFs → `pdf-parse` first, vision model as fallback if text extraction is poor.
  - XLSX/XLS/CSV → SheetJS server-side.
- **Storage:** SQLite (via Prisma or better-sqlite3) for analysis history and a local reference-price table.
- **UI language:** Spanish by default with an English toggle (simple i18n dictionary, no heavy library).

## Model configuration — MUST be swappable in one place
- All AI calls go through **one module**: `lib/ai.ts`. No other file may import the AI SDK or reference model names.
- Configuration comes from env vars:
  - `OPENROUTER_API_KEY` (required, loaded from `.env.local`, never hardcoded, never logged)
  - `AI_BASE_URL` (default `https://openrouter.ai/api/v1`)
  - `MODEL_VISION` — used for document extraction (must support images)
  - `MODEL_REASONING` — used for valuation analysis
- Default to currently available **free** OpenRouter models (e.g. a free Qwen-VL variant for vision and a free DeepSeek/Llama variant for reasoning — check what's currently offered with the `:free` suffix). Upgrading to premium (e.g. `anthropic/claude-sonnet-4.5`) must be a one-line `.env.local` change.
- Include a `.env.example` with all variables documented and add `.env.local` to `.gitignore`.

## Core flow — 3 steps

### Step 1 — Upload
- Drag-and-drop zone accepting JPG, PNG, WEBP, HEIC, PDF, XLSX, XLS, CSV. Allow multiple files per case (invoice + packing list + freight bill/BL).
- Context panel with fields: destination country, shipping mode (sea / air / courier), origin country, declared Incoterm, declared customs value + currency, applicable duty + tax rate (%). Prefill anything the extraction later discovers; everything editable.

### Step 2 — Extraction (human-in-the-loop)
- Send documents to the vision model with a **strict JSON schema** (validate with zod; on invalid JSON retry once with a repair prompt; if still invalid, show a visible "extraction incomplete" state — never crash on a bad document).
- Extract: supplier, buyer, invoice number and date, currency, Incoterm printed on the invoice, itemized freight/insurance/other charges, and per line item: description, quantity, unit, unit price, line total, HS code if printed (otherwise best-guess 6-digit HS code with a confidence score).
- Show the extraction in an **editable table** so the agent can fix OCR mistakes before analysis. Show per-field confidence; highlight low-confidence cells in yellow.

### Step 3 — Analysis & verdict
Run these checks, each displayed with ✅ / ⚠️ / ❌ and a plain-language explanation:

**a) Internal consistency.** quantity × unit price = line total; line totals sum to invoice total; currency consistent across documents; dates plausible; invoice total matches declared customs value.

**b) Incoterm / CIF reconstruction.** If the Incoterm is FOB/EXW/FCA but the declared customs value equals the invoice total in a CIF-basis country, flag the classic "FOB declared as CIF" pattern explicitly. Estimate freight and insurance from shipping mode, origin→destination, and weight/volume when available; otherwise fall back to configurable typical percentages of FOB (defaults: sea ~6–10%, air ~12–18%, courier ~15–20%; insurance ~0.3–0.5%). Show the reconstruction as a visible calculation: declared value → + estimated freight → + estimated insurance → **corrected CIF** → **estimated duty/tax gap** using the duty rate from Step 1.

**c) Market price benchmark (per line item).** Ask the reasoning model for a realistic international market price range — low / typical / high, in USD per unit — for the product description + HS code + origin country, and require it to state its reasoning and confidence. Compare the declared unit price and compute deviation %. **Also check the local SQLite reference table** (built from past analyses plus an optional CSV import of official customs reference values) and prefer real reference data over model estimates whenever available, labeling which source was used.
- Verdict thresholds (configurable in a settings page): ✅ within range · ⚠️ 10–30% below the low bound · ❌ more than 30% below the low bound.

**d) Red-flag heuristics.** Suspiciously round numbers, identical unit prices across dissimilar items, totals sitting just under a duty/de-minimis threshold, unit price magnitude implausible for the product description (e.g. "smartphone — $8.00").

### Results dashboard
- One big **overall verdict card**: ✅ CONSISTENT / ⚠️ NEEDS REVIEW / ❌ LIKELY UNDERVALUED, with confidence and a one-paragraph rationale in plain language.
- Per-line-item table: description, declared unit price, estimated market range rendered as a **horizontal band with a marker** showing where the declared price falls, deviation %, verdict icon, data source (model estimate vs reference DB).
- The CIF reconstruction box from check (b).
- **Export as PDF report** (clean, printable, includes evidence, model/data sources used, and disclaimers) and as JSON.
- **History page** listing past analyses with search by supplier, product, or date; each past case reopens read-only.

## Important behaviors
- Show every currency conversion with the rate and rate date (use a free FX API like exchangerate.host through a swappable `lib/fx.ts`, with a hardcoded fallback table so the app works offline).
- Keep all LLM prompts as exported constants in `/prompts/*.ts` so they are easy to tune without touching logic.
- Every screen must handle the slow/free-model case gracefully: skeleton loaders, progress states per document, and a retry button per step.
- Disclaimers everywhere results are shown: estimates are indicative; the final valuation determination belongs to the customs officer.

## Non-goals for v1
No authentication/multi-user, no cloud storage, no direct integration with customs systems. It must run locally with `npm install && npm run dev`.

## Acceptance test
Create `/samples` with 3 synthetic invoices (clearly marked as fake test data):
1. An honest CIF invoice with market-consistent prices → app shows ✅.
2. An invoice undervalued ~60% below market → app shows ❌ with the duty-gap estimate.
3. A FOB invoice whose total was declared as the customs value in a CIF country → app shows ⚠️/❌ with the "FOB declared as CIF" flag and the corrected CIF.
Walk through all three end-to-end and confirm extraction, verdicts, and PDF export work before considering the task done.
