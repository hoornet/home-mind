# LibreChat Configuration

This directory contains example configuration files for integrating the Home Assistant MCP server with LibreChat.

## Files

- `librechat.yaml.example` - LibreChat configuration with MCP server settings
- `docker-compose.override.yml.example` - Docker Compose override to mount MCP server

## Setup

1. Copy the MCP server to your LibreChat directory:
   ```bash
   cp -r /path/to/librechat-homeassistant/src/mcp-server /path/to/LibreChat/
   ```

2. Build the MCP server:
   ```bash
   cd /path/to/LibreChat
   docker run --rm -v $(pwd)/mcp-server:/app -w /app node:20 sh -c 'npm install && npm run build'
   ```

3. Copy and customize the configuration files:
   ```bash
   cp librechat.yaml.example /path/to/LibreChat/librechat.yaml
   cp docker-compose.override.yml.example /path/to/LibreChat/docker-compose.override.yml
   ```

4. Edit `librechat.yaml` with your Home Assistant details:
   - `HA_URL`: Your Home Assistant URL
   - `HA_TOKEN`: Long-lived access token from HA

5. Restart LibreChat:
   ```bash
   cd /path/to/LibreChat
   docker compose down && docker compose up -d
   ```

## Verification

Check the LibreChat logs to verify MCP server initialization:
```bash
docker logs LibreChat 2>&1 | grep -i mcp
```

You should see:
```
[MCP][homeassistant] Tools: get_state, get_entities, search_entities, call_service
[MCP] Initialized with 1 configured server and 4 tools.
```
