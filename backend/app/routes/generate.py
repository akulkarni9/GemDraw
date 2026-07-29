import json
from collections.abc import AsyncGenerator
from typing import Any
from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal, get_db
from app.db.models import Diagram, SessionEntry
from app.models.schemas import GenerateRequest
from app.services.agent_diagram import run_agent_stream

router = APIRouter()


def _coerce_dict(value: Any) -> dict[str, Any]:
    out: dict[str, Any] = {}
    try:
        out.update(value)
    except (TypeError, AttributeError):
        pass
    return out


async def _resolve_diagram(db: AsyncSession, request: GenerateRequest) -> Diagram:
    if request.diagram_id:
        diagram = await db.get(Diagram, request.diagram_id)
        if diagram:
            return diagram
        diagram = Diagram(id=request.diagram_id)
    else:
        diagram = Diagram()
    db.add(diagram)
    await db.flush()
    return diagram


def _apply_op(state: dict[str, dict[str, Any]], op: dict[str, Any]) -> None:
    nodes, edges = state["nodes"], state["edges"]
    classes, relations = state["classes"], state["relations"]
    evt = op.get("event")
    if evt == "CREATE_NODE":
        nodes[op["id"]] = {"id": op["id"], "type": op["type"], "label": op["label"], "x": op["x"], "y": op["y"]}
    elif evt == "CONNECT_NODES":
        edges[op["id"]] = {"id": op["id"], "fromId": op["fromId"], "toId": op["toId"], "label": op.get("label", "")}
    elif evt == "MODIFY_NODE" and op["id"] in nodes:
        nodes[op["id"]].update(op.get("updates", {}))
    elif evt == "DELETE_NODE":
        nodes.pop(op["id"], None)
    elif evt == "CREATE_CLASS":
        existing = classes.get(op["id"], {"fields": [], "methods": []})
        classes[op["id"]] = {
            "id": op["id"],
            "name": op["name"],
            "stereotype": op.get("stereotype", ""),
            "x": op["x"],
            "y": op["y"],
            "fields": existing["fields"],
            "methods": existing["methods"],
        }
    elif evt == "ADD_FIELD" and op["classId"] in classes:
        fields = [f for f in classes[op["classId"]]["fields"] if f["name"] != op["name"]]
        fields.append({"visibility": op.get("visibility", "-"), "name": op["name"], "type": op.get("type", "")})
        classes[op["classId"]]["fields"] = fields
    elif evt == "ADD_METHOD" and op["classId"] in classes:
        methods = [m for m in classes[op["classId"]]["methods"] if m["name"] != op["name"]]
        methods.append({
            "visibility": op.get("visibility", "+"),
            "name": op["name"],
            "params": op.get("params", ""),
            "returns": op.get("returns", ""),
        })
        classes[op["classId"]]["methods"] = methods
    elif evt == "CREATE_RELATION":
        relations[op["id"]] = {
            "id": op["id"],
            "fromId": op["fromId"],
            "toId": op["toId"],
            "kind": op.get("kind", "association"),
            "label": op.get("label", ""),
        }


def _reduce_canvas_state(canvas_state: dict[str, Any], emitted_ops: list[dict[str, Any]]) -> dict[str, Any]:
    state = {
        "nodes": {n["id"]: n for n in canvas_state.get("nodes", [])},
        "edges": {e["id"]: e for e in canvas_state.get("edges", [])},
        "classes": {c["id"]: c for c in canvas_state.get("classes", [])},
        "relations": {r["id"]: r for r in canvas_state.get("relations", [])},
    }
    for op in emitted_ops:
        _apply_op(state, op)
    return {
        "nodes": list(state["nodes"].values()),
        "edges": list(state["edges"].values()),
        "classes": list(state["classes"].values()),
        "relations": list(state["relations"].values()),
    }


@router.post("/generate")
async def generate(request: GenerateRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    diagram = await _resolve_diagram(db, request)
    await db.commit()  # Ensure diagram row exists before background task references it

    canvas_state: dict[str, Any] = _coerce_dict(request.canvas_state or diagram.canvas_state)
    parent_node_id = request.parent_node_id or diagram.parent_node_id
    diagram_id = str(diagram.id)
    emitted_ops: list[dict[str, Any]] = []

    async def event_stream() -> AsyncGenerator[str, None]:
        async for event_dict in run_agent_stream(
            request.prompt,
            canvas_state,
            detail_level=request.detail_level,
            parent_node_id=parent_node_id,
        ):
            emitted_ops.append(event_dict)
            yield f"data: {json.dumps(event_dict)}\n\n"
        yield f"data: {json.dumps({'event': 'DIAGRAM_ID', 'id': diagram_id})}\n\n"

    async def persist() -> None:
        async with AsyncSessionLocal() as session:
            try:
                entry = SessionEntry(
                    diagram_id=diagram_id,
                    prompt=request.prompt,
                    response_ops=emitted_ops,
                )
                session.add(entry)
                d = await session.get(Diagram, diagram_id)
                if d:
                    d.canvas_state = _reduce_canvas_state(canvas_state, emitted_ops)
                await session.commit()
            except Exception:
                await session.rollback()

    background_tasks.add_task(persist)
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
