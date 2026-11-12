"""Command-line entry point for the Garmin MCP server."""

import asyncio

from garmin_mcp.server import main as serve


def main() -> None:
    asyncio.run(serve())
