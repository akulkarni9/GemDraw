# GemDraw — Backend

FastAPI service that turns natural-language prompts into architecture diagrams using a **local Gemma 4 26B** model orchestrated through **Google ADK** multi-agent pipelines. Drawing commands stream to the client over Server-Sent Events (SSE).

> For the full product overview see the [root README](../README.md).

---

## Stack

- **FastAPI** + **Uvicorn** — async API with SSE streaming
- **Google ADK** — `LlmAgent`, `BuiltInPlanner`, `Runner`, `InMemorySessionService`
- **LiteLLM → Ollama** — routes ADK to local Gemma (`ollama_chat/gemma4:26b`)
- **SQLAlchemy (async)** + **asyncpg** → **PostgreSQL 16**
- **Pydantic v2**

---

## Layout

```
backend/
├── requirements.txt
├── Dockerfile                  # production image (python:3.13-slim, uvicorn)
├── .env / .env.example        # DATABASE_URL, OLLAMA_* settings
└── app/
    ├── main.py                # FastAPI app, lifespan migrations, log config
    ├── config.py              # Settings (model, ctx, temperature…)
    ├── routes/
    │   ├── generate.py        # /generate SSE endpoint + canvas reduction/persistence
    │   └── diagrams.py        # diagram CRUD + drilldown
    ├── services/
    │   └── agent_diagram.py   # ★ ADK agents, drawing tools, builder→critic pipeline
    ├── models/
    │   ├── schemas.py         # API request/response models
    │   └── events.py          # DrawingEvent union (persistence/reduction)
    └── db/
        ├── database.py        # async engine/session
        └── models.py          # Diagram, SessionEntry tables
```

---

## Setup

Requires **Python 3.13**, a running **Postgres** (see [docker-compose](../docker-compose.yml)), and **Ollama** with the model pulled (`ollama pull gemma4:26b`).

```bash
cd backend
cp .env.example .env            # set DATABASE_URL + OLLAMA_* as needed

python3.13 -m venv .venv313
source .venv313/bin/activate
pip install -r requirements.txt

python -m uvicorn app.main:app --reload --port 8008
```

- API: `http://localhost:8008`
- OpenAPI docs: `http://localhost:8008/docs`

Tables are created and idempotent `ALTER … IF NOT EXISTS` migrations run automatically on startup (no Alembic).

---

## Configuration

Loaded by `app/config.py` from `backend/.env` (all env-overridable):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | *(required)* | `postgresql+asyncpg://user:pass@host:5432/db` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | `gemma4:26b` | Model tag (used as `ollama_chat/<model>`) |
| `OLLAMA_TEMPERATURE` | `0.2` | Lower = more deterministic layouts |
| `OLLAMA_NUM_PREDICT` | `16384` | Max generation tokens (forwarded to Ollama) |
| `OLLAMA_NUM_CTX` | `131072` | Context window (forwarded to Ollama) |
| `CORS_ORIGINS` | `""` | Comma-separated extra browser origins allowed by CORS (localhost/127.0.0.1 on any port are always allowed) |

> **Deployment / reaching a host Ollama from a container:** set `OLLAMA_BASE_URL`
> to the address your Docker runtime exposes the host at — `http://host.docker.internal:11434`
> for Docker Desktop, or `http://192.168.5.2:11434` for Rancher Desktop/Lima/Colima
> — and start Ollama with `OLLAMA_HOST=0.0.0.0:11434 ollama serve` so it binds all
> interfaces. See the [root README Deployment section](../README.md#deployment).

`app/services/agent_diagram.py` is the core. Each ADK **tool maps 1:1 to a frontend drawing event**; ADK auto-generates a typed schema from every function so the model must emit valid, named-argument calls.

Pipeline (`run_agent_stream`):

1. **Builder** `LlmAgent` (with `BuiltInPlanner`) reasons, then calls drawing tools. Retries once if it produced nothing.
2. **Critic** `LlmAgent` runs on the **same session**, seeing the builder's tool calls, and emits corrective calls.
3. Each tool call is appended to a per-request `ContextVar` collector and drained to the route as SSE.
4. On failure, a single `{"event": "ERROR", "message": …}` op is emitted.

| Tool | Event |
|------|-------|
| `create_node` / `connect_nodes` / `group_nodes` | `CREATE_NODE` / `CONNECT_NODES` / `GROUP_NODES` |
| `modify_node` / `delete_node` | `MODIFY_NODE` / `DELETE_NODE` |
| `create_class` / `add_field` / `add_method` | `CREATE_CLASS` / `ADD_FIELD` / `ADD_METHOD` |
| `create_relation` | `CREATE_RELATION` |

---

## API

Base path: `/api`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/generate` | Stream drawing ops (SSE). Body: `prompt`, `diagram_id?`, `canvas_state?`, `detail_level` (`hld`\|`lld`), `parent_node_id?` |
| `GET` | `/diagrams` | List diagrams |
| `POST` | `/diagrams` | Create a diagram |
| `GET` | `/diagrams/{id}` | Get one diagram |
| `PATCH` | `/diagrams/{id}` | Update name / canvas state |
| `DELETE` | `/diagrams/{id}` | Delete a diagram |
| `POST` | `/diagrams/{parent_id}/drilldown` | Create/return a child diagram for a node |

**SSE wire format:**

```
data: {"event": "CREATE_NODE", "id": "svc", "type": "service", "label": "App", "x": 950, "y": 100}

data: {"event": "CONNECT_NODES", "id": "e1", "fromId": "gw", "toId": "svc", "label": "REST"}

data: {"event": "DIAGRAM_ID", "id": "<uuid>"}
```

---

## Data model

- **`diagrams`** — `id`, `name`, `canvas_state` (JSONB), `parent_diagram_id`, `parent_node_id`, timestamps.
- **`session_entries`** — prompt history: `id`, `diagram_id`, `prompt`, `response_ops` (JSONB), `created_at`.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `DATABASE_URL must be set` | Populate `backend/.env` with a valid `postgresql+asyncpg://…` URL |
| `Address already in use` on `:8008` | `lsof -ti :8008 \| xargs kill -9` |
| Dev server killed (`exit 137`) | Out of memory — lower `OLLAMA_NUM_CTX` (e.g. `32768`) |
| Blank diagram / `ERROR` op | Model produced no tool calls; rephrase. Builder already retries once |
| Can't reach model | Ensure Ollama is running (`ollama list`) and `OLLAMA_BASE_URL` is correct |
| Container: `Connection refused` to Ollama | Bind Ollama to all interfaces (`OLLAMA_HOST=0.0.0.0:11434 ollama serve`, quit the menu-bar app first) and set `OLLAMA_BASE_URL` to the right host address for your runtime (e.g. `192.168.5.2` for Rancher Desktop/Lima) |
| `Event from an unknown agent` logs | Benign — the critic seeing the builder's shared-session events (silenced by default) |
