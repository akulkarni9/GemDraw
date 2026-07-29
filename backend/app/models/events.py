from enum import Enum
from typing import Annotated, Any, Literal, Union
from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class NodeType(str, Enum):
    service = "service"
    database = "database"
    cache = "cache"
    queue = "queue"
    load_balancer = "load_balancer"
    client = "client"


class CreateNode(BaseModel):
    event: Literal["CREATE_NODE"]
    id: str
    type: NodeType
    label: str
    x: float
    y: float


class ConnectNodes(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    event: Literal["CONNECT_NODES"]
    id: str
    fromId: str = Field(validation_alias=AliasChoices("fromId", "fromID", "fromCode", "from", "source", "sourceId"))
    toId: str = Field(validation_alias=AliasChoices("toId", "toID", "toCode", "to", "target", "targetId"))
    label: str = ""


class GroupNodes(BaseModel):
    event: Literal["GROUP_NODES"]
    id: str
    label: str
    nodeIds: list[str]


class ModifyNode(BaseModel):
    event: Literal["MODIFY_NODE"]
    id: str
    updates: dict[str, Any]


class DeleteNode(BaseModel):
    event: Literal["DELETE_NODE"]
    id: str


class CreateClass(BaseModel):
    event: Literal["CREATE_CLASS"]
    id: str
    name: str
    stereotype: str = ""
    x: float
    y: float


class AddField(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    event: Literal["ADD_FIELD"]
    classId: str = Field(validation_alias=AliasChoices("classId", "classCode", "class", "classID"))
    name: str
    type: str = ""
    visibility: Literal["+", "-", "#", "~"] = "-"


class AddMethod(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    event: Literal["ADD_METHOD"]
    classId: str = Field(validation_alias=AliasChoices("classId", "classCode", "class", "classID"))
    name: str
    params: str = ""
    returns: str = ""
    visibility: Literal["+", "-", "#", "~"] = "+"


class CreateRelation(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    event: Literal["CREATE_RELATION"]
    id: str
    fromId: str = Field(validation_alias=AliasChoices("fromId", "fromID", "fromCode", "from", "source", "sourceId"))
    toId: str = Field(validation_alias=AliasChoices("toId", "toID", "toCode", "to", "target", "targetId"))
    kind: Literal["dependency", "composition", "aggregation", "inheritance", "association"] = "association"
    label: str = ""


DrawingEvent = Annotated[
    Union[
        CreateNode,
        ConnectNodes,
        GroupNodes,
        ModifyNode,
        DeleteNode,
        CreateClass,
        AddField,
        AddMethod,
        CreateRelation,
    ],
    Field(discriminator="event"),
]
