# Enable Gemini in MADRITHM

This project uses Gemini as an optional LLM assistant. The existing rule-based NLP remains active and is used automatically when Gemini is not configured or the API is unavailable.

## 1. Create a free API key

1. Open https://aistudio.google.com/app/apikey
2. Sign in with your Google account.
3. Create an API key.
4. Copy it. Never paste the key into frontend JavaScript, HTML, GitHub, or a public message.

Google's free tier has model and usage limits. Availability and quotas can change.

## 2. Configure locally in VS Code (Windows PowerShell)

Open the project folder in VS Code. In the terminal, run:

```powershell
Copy-Item .env.example .env
```

Open `.env` and replace `PASTE_YOUR_GEMINI_API_KEY_HERE` with your real key. Save the file.

Install dependencies and start the app:

```powershell
python -m pip install -r requirements.txt
python app.py
```

If `python` is not recognized, try `python3` in both commands. Open http://127.0.0.1:5000 in your browser.

## 3. Verify the integration

Submit a mobility report in the app. When Gemini successfully assists, the analysis result's `engine` field will be `rules+gemini`. If no key is configured, the API quota is exhausted, or Gemini is unavailable, the app safely falls back to `rules`.

Gemini is used for contextual relevance/category/location extraction. The current deterministic sentiment and severity calculations remain rule-based; this project does not become a trained ML model just by adding Gemini.

## 4. Deploying on Vercel

In Vercel, open your project → Settings → Environment Variables. Add:

- Name: `GEMINI_API_KEY`
- Value: your Google AI Studio API key
- Name: `GEMINI_MODEL`
- Value: `gemini-3.8-flash`

Add the variables to the environments you use (Production / Preview / Development), save, then redeploy. Do not add `.env` to GitHub. The repository `.gitignore` already excludes it.

## Privacy note

Citizen reports sent to Gemini are sent to Google's API for processing. Do not send sensitive personal information. The app already removes detected email addresses, phone numbers, links and @mentions before analysis, but this cleaning is not a guarantee that all personal information is removed.
