# Study Buddy — AI Learning Companion

**[Live demo →](https://your-app-name.onrender.com)** _(update this link once deployed — see Deploying below)_

Paste any topic or article and Study Buddy turns it into a **structured quiz** and a **RAG-grounded tutor chat** — one that only answers from the material you gave it, with inline citations back to the source. Scores persist across sessions.

Built as an end-to-end capstone: a documented mini design system, an automated eval suite that checks quiz questions are actually grounded in the source (not hallucinated), and custom loading/error states designed around real LLM latency instead of default browser spinners.

## Features

- **Quiz generation** — parses into strict JSON (question, 4 options, correct index, and a verbatim grounding quote from the source), so every question is auditable against the text it came from.
- **RAG-grounded chat** — retrieves the most relevant chunks of your source text via lightweight keyword overlap (no vector DB needed for this scale), and the model is instructed to answer only from those chunks, citing them inline as `[1]`, `[2]`, etc.
- **Score history** — every quiz attempt is saved and viewable across sessions.
- **Eval suite** — a built-in tab runs quiz generation against three fixed reference passages and checks each generated question two independent ways: a deterministic word-overlap check against the source, and a separate LLM-as-judge call verifying the marked answer is actually correct. Reports a pass rate, not just a claim.
- **Mini design system** — a single `TOKENS` object (color, type, spacing, radius, motion) drives every component; a built-in Style Guide tab documents all of it live, like a lightweight Storybook.
- **Latency-aware UX** — custom skeleton loaders and rotating status messages during generation, and error banners with retry, instead of generic spinners or browser alerts.
- **Token-driven motion** — the correct/incorrect quiz feedback animates using the same `duration`/`easing` values from the token system (a bounce-eased "pop" on correct, an accel-eased "shake" on incorrect) — no hardcoded animation timings.

## Screenshots

_Add screenshots here after running it locally, e.g._
```
![Quiz view](docs/screenshot-quiz.png)
![Style guide](docs/screenshot-styleguide.png)
```

## Architecture

```
┌─────────────┐        /api/messages        ┌─────────────┐        ┌──────────────┐
│   Client    │ ───────────────────────────▶│   Server    │───────▶│  Gemini API  │
│ (Vite+React)│◀───────────────────────────│  (Express)  │◀───────│              │
└─────────────┘        JSON response         └─────────────┘        └──────────────┘
       │                                            │
       │           /api/storage/:key                │
       └───────────────────────────────────────────▶│  storage.json
                                                      (quiz history)
```

The API key lives only on the server (`server/.env`) — the browser never sees it. The server is a thin proxy: it adds the model name and forwards the request, so the client stays simple and the key stays safe.

## Tech stack

- **Frontend:** React 18, Vite, Tailwind (CDN), lucide-react
- **Backend:** Node.js, Express
- **AI:** Google Gemini API (generateContent)
- **Persistence:** flat-file JSON store (swap for a real DB if scaling this up)

## Getting started

**1. Get an API key** from [Google AI Studio](https://aistudio.google.com/apikey).

**2. Start the backend**
```bash
cd server
npm install
cp .env.example .env
# paste your key into .env → GEMINI_API_KEY=
npm start
```
Runs on `http://localhost:3001`.

**3. Start the frontend** (new terminal)
```bash
cd client
npm install
npm run dev
```
Open the printed URL (usually `http://localhost:5173`).

## Deploying (single service)

The server serves the built frontend itself, so the whole app deploys as one service — no separate frontend/backend hosting needed.

**On [Render](https://render.com) (free tier works):**
1. Push this repo to GitHub (see below), then on Render click **New → Web Service** and connect the repo.
2. Set:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
3. Add an environment variable: `GEMINI_API_KEY` = your key (from aistudio.google.com/apikey). Optionally set `GEMINI_MODEL` too.
4. Deploy. Render gives you a URL like `https://study-buddy-xyz.onrender.com` — that's your live demo link.

(Free-tier Render services sleep after inactivity and take ~30s to wake on the first request — worth a line in your portfolio so it doesn't look broken on first click.)

## Design system

All visual decisions route through one `TOKENS` object in `client/src/App.jsx`: color palette, type scale, spacing scale, radius scale, and motion (`duration` + `easing` pairs). Every component — buttons, badges, cards, the chat bubbles, the quiz option states — reads from it rather than hardcoding values. The in-app **Style Guide** tab renders every token and component variant live, so it doubles as documentation.

## Eval methodology

The **Evals** tab runs quiz generation against three fixed, hand-written reference passages (photosynthesis, TCP's three-way handshake, India's Green Revolution) and grades each resulting question two ways:

1. **Deterministic grounding check** — does the model's cited `grounding` quote actually appear (by word overlap) in the source text?
2. **LLM-as-judge** — a second, independent Claude call is shown the source text and the question, and asked to verify the marked answer is correct and the question is answerable from the text alone.

A question only counts as passing if both checks agree. This catches two failure modes separately: a plausible-sounding but unsupported question, and a supported question with the wrong answer marked correct.

## Project structure

```
study-buddy-local/
├── client/                # Vite + React frontend
│   └── src/
│       ├── App.jsx        # main app: quiz, chat, history, style guide, evals
│       ├── storage.js     # persistence helper (calls the backend)
│       └── main.jsx
└── server/                # Express backend
    ├── index.js           # Gemini proxy + storage endpoints
    └── .env.example
```

## License

MIT — see [LICENSE](LICENSE).
