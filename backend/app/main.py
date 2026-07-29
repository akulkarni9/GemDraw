import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.db.database import engine, Base
from app.routes import generate, diagrams

# The builder+critic share one ADK session, so the critic's Runner logs a benign
# "Event from an unknown agent" line for every event authored by the builder.
# Quiet just that logger while still surfacing real ADK errors.
logging.getLogger("google_adk.google.adk.runners").setLevel(logging.ERROR)

# Lightweight, idempotent migrations for the no-Alembic dev setup. create_all
# does not ALTER existing tables, so add newer columns here if missing.
_COLUMN_MIGRATIONS = (
    "ALTER TABLE diagrams ADD COLUMN IF NOT EXISTS parent_diagram_id UUID REFERENCES diagrams(id) ON DELETE CASCADE",
    "ALTER TABLE diagrams ADD COLUMN IF NOT EXISTS parent_node_id VARCHAR(255)",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for statement in _COLUMN_MIGRATIONS:
            await conn.execute(text(statement))
    yield
    await engine.dispose()


app = FastAPI(title="GemDraw API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(generate.router, prefix="/api")
app.include_router(diagrams.router, prefix="/api")
