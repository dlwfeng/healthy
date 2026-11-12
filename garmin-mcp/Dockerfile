FROM python:3.12-slim

WORKDIR /app

# Install the standalone Garmin MCP package.
COPY pyproject.toml README.md ./
COPY src ./src
COPY config/garmin.example.json ./config/garmin.example.json
RUN pip install --no-cache-dir .

CMD ["python", "-m", "garmin_mcp"]
