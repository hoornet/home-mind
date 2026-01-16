# Manual Deployment Instructions

If you prefer to deploy step-by-step instead of using the script:

## 1. Copy Files to Server

From your dev machine (omarchy):

```bash
cd ~/projects/librechat-homeassistant

# Copy updated MCP server source
scp -r src/mcp-server/src/ ubuntuserver:~/LibreChat/mcp-server/
```

## 2. Rebuild MCP Server

SSH into the server and rebuild:

```bash
ssh ubuntuserver

cd ~/LibreChat

# Rebuild the TypeScript MCP server
docker run --rm -v ~/LibreChat/mcp-server:/app -w /app node:20 sh -c 'npm install && npm run build'
```

Expected output:
```
> @librechat-homeassistant/mcp-server@0.1.0 build
> tsc

[no errors = success]
```

## 3. Restart LibreChat

```bash
docker compose restart api
```

## 4. Verify Deployment

Check the logs to confirm the new tool is loaded:

```bash
docker logs LibreChat 2>&1 | grep -A 5 "MCP.*homeassistant"
```

**Expected output:**
```
[MCP][homeassistant] Tools: get_state, get_entities, search_entities, call_service, get_history
[MCP] Initialized with 1 configured server and 5 tools.
```

Key indicators:
- ✅ **5 tools** (was 4 before)
- ✅ **get_history** appears in the list
- ❌ Any errors mentioning "get_history"

## 5. Test the Feature

Open LibreChat and try these queries:

### Test 1: Default 24h History
```
How has the living room temperature changed today?
```

### Test 2: Specific Time Range
```
What was the workshop temperature this morning between 8am and noon?
```

### Test 3: Multiple Sensors
```
Show me CO2 levels for the last 3 hours
```

### Test 4: With Memory
```
Is today's temperature trend normal compared to what you remember?
```

## Troubleshooting

### Issue: "Unknown tool: get_history"
**Cause:** MCP server not rebuilt or not restarted
**Fix:** 
```bash
ssh ubuntuserver
cd ~/LibreChat
docker run --rm -v ~/LibreChat/mcp-server:/app -w /app node:20 sh -c 'npm run build'
docker compose restart api
```

### Issue: "Cannot find module './ha-client.js'"
**Cause:** Files not copied correctly
**Fix:**
```bash
# Verify files exist
ssh ubuntuserver "ls -la ~/LibreChat/mcp-server/src/"

# Should see:
# - index.ts
# - ha-client.ts
# - config.ts
```

### Issue: Build errors
**Cause:** TypeScript compilation errors
**Fix:**
```bash
# Check full build output
ssh ubuntuserver "cd ~/LibreChat/mcp-server && npm run build"

# Look for specific error messages
```

### Issue: Still seeing 4 tools instead of 5
**Cause:** Container not fully restarted
**Fix:**
```bash
ssh ubuntuserver "cd ~/LibreChat && docker compose down && docker compose up -d"
```

## Success Criteria

✅ Build completes without errors
✅ Container restart successful
✅ Logs show "5 tools" including "get_history"
✅ Claude can answer "How has temperature changed since morning?"

## Rollback (If Needed)

If something breaks:

```bash
# On ubuntuserver
cd ~/LibreChat
git checkout main  # Or your last working commit
docker run --rm -v ~/LibreChat/mcp-server:/app -w /app node:20 sh -c 'npm run build'
docker compose restart api
```

## Next Steps After Successful Deployment

1. Test various time ranges
2. Test with different sensor types
3. Document examples in MEMORY_EXAMPLES.md
4. Update PROJECT_PLAN.md to mark Milestone 2.2 complete
5. Announce the feature in your README.md

---

**Deployment Date:** [Fill in after deployment]
**Status:** [Pending/Complete/Failed]
**Notes:** [Any issues encountered]
