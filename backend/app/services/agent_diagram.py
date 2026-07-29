"""ADK multi-agent diagram generation.

Each tool maps 1:1 to a frontend drawing event. The agents (a *builder* and a
*critic*) call these tools; every tool call is recorded into a per-request
collector so the FastAPI route can stream it to the client as SSE — preserving
the exact wire format the tldraw adapter already understands.
"""

from __future__ import annotations

import contextvars
import json
import os
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.planners import BuiltInPlanner
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from app.config import settings

# LiteLLM reads the Ollama endpoint from this env var.
os.environ.setdefault("OLLAMA_API_BASE", settings.ollama_base_url)

# Per-request list of emitted ops. Set by run_agent_stream before the runner
# starts; tools append to it, the route drains it to stream each op live.
_ops_var: contextvars.ContextVar[list[dict[str, Any]] | None] = contextvars.ContextVar(
    "gemdraw_ops", default=None
)


def _record(event: str, **fields: Any) -> dict[str, Any]:
    ops = _ops_var.get(None)
    if ops is None:
        # The context var did not propagate to the tool execution context.
        # Fail loudly rather than silently dropping the drawing op.
        raise RuntimeError("gemdraw op collector missing from context; cannot record tool call")
    ops.append({"event": event, **fields})
    return {"status": "ok"}


# --------------------------------------------------------------------------- #
# HLD tools                                                                    #
# --------------------------------------------------------------------------- #
def create_node(id: str, type: str, label: str, x: int, y: int) -> dict[str, Any]:
    """Create an architecture node.

    Args:
        id: short snake_case id (e.g. api_gw).
        type: one of service, database, cache, queue, load_balancer, client.
        label: human-readable name shown on the node.
        x: horizontal position (client=150, load_balancer=550, service=950, store=1350).
        y: vertical position (stack nodes 250px apart: 100, 350, 600, ...).
    """
    return _record("CREATE_NODE", id=id, type=type, label=label, x=x, y=y)


def connect_nodes(id: str, from_id: str, to_id: str, label: str = "") -> dict[str, Any]:
    """Draw a directed edge between two existing nodes.

    Args:
        id: short unique edge id.
        from_id: id of the source node (must already exist).
        to_id: id of the target node (must already exist).
        label: short protocol label (<=14 chars), e.g. gRPC, SQL, Kafka.
    """
    return _record("CONNECT_NODES", id=id, fromId=from_id, toId=to_id, label=label)


def group_nodes(id: str, label: str, node_ids: list[str]) -> dict[str, Any]:
    """Draw a labelled frame around a set of related nodes.

    Args:
        id: short unique group id.
        label: group name (e.g. "Core Services").
        node_ids: ids of the nodes to enclose.
    """
    return _record("GROUP_NODES", id=id, label=label, nodeIds=node_ids)


def modify_node(id: str, updates: dict[str, Any]) -> dict[str, Any]:
    """Update fields (e.g. label) of an existing node."""
    return _record("MODIFY_NODE", id=id, updates=updates)


def delete_node(id: str) -> dict[str, Any]:
    """Delete an existing node by id."""
    return _record("DELETE_NODE", id=id)


# --------------------------------------------------------------------------- #
# LLD tools                                                                    #
# --------------------------------------------------------------------------- #
def create_class(id: str, name: str, x: int, y: int, stereotype: str = "") -> dict[str, Any]:
    """Create a UML class box.

    Args:
        id: short snake_case id (e.g. user_svc).
        name: PascalCase class name.
        x: horizontal position (grid steps of 320).
        y: vertical position (grid steps of 300).
        stereotype: one of service, entity, repository, controller, interface.
    """
    return _record("CREATE_CLASS", id=id, name=name, x=x, y=y, stereotype=stereotype)


def add_field(class_id: str, name: str, type: str = "", visibility: str = "-") -> dict[str, Any]:
    """Add a typed field to a class.

    Args:
        class_id: id of the target class.
        name: field name.
        type: field type.
        visibility: one of + (public), - (private), # (protected), ~ (package).
    """
    return _record("ADD_FIELD", classId=class_id, name=name, type=type, visibility=visibility)


def add_method(
    class_id: str, name: str, params: str = "", returns: str = "", visibility: str = "+"
) -> dict[str, Any]:
    """Add a method to a class.

    Args:
        class_id: id of the target class.
        name: method name.
        params: parameter list, e.g. "id: UUID, name: str".
        returns: return type.
        visibility: one of + (public), - (private), # (protected), ~ (package).
    """
    return _record(
        "ADD_METHOD", classId=class_id, name=name, params=params, returns=returns, visibility=visibility
    )


def create_relation(
    id: str, from_id: str, to_id: str, kind: str = "association", label: str = ""
) -> dict[str, Any]:
    """Draw a UML relationship between two classes.

    Args:
        id: short unique relation id.
        from_id: source class id.
        to_id: target class id.
        kind: one of dependency, composition, aggregation, inheritance, association.
        label: multiplicity or role label (e.g. "1", "0..*", "uses").
    """
    return _record("CREATE_RELATION", id=id, fromId=from_id, toId=to_id, kind=kind, label=label)


# --------------------------------------------------------------------------- #
# Agents                                                                       #
# --------------------------------------------------------------------------- #
def _model() -> LiteLlm:
    return LiteLlm(
        model=f"ollama_chat/{settings.ollama_model}",
        api_base=settings.ollama_base_url,
        temperature=settings.ollama_temperature,
        num_ctx=settings.ollama_num_ctx,
        num_predict=settings.ollama_num_predict,
    )


def _planner() -> BuiltInPlanner:
    # Let Gemma reason about the full component/class list before emitting tool
    # calls. Thoughts are not surfaced, so they never pollute the op stream.
    return BuiltInPlanner(thinking_config=types.ThinkingConfig(include_thoughts=False))


_HLD_BUILDER = LlmAgent(
    name="hld_builder",
    model=_model(),
    planner=_planner(),
    description="Builds a high-level system architecture diagram by calling drawing tools.",
    instruction=(
        "You are a principal software architect. Build a high-level design (HLD) for the "
        "user's system by CALLING the drawing tools — never write JSON or prose.\n"
        "Process: first call create_node for EVERY component (client, gateway/load_balancer, "
        "each service, each datastore), then call connect_nodes for every relationship, then "
        "group_nodes for tightly-related services.\n"
        "Batch aggressively: emit ALL create_node calls together, then ALL connect_nodes calls, "
        "rather than one tool call per turn.\n"
        "Layout: client x=150, load_balancer x=550, service x=950, database/cache/queue x=1350. "
        "Stack nodes in a column at y=100,350,600,850,1100 — never reuse a (x,y) slot, and if a "
        "column would exceed 5 nodes, spill into an intermediate x (e.g. 750 or 1150). Prefer "
        "connecting adjacent columns.\n"
        "Quality: connect EVERY service to its datastore(s); leave no node disconnected. Keep "
        "edge labels short (<=14 chars). Use ids in short snake_case.\n"
        "Worked example for 'client -> gateway -> service -> postgres':\n"
        "  create_node(id='client', type='client', label='Client', x=150, y=100)\n"
        "  create_node(id='gw', type='load_balancer', label='API Gateway', x=550, y=100)\n"
        "  create_node(id='svc', type='service', label='App Service', x=950, y=100)\n"
        "  create_node(id='db', type='database', label='Postgres', x=1350, y=100)\n"
        "  connect_nodes(id='e1', from_id='client', to_id='gw', label='HTTPS')\n"
        "  connect_nodes(id='e2', from_id='gw', to_id='svc', label='REST')\n"
        "  connect_nodes(id='e3', from_id='svc', to_id='db', label='SQL')\n"
        "When editing an existing diagram, reuse existing ids and only add/modify what changed.\n"
        "When the diagram is complete, reply with the single word DONE."
    ),
    tools=[create_node, connect_nodes, group_nodes, modify_node, delete_node],
)

_HLD_CRITIC = LlmAgent(
    name="hld_critic",
    model=_model(),
    description="Reviews the architecture and fixes gaps by calling tools.",
    instruction=(
        "You are a design reviewer. Inspect the diagram just built (visible in the tool-call "
        "history). Fix problems by CALLING tools:\n"
        "- If any service has no connection to a datastore, add it with connect_nodes.\n"
        "- If any node is disconnected, connect it appropriately.\n"
        "- If tightly-related services are not grouped, add a group_nodes frame.\n"
        "- If two nodes would overlap, move one with modify_node.\n"
        "Only emit corrective tool calls. If the design is already sound, reply DONE and call nothing."
    ),
    tools=[create_node, connect_nodes, group_nodes, modify_node, delete_node],
)

_LLD_BUILDER = LlmAgent(
    name="lld_builder",
    model=_model(),
    planner=_planner(),
    description="Builds a UML class diagram for one component by calling drawing tools.",
    instruction=(
        "You are a senior engineer producing a low-level design (LLD) UML class diagram for the "
        "component the user asks about. Build it by CALLING tools — never write JSON or prose.\n"
        "Process: call create_class for each class (a controller, a service, an interface "
        "repository, and entities), then add_field / add_method for each, then create_relation.\n"
        "Batch aggressively: emit all create_class calls, then their fields/methods, then relations.\n"
        "Design 3-7 cohesive classes that realistically implement the component. Give typed fields "
        "and method signatures. Use inheritance for interface implementations, dependency/"
        "aggregation for collaborators. Grid: x steps of 320, y steps of 300.\n"
        "Worked example for a 'UserService' with a repository:\n"
        "  create_class(id='svc', name='UserService', x=0, y=0, stereotype='service')\n"
        "  create_class(id='repo', name='UserRepository', x=320, y=0, stereotype='interface')\n"
        "  add_field(class_id='svc', name='repo', type='UserRepository', visibility='-')\n"
        "  add_method(class_id='svc', name='getUser', params='id: UUID', returns='User')\n"
        "  create_relation(id='r1', from_id='svc', to_id='repo', kind='aggregation', label='uses')\n"
        "When editing, reuse existing ids and only add what changed. Reply DONE when finished."
    ),
    tools=[create_class, add_field, add_method, create_relation],
)

_LLD_CRITIC = LlmAgent(
    name="lld_critic",
    model=_model(),
    description="Reviews the class diagram and fixes gaps by calling tools.",
    instruction=(
        "You are a design reviewer for a UML class diagram (visible in the tool-call history). "
        "Fix problems by CALLING tools:\n"
        "- If a service class references a repository but no relation exists, add create_relation.\n"
        "- If a class has no fields or methods, add realistic ones.\n"
        "- If an interface has no implementer, add an inheritance relation.\n"
        "Only emit corrective tool calls. If sound, reply DONE and call nothing."
    ),
    tools=[create_class, add_field, add_method, create_relation],
)

_HLD_PIPELINE = (_HLD_BUILDER, _HLD_CRITIC)
_LLD_PIPELINE = (_LLD_BUILDER, _LLD_CRITIC)

_APP_NAME = "gemdraw"
_session_service = InMemorySessionService()


def _build_user_message(
    prompt: str, canvas_state: dict[str, Any], detail_level: str, parent_node_id: str | None
) -> str:
    parts = [f"User request: {prompt}"]
    if detail_level == "lld" and parent_node_id:
        parts.append(
            f"You are drilling into the '{parent_node_id}' component of the current architecture. "
            "Design ONLY that component's internal classes."
        )
    if canvas_state:
        parts.append("Current diagram (reuse these ids when editing):\n" + json.dumps(canvas_state))
    return "\n\n".join(parts)


def _critic_message(detail_level: str, parent_node_id: str | None) -> str:
    base = "Review the diagram you just built and fix any gaps by calling tools. Reply DONE if sound."
    if detail_level == "lld" and parent_node_id:
        return (
            f"Stay focused ONLY on the '{parent_node_id}' component's internal classes. " + base
        )
    return base


async def _run_agent(
    agent: LlmAgent, user_id: str, session_id: str, text: str, ops: list[dict[str, Any]], drained: int
) -> AsyncGenerator[dict[str, Any], None]:
    """Run one agent on a shared session, yielding ops as its tools fire."""
    runner = Runner(agent=agent, app_name=_APP_NAME, session_service=_session_service)
    message = types.Content(role="user", parts=[types.Part(text=text)])
    async for _event in runner.run_async(user_id=user_id, session_id=session_id, new_message=message):
        while drained < len(ops):
            yield ops[drained]
            drained += 1
    while drained < len(ops):
        yield ops[drained]
        drained += 1


async def run_agent_stream(
    prompt: str,
    canvas_state: dict[str, Any],
    detail_level: str = "hld",
    parent_node_id: str | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """Run the builder then critic on a shared session, yielding each drawing op live."""
    ops: list[dict[str, Any]] = []
    _ops_var.set(ops)

    builder, critic = _LLD_PIPELINE if detail_level == "lld" else _HLD_PIPELINE
    user_id = "user"
    session_id = uuid.uuid4().hex
    await _session_service.create_session(app_name=_APP_NAME, user_id=user_id, session_id=session_id)

    try:
        # Builder pass.
        async for op in _run_agent(
            builder,
            user_id,
            session_id,
            _build_user_message(prompt, canvas_state, detail_level, parent_node_id),
            ops,
            len(ops),
        ):
            yield op

        # Local models sometimes reply DONE without calling any tool, leaving a
        # blank canvas. Retry once with a firmer nudge before giving up.
        if not ops:
            async for op in _run_agent(
                builder,
                user_id,
                session_id,
                "You did not call any tools, so nothing was drawn. You MUST build the diagram "
                "now by calling the drawing tools. Do not reply with prose.",
                ops,
                len(ops),
            ):
                yield op

        if not ops:
            yield {
                "event": "ERROR",
                "message": "The model did not produce a diagram. Please try rephrasing your prompt.",
            }
            return

        # Critic pass on the same session, so it sees the builder's tool calls.
        async for op in _run_agent(
            critic,
            user_id,
            session_id,
            _critic_message(detail_level, parent_node_id),
            ops,
            len(ops),
        ):
            yield op
    except Exception as exc:  # surface failures to the client instead of a dead stream
        yield {"event": "ERROR", "message": str(exc)}
    finally:
        # Free the in-memory session so long-running servers don't leak.
        try:
            await _session_service.delete_session(
                app_name=_APP_NAME, user_id=user_id, session_id=session_id
            )
        except Exception:
            pass

