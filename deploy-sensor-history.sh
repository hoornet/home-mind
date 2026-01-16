#!/bin/bash
# Deployment script for sensor history feature
# Run from your dev machine (omarchy)

set -e  # Exit on error

echo "=== Deploying Sensor History Feature to LibreChat ==="
echo ""

# Configuration
SERVER="ubuntuserver"
REMOTE_PATH="~/LibreChat/mcp-server"
LOCAL_PATH="src/mcp-server"

echo "Step 1: Copying updated MCP server files to $SERVER..."
scp -r ${LOCAL_PATH}/src/${SERVER}:${REMOTE_PATH}/

echo ""
echo "Step 2: Rebuilding MCP server on $SERVER..."
ssh ${SERVER} << 'ENDSSH'
cd ~/LibreChat
echo "Building MCP server..."
docker run --rm -v ~/LibreChat/mcp-server:/app -w /app node:20 sh -c 'npm install && npm run build'
echo "Build complete!"
ENDSSH

echo ""
echo "Step 3: Restarting LibreChat API container..."
ssh ${SERVER} "cd ~/LibreChat && docker compose restart api"

echo ""
echo "Step 4: Waiting for container to start (10 seconds)..."
sleep 10

echo ""
echo "Step 5: Verifying deployment..."
ssh ${SERVER} "docker logs LibreChat 2>&1 | grep -A 5 'MCP.*homeassistant' | tail -20"

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Look for this line in the logs above:"
echo "  [MCP][homeassistant] Tools: get_state, get_entities, search_entities, call_service, get_history"
echo ""
echo "If you see 5 tools (including get_history), deployment was successful!"
echo ""
echo "Test with Claude:"
echo "  'How has the living room temperature changed since this morning?'"
