"""Packet-scoped read tools for the Changyi Jiuan maintenance Agent.

There is deliberately no filesystem, shell, SQL, MCP, or network method here.
"""

from __future__ import annotations

import json
from typing import Any

from ms_agent.llm.utils import Tool
from ms_agent.tools.base import ToolBase

_ACTIVE_PACKET: dict[str, Any] = {}
_SUBMITTED_PLAN: dict[str, Any] | None = None
_TOOL_CALLS = 0


def set_active_packet(packet: dict[str, Any]) -> None:
    global _ACTIVE_PACKET, _SUBMITTED_PLAN, _TOOL_CALLS
    _ACTIVE_PACKET = packet
    _SUBMITTED_PLAN = None
    _TOOL_CALLS = 0


def _guard() -> None:
    global _TOOL_CALLS
    _TOOL_CALLS += 1
    if _TOOL_CALLS > 8:
        raise RuntimeError("maintenance tool-call budget exhausted")


def submitted_plan() -> dict[str, Any] | None:
    return _SUBMITTED_PLAN


class CyjMaintenanceTool(ToolBase):
    def __init__(self, config):
        super().__init__(config)

    async def connect(self):
        return None

    async def cleanup(self):
        return None

    async def get_tools(self):
        no_args = {"type": "object", "properties": {}, "additionalProperties": False}
        return {"cyj_maintenance": [
            Tool(tool_name="read_change_packet", server_name="cyj_maintenance", description="Read the bounded change packet supplied by the deterministic harness.", parameters=no_args),
            Tool(tool_name="read_document_blocks", server_name="cyj_maintenance", description="Read only the routed document blocks embedded in this bounded packet.", parameters={"type": "object", "properties": {"section_refs": {"type": "array", "items": {"type": "string"}, "maxItems": 6}}, "required": ["section_refs"], "additionalProperties": False}),
            Tool(tool_name="read_evidence", server_name="cyj_maintenance", description="Read one evidence item already present in this packet by evidence_id.", parameters={"type": "object", "properties": {"evidence_id": {"type": "string"}}, "required": ["evidence_id"], "additionalProperties": False}),
            Tool(tool_name="read_topology_neighborhood", server_name="cyj_maintenance", description="Read the packet-routed section and conflict neighborhood; never traverses the full library.", parameters=no_args),
            Tool(tool_name="search_maintenance_evidence", server_name="cyj_maintenance", description="Search only evidence already selected into this ChangePacket.", parameters={"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"], "additionalProperties": False}),
            Tool(tool_name="find_open_conflicts", server_name="cyj_maintenance", description="List conflict references already routed into this packet.", parameters=no_args),
            Tool(tool_name="submit_maintenance_plan", server_name="cyj_maintenance", description="Submit the final cyj-maintenance-plan/v1 object. This records a proposal only and performs no write.", parameters={"type": "object", "properties": {"plan": {"type": "object"}}, "required": ["plan"], "additionalProperties": False}),
            Tool(tool_name="finish_no_change", server_name="cyj_maintenance", description="Return a no-change plan when no durable knowledge update is supported.", parameters={"type": "object", "properties": {"reason": {"type": "string"}}, "required": ["reason"], "additionalProperties": False}),
            Tool(tool_name="report_insufficient_evidence", server_name="cyj_maintenance", description="Report that the packet must be quarantined for insufficient evidence.", parameters={"type": "object", "properties": {"reason": {"type": "string"}}, "required": ["reason"], "additionalProperties": False}),
        ]}

    async def read_change_packet(self) -> str:
        _guard()
        return json.dumps({key: value for key, value in _ACTIVE_PACKET.items() if key != "media"}, ensure_ascii=False)

    async def read_evidence(self, evidence_id: str) -> str:
        _guard()
        if evidence_id not in _ACTIVE_PACKET.get("evidence_refs", []):
            return json.dumps({"error": "evidence_not_in_packet"})
        media = next((item for item in _ACTIVE_PACKET.get("media", []) if item.get("evidence_id") == evidence_id), None)
        return json.dumps({"evidence_id": evidence_id, "media": media}, ensure_ascii=False)

    async def read_document_blocks(self, section_refs: list[str]) -> str:
        _guard()
        allowed = set(_ACTIVE_PACKET.get("candidate_section_refs", []))
        if any(ref not in allowed for ref in section_refs):
            return json.dumps({"error": "section_not_in_packet"})
        return json.dumps({"section_refs": section_refs, "text_context": _ACTIVE_PACKET.get("text_context", "")}, ensure_ascii=False)

    async def read_topology_neighborhood(self) -> str:
        _guard()
        return json.dumps({"sections": _ACTIVE_PACKET.get("candidate_section_refs", []), "conflicts": _ACTIVE_PACKET.get("open_conflict_refs", [])}, ensure_ascii=False)

    async def search_maintenance_evidence(self, query: str) -> str:
        _guard()
        return json.dumps({"query": query, "evidence_refs": _ACTIVE_PACKET.get("evidence_refs", []), "text_context": _ACTIVE_PACKET.get("text_context", "")}, ensure_ascii=False)

    async def find_open_conflicts(self) -> str:
        _guard()
        return json.dumps(_ACTIVE_PACKET.get("open_conflict_refs", []), ensure_ascii=False)

    async def submit_maintenance_plan(self, plan: dict[str, Any]) -> str:
        _guard()
        global _SUBMITTED_PLAN
        _SUBMITTED_PLAN = plan
        return json.dumps({"accepted_as_proposal": True, "commit_performed": False})

    async def finish_no_change(self, reason: str) -> str:
        _guard()
        global _SUBMITTED_PLAN
        _SUBMITTED_PLAN = {
            "schema": "cyj-maintenance-plan/v1", "packet_id": _ACTIVE_PACKET["packet_id"],
            "base_knowledge_revision": _ACTIVE_PACKET["base_revisions"]["knowledge_revision"],
            "expected_topology_revision": _ACTIVE_PACKET["base_revisions"]["topology_revision"],
            "prompt_version": "cyj-maintenance/0.5.0", "tool_schema_version": "cyj-maintenance-tools/0.5.0",
            "operations": [{"op": "no_change", "reason": reason}], "native_video_evidence_ids": [],
        }
        return json.dumps({"accepted_as_proposal": True, "commit_performed": False})

    async def report_insufficient_evidence(self, reason: str) -> str:
        _guard()
        return json.dumps({"quarantine_required": True, "reason": reason})
