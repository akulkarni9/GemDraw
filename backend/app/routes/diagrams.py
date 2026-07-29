import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import Diagram
from app.models.schemas import DiagramCreate, DiagramSchema, DiagramUpdate, DrillDownRequest

router = APIRouter()

NOT_FOUND_DETAIL = "Diagram not found"


@router.get("/diagrams", response_model=list[DiagramSchema])
async def list_diagrams(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Diagram).order_by(Diagram.updated_at.desc()))
    return result.scalars().all()


@router.post("/diagrams/{parent_id}/drilldown", response_model=DiagramSchema)
async def drilldown(parent_id: uuid.UUID, body: DrillDownRequest, db: AsyncSession = Depends(get_db)):
    """Get or create the low-level design child diagram for a node in a parent diagram."""
    parent = await db.get(Diagram, parent_id)
    if not parent:
        raise HTTPException(status_code=404, detail=NOT_FOUND_DETAIL)

    result = await db.execute(
        select(Diagram).where(
            Diagram.parent_diagram_id == parent_id,
            Diagram.parent_node_id == body.node_id,
        )
    )
    child = result.scalars().first()
    if child is None:
        child = Diagram(
            name=f"{parent.name} · {body.node_id}",
            parent_diagram_id=parent_id,
            parent_node_id=body.node_id,
        )
        db.add(child)
        await db.commit()
        await db.refresh(child)
    return child


@router.post("/diagrams", response_model=DiagramSchema)
async def create_diagram(body: DiagramCreate, db: AsyncSession = Depends(get_db)):
    diagram = Diagram(name=body.name)
    db.add(diagram)
    await db.commit()
    await db.refresh(diagram)
    return diagram


@router.get("/diagrams/{diagram_id}", response_model=DiagramSchema)
async def get_diagram(diagram_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    diagram = await db.get(Diagram, diagram_id)
    if not diagram:
        raise HTTPException(status_code=404, detail=NOT_FOUND_DETAIL)
    return diagram


@router.patch("/diagrams/{diagram_id}", response_model=DiagramSchema)
async def update_diagram(diagram_id: uuid.UUID, body: DiagramUpdate, db: AsyncSession = Depends(get_db)):
    diagram = await db.get(Diagram, diagram_id)
    if not diagram:
        raise HTTPException(status_code=404, detail=NOT_FOUND_DETAIL)
    if body.name is not None:
        diagram.name = body.name
    if body.canvas_state is not None:
        diagram.canvas_state = body.canvas_state
    await db.commit()
    await db.refresh(diagram)
    return diagram


@router.delete("/diagrams/{diagram_id}", status_code=204)
async def delete_diagram(diagram_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    diagram = await db.get(Diagram, diagram_id)
    if not diagram:
        raise HTTPException(status_code=404, detail=NOT_FOUND_DETAIL)
    await db.delete(diagram)
    await db.commit()
