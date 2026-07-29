#!/usr/bin/env python3
"""Isolated MS-Agent maintenance worker.

Protocol: one JSON request per stdin line, one JSON response per stdout line.
The worker never reads project files and receives no canonical write, MCP, Shell,
SQL, or general network tool. DashScope is the only live network dependency.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

HARNESS_VERSION = "0.5.0"
PROMPT_VERSION = "cyj-maintenance/0.5.0"
TOOL_SCHEMA_VERSION = "cyj-maintenance-tools/0.5.0"
DEFAULT_MODEL = "qwen3.7-flash"


def _response(request_id: str, *, result: Any = None, error: str | None = None) -> dict[str, Any]:
    value: dict[str, Any] = {"request_id": request_id, "harness_version": HARNESS_VERSION}
    if error is not None:
        value.update({"ok": False, "error": error})
    else:
        value.update({"ok": True, "result": result})
    return value


def _offline_plan(packet: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "cyj-maintenance-plan/v1",
        "packet_id": packet["packet_id"],
        "base_knowledge_revision": packet["base_revisions"]["knowledge_revision"],
        "expected_topology_revision": packet["base_revisions"]["topology_revision"],
        "prompt_version": PROMPT_VERSION,
        "tool_schema_version": TOOL_SCHEMA_VERSION,
        "operations": [{"op": "no_change", "reason": "offline contract self-test"}],
        "native_video_evidence_ids": [
            item["evidence_id"] for item in packet.get("media", [])
            if item.get("modality") == "video" and item.get("native_video_required")
        ],
    }


def _extract_json(value: Any) -> dict[str, Any]:
    if isinstance(value, list):
        value = "".join(str(item.get("text", "")) if isinstance(item, dict) else str(item) for item in value)
    if not isinstance(value, str):
        raise ValueError("MS-Agent response content is not text")
    value = value.strip()
    if value.startswith("```"):
        lines = value.splitlines()
        value = "\n".join(lines[1:-1]).strip()
        if value.startswith("json\n"):
            value = value[5:]
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise ValueError("Maintenance plan must be a JSON object")
    return parsed


def _content(packet: dict[str, Any]) -> list[dict[str, Any]]:
    prompt = {
        "role": "knowledge_maintenance_planner",
        "rules": [
            "Return only a cyj-maintenance-plan/v1 JSON object.",
            "Never answer a user or invent project facts.",
            "Every fact-changing operation needs evidence_refs.",
            "Never modify, hide, unlink, or resolve an existing conflict.",
            "Use register_conflict or observe_conflict when evidence disagrees.",
            "A video may be listed in native_video_evidence_ids only if you actually inspected its video_url content.",
        ],
        "packet": {key: value for key, value in packet.items() if key != "media"},
    }
    content: list[dict[str, Any]] = [{"type": "text", "text": json.dumps(prompt, ensure_ascii=False)}]
    for media in packet.get("media", []):
        if media["modality"] == "image":
            content.append({"type": "image_url", "image_url": {"url": media["value"]}})
        elif media["modality"] == "video":
            # OpenAI-compatible Qwen native video message. Do not transform to frames.
            content.append({"type": "video_url", "video_url": {"url": media["value"]}})
    return content


async def _live_plan(packet: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    api_key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not api_key:
        raise RuntimeError("DASHSCOPE_API_KEY is required only for the final live gate")
    try:
        from ms_agent import LLMAgent
        from ms_agent.config import Config
        from ms_agent.llm.utils import Message
    except ImportError as exc:
        raise RuntimeError("ms-agent==1.6.0 is not installed") from exc

    config_path = Path(__file__).with_name("cyj_maintenance_agent.yaml")
    if str(config_path.parent) not in sys.path:
        sys.path.insert(0, str(config_path.parent))
    from tools.cyj_maintenance import set_active_packet, submitted_plan
    set_active_packet(packet)
    config = Config.from_task(str(config_path))
    config.llm.model = options.get("model", DEFAULT_MODEL)
    config.llm.service = "dashscope"
    config.llm.dashscope_api_key = api_key
    config.llm.modelscope_base_url = options.get(
        "base_url", os.environ.get("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    )
    config.generation_config.stream = False
    # The only external plugin is the bundled, hash-verified tools/cyj_maintenance.py.
    agent = LLMAgent(config=config, tag="cyj_knowledge_maintainer", trust_remote_code=True)
    content = _content(packet)
    text_chars = sum(len(item.get("text", "")) for item in content if item.get("type") == "text")
    if text_chars // 4 > packet["budget"]["max_context_tokens_per_step"]:
        raise RuntimeError("maintenance step context budget exceeded before model call")
    messages = [Message(role="user", content=content)]
    result = await agent.run(messages=messages)
    if not result:
        raise RuntimeError("MS-Agent returned no messages")
    prompt_tokens = sum(int(getattr(message, "prompt_tokens", 0) or 0) for message in result)
    completion_tokens = sum(int(getattr(message, "completion_tokens", 0) or 0) for message in result)
    if prompt_tokens > packet["budget"]["max_cumulative_input_tokens"]:
        raise RuntimeError("maintenance cumulative input token budget exceeded")
    if completion_tokens > packet["budget"]["max_cumulative_output_tokens"]:
        raise RuntimeError("maintenance cumulative output token budget exceeded")
    proposed = submitted_plan()
    return proposed if proposed is not None else _extract_json(result[-1].content)


async def _handle(request: dict[str, Any]) -> dict[str, Any]:
    request_id = str(request.get("request_id", ""))
    if request.get("method") == "self_test":
        return _response(request_id, result={
            "framework": "modelscope-ms-agent",
            "framework_version": "1.6.0",
            "default_model": DEFAULT_MODEL,
            "native_content_types": ["text", "image_url", "video_url"],
            "model_tools": ["read_change_packet", "read_document_blocks", "read_evidence", "read_topology_neighborhood", "search_maintenance_evidence", "find_open_conflicts", "submit_maintenance_plan", "finish_no_change", "report_insufficient_evidence"],
            "forbidden_tools": ["shell", "filesystem", "network", "sql", "mcp", "canonical_write", "user_answering"],
            "api_key_present": bool(os.environ.get("DASHSCOPE_API_KEY")),
        })
    if request.get("method") != "propose":
        return _response(request_id, error="unsupported method")
    packet = request.get("packet")
    if not isinstance(packet, dict):
        return _response(request_id, error="packet must be an object")
    mode = request.get("mode", "live")
    plan = _offline_plan(packet) if mode == "offline" else await _live_plan(packet, request.get("options", {}))
    return _response(request_id, result=plan)


async def _main() -> None:
    for line in sys.stdin:
        try:
            request = json.loads(line)
            response = await _handle(request)
        except Exception as exc:  # fail closed at the process boundary
            response = _response("", error=f"{type(exc).__name__}: {exc}")
        sys.stdout.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    asyncio.run(_main())
