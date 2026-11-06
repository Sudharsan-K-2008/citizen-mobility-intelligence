# MADRITHM — Round 3 update pack

## What changed

1. Rebranded the visible product name to MADRITHM while preserving internal Python module names, API routes and the existing SQLite schema.
2. Improved deterministic mobility classification for indirect road-waterlogging impact. The classifier now recognises phrases such as water accumulating/collecting/standing and transport impact such as buses being unable to move or pedestrians struggling to cross.
3. Added a representative Velachery indirect-impact complaint to the sample dataset.
4. Added automated regression tests for indirect waterlogging, rainfall-only text, flooded roads, household water leakage, normal traffic and potholes.
5. Added a clear data-source disclosure in the UI: citizen submissions, admin CSV imports and demo data are used; Gemini analyses the submitted text and is not itself a live traffic-data source.

## Existing capabilities retained

- Flask API and frontend dashboard
- SQLite persistence
- Gemini contextual interpretation when a valid API key is configured
- Rule-based NLP fallback
- Incident grouping / duplicate handling
- Severity estimation and reason text
- Location matching, Leaflet map and charts
- Official PIN workflow, incident status updates, CSV import/export

## Run locally (Windows PowerShell)

```powershell
cd path\to\MADRITHM
python3 -m venv venv
.\venv\Scripts\Activate.ps1
python3 -m pip install -r requirements.txt
Copy-Item .env.example .env
# Edit .env and add your own Gemini API key and a private OFFICIAL_PIN
python3 app.py
```

Open http://127.0.0.1:5000

## Run regression tests

```powershell
python3 -m unittest discover -s tests -v
```

The tests use the deterministic local rules and do not require a Gemini API key.

## Important prototype limitations

- No automatic live Google Maps/Waze, social-media, CCTV or government-feed ingestion is configured.
- Sample/demo records are synthetic demonstration data, not verified real incidents.
- Location matching and severity are estimates. Officials must verify reports.
- SQLite is suitable for a local demo; use a managed persistent database before a public production deployment.
- Change the demo/default official PIN before sharing the app. Never upload `.env` or expose the Gemini key.

## Judge-safe description

“MADRITHM converts citizen mobility complaints into structured incident intelligence using deterministic NLP rules and optional Gemini contextual interpretation. It groups likely related reports, estimates severity, extracts locations where possible and presents the results for human verification.”

## Additional citizen-accessibility and duplicate-count update
- Added a language selector for English, Tamil, Hindi, Malayalam and Telugu in the citizen issue form.
- Selected language is passed through preview/submission and stored in the existing `reports.language` field.
- Updated Gemini extraction instructions to understand these languages and mixed-language reports without requiring English keywords.
- Added browser speech-to-text with locale mapping: en-IN, ta-IN, hi-IN, ml-IN and te-IN. Includes start/stop state, interim text, permission/error messaging and graceful unsupported-browser handling.
- Added language-specific example placeholders to guide citizens.
- Dashboard now counts exact duplicate copies separately from unique reports. Exact duplicate reports remain stored and visible in the report history; they do not inflate the unique-report or incident report count.
- Local rule-based fallback is not a full multilingual classifier. For best non-English classification, configure a valid Gemini API key/model. Voice recognition also depends on browser speech service and microphone permissions.


## Round 3 Plus additions (visual styling preserved)
- Incident density overlay toggle on the existing Leaflet map (derived from submitted incident counts; not live sensor heat data).
- Heuristic mobility-impact score and an emergency-access screening flag, clearly marked as decision-support estimates requiring human review.
- Citizen crowd-confirmation button with one confirmation per browser-generated voter key (prototype-level anti-repeat control, not identity verification).
- Citizen tracking IDs in the form MDR-000001 format and a tracking lookup panel.
- Incident timeline records creation and official status changes.
- Gemini-backed translation of a report to English for officials; requires a valid GEMINI_API_KEY and configured GEMINI_MODEL. Original complaint text is retained.
- Existing visual files style.css, script.js and fx.js are intentionally unchanged. No background, cursor, rain, flame or motion effects were edited.
