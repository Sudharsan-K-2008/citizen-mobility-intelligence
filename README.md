# MADRITHM — Round 3 Upgrade

MADRITHM turns citizen mobility complaints into structured incident intelligence for human review.

## Quick start (Windows PowerShell)

1. Extract this ZIP into a new folder or make a backup of your current project first.
2. Open the folder in VS Code.
3. In the VS Code terminal, run:

```powershell
python3 -m venv venv
.\venv\Scripts\Activate.ps1
python3 -m pip install -r requirements.txt
Copy-Item .env.example .env
```

4. Open `.env` and add your Gemini API key. Keep this file private. Change `OFFICIAL_PIN` to a private value.
5. Start the app:

```powershell
python3 app.py
```

6. Open `http://127.0.0.1:5000` in your browser.

## Test the improved classifier

```powershell
python3 -m unittest discover -s tests -v
```

The test suite does not require a Gemini API key.

## Important when updating your existing project

- This upgrade ZIP intentionally does **not** include `cmi.db`, so your existing local database is not overwritten. The app creates a new empty database automatically if none exists.
- This ZIP does not contain your `.env` or Gemini API key. Keep your existing `.env` file in your project folder; if it does not exist, create one from `.env.example`.
- Do not upload `.env` to GitHub.

## Included improvements

See `ROUND3_UPDATES.md` for the full change list and prototype limitations.

## Prototype data and limitations

Reports are sourced from citizen form submissions, administrator CSV imports and sample/demo records. Gemini interprets submitted complaint text; it is not itself a live traffic-data source. Automatic social-media, CCTV, Google Maps/Waze or government-feed ingestion is not configured. Severity and location are estimates, and officials must verify incidents.


## Round 3 additions
- Citizen issue form includes English, Tamil, Hindi, Malayalam and Telugu language selection. The selected language is saved with each report.
- Voice typing uses the browser Web Speech API with locale selection (en-IN, ta-IN, hi-IN, ml-IN, te-IN). It requires a supported browser and microphone permission; speech recognition availability/network behaviour is browser-dependent.
- Gemini-assisted analysis is prompted to interpret the supported languages. Without a working Gemini API configuration, the local fallback is not a full multilingual translation/classification engine.
- Dashboard unique-report counts exclude exact duplicate copies; a separate KPI shows duplicate copies received. Duplicate submissions remain stored for audit/history.
