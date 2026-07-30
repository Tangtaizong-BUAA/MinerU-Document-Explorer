#!/usr/bin/env python3
"""Load the locked MS-Agent framework and verify the exact restricted tool set."""

import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "src/backends/python/cyj_maintenance_agent.yaml"
RUNTIME_DIR = tempfile.TemporaryDirectory(prefix="cyj-ms-agent-validator-")
os.chdir(RUNTIME_DIR.name)
sys.path.insert(0, str(CONFIG.parent))

from ms_agent import LLMAgent
from ms_agent.config import Config

EXPECTED = {
    "read_change_packet", "read_document_blocks", "read_evidence", "read_topology_neighborhood",
    "search_maintenance_evidence", "find_open_conflicts", "submit_maintenance_plan",
    "finish_no_change", "report_insufficient_evidence",
}


async def main() -> None:
    config = Config.from_task(str(CONFIG))
    agent = LLMAgent(config=config, tag="cyj_validation", trust_remote_code=True)
    await agent.prepare_tools()
    try:
        tools = await agent.tool_manager.get_tools()
        names = set()
        for tool in tools:
            name = tool.tool_name if hasattr(tool, "tool_name") else tool.get("tool_name") or tool.get("function", {}).get("name") or tool.get("name")
            if name:
                names.add(name.split("---")[-1])
        names.discard(None)
        if names != EXPECTED:
            raise RuntimeError(f"Unexpected MS-Agent tool set: {sorted(names)}; raw={tools!r}")
        print(json.dumps({"ok": True, "framework": "ms-agent", "version": "1.6.0", "tools": sorted(names)}))
    finally:
        await agent.cleanup_tools()


if __name__ == "__main__":
    asyncio.run(main())
