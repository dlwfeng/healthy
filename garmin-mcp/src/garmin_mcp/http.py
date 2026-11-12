"""Private Streamable HTTP entry point for the Garmin MCP server."""

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route

from garmin_mcp.server import HEALTH_TOOLS, create_server


def configuration_state() -> str:
    path = Path(os.environ.get("GARMIN_CONFIG_PATH", "config/garmin.json"))
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
        email = config.get("email")
        password = config.get("password")
        if email and password and not str(email).startswith("your_") and not str(password).startswith("your_"):
            return "ready"
    except (OSError, ValueError, AttributeError):
        pass
    return "not_configured"


async def health(request):
    return JSONResponse({"state": configuration_state()})


class McpApp:
    def __init__(self, manager):
        self.manager = manager

    async def __call__(self, scope, receive, send):
        await self.manager.handle_request(scope, receive, send)


def create_app():
    port = int(os.environ.get("MCP_PORT", "8765"))
    manager = StreamableHTTPSessionManager(
        app=create_server(allowed_tools=HEALTH_TOOLS),
        security_settings=TransportSecuritySettings(
            allowed_hosts=[f"mcp:{port}", f"localhost:{port}", f"127.0.0.1:{port}"],
        ),
    )

    @asynccontextmanager
    async def lifespan(app):
        async with manager.run():
            yield

    return Starlette(
        routes=[Route("/health", health), Route("/mcp", McpApp(manager))],
        lifespan=lifespan,
    )


def main():
    uvicorn.run(create_app(), host=os.environ.get("MCP_BIND_HOST", "127.0.0.1"), port=int(os.environ.get("MCP_PORT", "8765")))


if __name__ == "__main__":
    main()
