# Hiring workspace

React (Vite) frontend and FastAPI backend: batches, candidates, resume PDFs, LLM scoring/extraction, and a shared **interview workspace** (per-candidate JSON). Data lives in **SQLite**; PDFs on disk under `backend/uploads/` (gitignored).

---

## Repository layout

```
resume_review_workspace/
├── README.md              ← this file
├── frontend/              # npm — UI
└── backend/               # Python — API, SQLite, uploads/
    ├── requirements.txt
    ├── database/
    └── src/
```

---

## Prerequisites

- **Node.js** 16+ and **npm** (see `frontend/package.json` → `engines`)
- **Python** 3.10+

---

## Setup

**Frontend**

```bash
cd frontend
npm install
cp .env.example .env.local
# Set VITE_API_BASE_URL (e.g. http://localhost:8000)
```

**Backend**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Optional OCR for scanned PDFs: install Tesseract and Poppler, add the packages listed under “Optional: OCR” in `backend/requirements.txt`, set `RESUME_OCR=1` in `backend/.env`.

---

## Run (two terminals)

```bash
# Terminal 1 — from backend/
uvicorn src.main:app --reload --port 8000
```

```bash
# Terminal 2 — from frontend/
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). API health: `GET http://localhost:8000/health`.

Default DB file: `backend/hiring.db` (created on first run). Resume files: `backend/uploads/resumes/`.

---

## Auth (passwordless)

- Users sign in with **display name + email** that match an account created by a **hiring manager**.
- **JWT** in `localStorage`; all hiring and LLM routes require a valid token.
- **First user:** register via the sign-in page when the API reports no users (`GET /api/v1/auth/status` → `requiresRegistration: true`); the first account must be **hiring_manager**.
- **Roles:** **hiring_manager** (batches, uploads, scoring, full interview workspace, user admin) and **interviewer** (interview feedback and shortlist rules per API).
- Optional open sign-up: `ALLOW_PUBLIC_SIGNUP=true` in backend `.env` (use with care).

Set a strong **`JWT_SECRET`** in production.

---

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `VITE_API_BASE_URL` | Frontend `.env.local` | API base URL (required for hiring UI). |
| `DATABASE_URL` | Backend `.env` | SQLAlchemy URL; default SQLite `./hiring.db`. |
| `JWT_SECRET` | Backend `.env` | JWT signing secret. |
| `CORS_ORIGINS` | Backend `.env` | Comma-separated UI origins if not localhost:5173. |
| `OPENAI_*` / `AZURE_OPENAI_*` | Backend `.env` | LLM for `/score-resume` and `/extract-resume`; see **LLM configuration** below. |
| `LLM_PROVIDER` | Backend `.env` | `auto` (default), `openai`, or `azure` — picks OpenAI vs **Azure OpenAI** when both are configured. |
| `RESUME_OCR` | Backend `.env` | Set `1` with optional OCR packages (see `backend/requirements.txt`). |

---

## LLM configuration (how to switch providers and models)

LLMs are used for **resume scoring** (`POST /api/v1/score-resume`) and **field extraction** (`POST /api/v1/extract-resume`) in `backend/src/main.py`. Which code path runs depends on **`VITE_API_BASE_URL`** and your env files.

### Path A — Recommended: Python API runs the model

1. Set **`VITE_API_BASE_URL`** in `frontend/.env.local` (e.g. `http://localhost:8000`).
2. Edit **`backend/.env`**:
   - **OpenAI (platform API):** set **`OPENAI_API_KEY`**. Optionally set **`OPENAI_MODEL`** (default `gpt-4o-mini`).  
     If `OPENAI_API_KEY` is non-empty, the backend **always prefers OpenAI** for LLM calls.
   - **Azure OpenAI instead:** leave **`OPENAI_API_KEY`** empty. Set **`AZURE_OPENAI_ENDPOINT`**, **`AZURE_OPENAI_API_KEY`**, **`AZURE_OPENAI_DEPLOYMENT`**, and optionally **`AZURE_OPENAI_API_VERSION`**.
   - **Mock / offline:** leave both OpenAI and Azure incomplete (empty keys). The API returns fixed mock score and extraction JSON.

3. **Restart** the backend after changing `backend/.env`. **Restart** `npm run dev` after changing `frontend/.env.local`.

**Extraction** from the UI always goes to the Python API and needs `VITE_API_BASE_URL` plus a configured backend LLM (or you get mock extraction).

**Scoring** uses each candidate’s **`resumeText`** only (not raw PDF bytes).

### Path B — Browser-only scoring (no `VITE_API_BASE_URL`)

If **`VITE_API_BASE_URL` is unset**, batch **Re-run LLM scoring** runs entirely in the browser:

- Set **`VITE_LLM_PROVIDER`** in `frontend/.env.local` to **`mock`**, **`openai`**, or **`azure-openai`** (see `frontend/src/config/llm.config.ts`).
- **OpenAI:** use **proxy** (`VITE_OPENAI_USE_PROXY=true` + `OPENAI_API_KEY` read by Vite) or **direct** (`VITE_OPENAI_API_KEY` — key is in the client bundle; dev only). Details: **`frontend/.env.example`**.
- **Azure OpenAI (browser):** set **`VITE_LLM_PROVIDER=azure-openai`**. Prefer **`VITE_AZURE_OPENAI_USE_PROXY=true`** with **`AZURE_OPENAI_ENDPOINT`**, **`AZURE_OPENAI_API_KEY`**, and matching **`AZURE_OPENAI_DEPLOYMENT`** / **`VITE_AZURE_OPENAI_DEPLOYMENT`** so the Vite dev server adds the secret (not bundled). Proxy mode works only with **`npm run dev`**, not a static `dist` build.

When **`VITE_API_BASE_URL` is set**, **`VITE_LLM_PROVIDER` is ignored for scoring** — the backend owns the model choice.

### Quick switch cheat sheet

| What you want | What to do |
|---------------|------------|
| OpenAI via backend | `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`) in `backend/.env`; `VITE_API_BASE_URL` set |
| Azure via backend | Full `AZURE_OPENAI_*` in `backend/.env`; `LLM_PROVIDER=azure` if `OPENAI_API_KEY` is also set; `VITE_API_BASE_URL` set |
| Backend mocks | No real keys in `backend/.env`; `VITE_API_BASE_URL` set |
| Azure via browser (dev) | No `VITE_API_BASE_URL`; `VITE_LLM_PROVIDER=azure-openai` + Azure vars in **`frontend/.env.example`** |
| Browser mock only | No `VITE_API_BASE_URL`; `VITE_LLM_PROVIDER=mock` |
| Change model name (OpenAI platform) | `OPENAI_MODEL` in `backend/.env` (e.g. `gpt-4o-mini`) |
| Change Azure deployment | `AZURE_OPENAI_DEPLOYMENT` (+ matching resource) in `backend/.env` |

Copy-paste templates: **`frontend/.env.example`**, **`backend/.env.example`**.

---

## Useful commands

| Command | Directory | Purpose |
|---------|-----------|---------|
| `npm run dev` | `frontend/` | Dev server |
| `npm run build` | `frontend/` | Production build → `dist/` |
| `uvicorn src.main:app --reload --port 8000` | `backend/` | API |

---

## Troubleshooting

- **Empty hiring UI / “configure API”** — Set `VITE_API_BASE_URL` and run the backend.
- **Frontend env ignored** — Restart `npm run dev` after editing `.env.local`.
- **CORS** — Add your UI origin to `CORS_ORIGINS`.
- **Scoring still mock** — Check `backend/.env` keys; confirm `VITE_API_BASE_URL` points at the running API; restart uvicorn.
- **Azure 401 / wrong deployment** — `AZURE_OPENAI_DEPLOYMENT` must match the deployment name in Azure; endpoint should not have a trailing slash issues (code strips one).

---

## Architecture

- **Browser:** React SPA; `VITE_API_BASE_URL` → REST with **Bearer JWT**.
- **API:** FastAPI, SQLAlchemy, SQLite by default (`DATABASE_URL`).
- **Files:** Resume PDFs under `backend/uploads/resumes/`; not stored in the DB.
- **LLM:** `POST /api/v1/score-resume` and `POST /api/v1/extract-resume` in `main.py` use OpenAI or Azure OpenAI per `LLM_PROVIDER` / env; otherwise deterministic mocks. `GET /health` includes an **`llm`** field.

**Scoring paths**

- If the frontend has `VITE_API_BASE_URL`, scoring goes to the Python API (uses candidate **`resumeText`**).
- If not, the browser may use Azure or mock via `llm.config.ts` / `llmScoring.ts`.

---

## Source map

```
frontend/src/
  main.tsx, routes.tsx
  auth/                 # AuthContext, JWT storage, login API
  config/llm.config.ts
  hiring/
    components/         # HiringBatches, BatchDetail, CandidateDrawer,
    #   HiringInterviewWorkspace, ResumeBundleDropZone, modals, …
    data/hiringTypes.ts
    services/hiringApi.ts, llmScoring.ts, resumeExtraction.ts, …
    utils/interviewWorkspace.ts   # parse shape for drawer display

backend/
  database/
    connection.py, models.py, migrations.py
  src/
    main.py               # app, CORS, lifespan, score/extract
    hiring_routes.py      # /api/v1/batches, candidates, PDF
    interview_workspace_merge.py  # interviewer PATCH merge rules
    crud.py, schemas.py, resume_files.py
    auth_*.py             # JWT, users, login/register
```

---

## Backend modules

| Module | Role |
|--------|------|
| `connection.py` | `DATABASE_URL`, `engine`, `SessionLocal`, `get_db`. |
| `models.py` | `Batch`, `Candidate`, `User`; JSON for flags, history, interview rounds/workspace. |
| `migrations.py` | Additive SQLite `ALTER`s on startup for older DBs. |
| `schemas.py` | Pydantic models; JSON field names **camelCase** for the frontend. |
| `crud.py` | ORM ↔ API; `patch_candidate`, PDF flag, JSON serialization. |
| `hiring_routes.py` | Batches, candidates, PDF upload/stream. Non–hiring-manager candidate PATCH runs `interview_workspace_merge` when `interviewWorkspace` is sent. |
| `interview_workspace_merge.py` | Merges interviewer saves into existing workspace (own rows only; preserves others and hiring-manager **final recommendation**). |
| `resume_files.py` | Paths, size limit, PDF header check, `write_pdf`. |

**Adding a candidate field:** `models.py` → migration (if SQLite upgrade needed) → `schemas.py` → `crud.py` → `hiringTypes.ts` → UI.

---

## Frontend modules

| Module | Role |
|--------|------|
| `routes.tsx` | `/`, `/batches/:id`, `/batches/:id/workspace/:candidateId`, login, user management. |
| `hiringApi.ts` | REST helpers; sends `Authorization: Bearer` when logged in. |
| `HiringInterviewWorkspace.tsx` | Loads/saves `interviewWorkspace`; role-based edit rules (HM vs interviewer). |
| `CandidateDrawer.tsx` | Candidate detail, PDF iframe, workspace link; optional `showFinalRecommendation` for HM-only summary. |

---

## Interview workspace

- Stored as JSON on the candidate (`interviewWorkspace`): rounds, interviewer rows (`ownerUserId`, strengths, concerns, recommendation), optional `finalRecommendation` (hiring manager only in the UI).
- **Hiring manager:** full replace on PATCH.
- **Interviewer:** server merges so each user only updates their own rows; cannot clear the whole workspace or change the stored final recommendation.

---

## Quality checks

- Backend: `uvicorn src.main:app --reload --port 8000`, then `GET /health`.
- Frontend: `npm run build` (TypeScript + bundle).

---

## Limitations

- LLM scoring uses **`resumeText`** unless you add extraction on upload.
- Deleting a candidate may leave an orphan PDF unless CRUD deletes the file.
- Embedded PDF iframes can be unreliable in some browsers; the UI may offer opening in a new tab.
