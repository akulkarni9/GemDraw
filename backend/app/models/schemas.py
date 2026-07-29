import uuid
from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel


class GenerateRequest(BaseModel):
    prompt: str
    diagram_id: uuid.UUID | None = None
    canvas_state: dict[str, Any] = {}
    detail_level: Literal["hld", "lld"] = "hld"
    parent_node_id: str | None = None


class DiagramCreate(BaseModel):
    name: str = "Untitled"


class DrillDownRequest(BaseModel):
    node_id: str


class DiagramUpdate(BaseModel):
    name: str | None = None
    canvas_state: dict[str, Any] | None = None


class DiagramSchema(BaseModel):
    id: uuid.UUID
    name: str
    canvas_state: dict[str, Any]
    parent_diagram_id: uuid.UUID | None = None
    parent_node_id: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SessionEntrySchema(BaseModel):
    id: uuid.UUID
    diagram_id: uuid.UUID
    prompt: str
    response_ops: list[dict[str, Any]]
    created_at: datetime

    model_config = {"from_attributes": True}
