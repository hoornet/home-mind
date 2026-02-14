# Troubleshooting

This page covers common issues, how to diagnose them, and provider-specific tips.

## Viewing Logs

The first step for any issue is checking the Docker logs:

```bash
# Home Mind server logs (follow mode)
docker compose logs -f server

# Shodh Memory logs
docker compose logs -f shodh

# Both services
docker compose logs -f

# Last 100 lines of server logs
docker compose logs --tail 100 server
```

For more verbose output, set `LOG_LEVEL=debug` in your `.env` file and restart:

```bash
docker compose restart server
```

## Common Issues

### "Unable to connect" in Home Assistant

The HA integration cannot reach the Home Mind server.

1. **Verify the server is running:**
   ```bash
   curl http://your-server-ip:3100/api/health
   ```
   Expected: `{"status":"ok"}`

2. **Check the URL in the integration config:**
   - Use `http://`, not `https://` (Home Mind does not serve TLS)
   - Use the server's LAN IP or hostname, not `localhost` (unless HA runs on the same machine)
   - Include the port: `http://192.168.1.100:3100`

3. **Check that port 3100 is accessible:**
   - If the server is on a different machine, ensure no firewall blocks port 3100
   - If using Docker on Linux, verify the port mapping: `docker compose ps`

4. **Check container status:**
   ```bash
   docker compose ps
   ```
   Both `home-mind-shodh` and `home-mind-server` should show `Up (healthy)`.

### "Shodh Memory is not available"

The server exits at startup because it cannot reach Shodh.

1. **Check if Shodh is running:**
   ```bash
   docker compose logs shodh
   curl http://localhost:3030/health
   ```

2. **Restart both services:**
   ```bash
   docker compose restart
   ```
   The server depends on Shodh's health check, so it will wait until Shodh is ready.

3. **Check the Shodh binary:**
   - Ensure `shodh-memory-server` and `libonnxruntime.so` are both in `docker/shodh/`
   - The binary requires GLIBC 2.38+ (the Docker image uses Ubuntu 24.04 for this reason)

4. **Check API key match:**
   - `SHODH_API_KEY` in `.env` must match what Shodh is configured with
   - If you ran `deploy.sh`, this is handled automatically

### AI Doesn't Know About My Devices

The LLM responds generically and cannot query or control devices.

1. **Check the Home Assistant connection:**
   ```bash
   docker compose logs server | grep -i "home assistant"
   ```

2. **Verify credentials in `.env`:**
   - `HA_URL` -- must be reachable from inside the Docker container. Use the LAN IP, not `localhost`.
   - `HA_TOKEN` -- must be a valid, non-expired long-lived access token.

3. **Test the HA connection directly:**
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     https://your-ha-url:8123/api/states | head -c 200
   ```

4. **Self-signed certificates:**
   If your HA uses self-signed TLS, set `HA_SKIP_TLS_VERIFY=true` in `.env`.

### Slow Responses (>30 seconds)

1. **This can be normal** for queries involving device control. The LLM may make multiple tool calls (search for entity, get state, call service), each requiring a round-trip.

2. **Check for errors in server logs:**
   ```bash
   docker compose logs -f server
   ```
   Look for timeout errors or retries.

3. **Model choice matters:**
   - Claude Haiku (default) is fastest for Anthropic
   - `gpt-4o-mini` is fastest for OpenAI
   - For Ollama, response time depends entirely on your hardware

4. **Ollama-specific:** If using Ollama, ensure the model is already loaded. The first request after a model cold start can take significantly longer.

### Memory Not Working

Facts are not being remembered across conversations.

1. **Check Shodh health:**
   ```bash
   curl http://localhost:3030/health
   ```

2. **Look for extraction in server logs:**
   ```bash
   docker compose logs server | grep -i "extract"
   ```
   You should see "Extracted facts" entries after conversations where you taught the AI something.

3. **Check stored facts via API:**
   ```bash
   curl http://localhost:3100/api/memory/default
   ```
   This returns all facts for the default user.

4. **Be explicit when teaching:**
   - Works: "Remember that 100 ppm NOx is normal for my home"
   - Works: "Actually, the normal temperature is 21 degrees, not 20"
   - Less reliable: "That's fine" (too vague for fact extraction)

5. **Token limit:**
   If the AI has many facts but seems to miss some, the `MEMORY_TOKEN_LIMIT` (default 1500) may be too low. Increase it in `.env`.

### Voice Commands Not Working

1. **Check that Home Mind is set as the conversation agent:**
   - Settings > Voice Assistants > select your assistant > Conversation agent = "Home Mind"

2. **Disable local command handling:**
   - In the voice assistant settings, turn off "Prefer handling commands locally"
   - This ensures all commands go to Home Mind instead of HA's built-in intent system

3. **Check HA logs:**
   - Settings > System > Logs > filter for "home_mind"

4. **Test with text first:**
   - Open the Assist panel (text mode) and type a command
   - If text works but voice does not, the issue is in the speech-to-text pipeline, not Home Mind

### Server Crashes on Startup

1. **Config validation failure:**
   ```bash
   docker compose logs server | head -30
   ```
   Look for "Configuration errors:" followed by specific field errors. Common causes:
   - Missing `HA_URL` or `HA_TOKEN`
   - Missing API key for the selected provider
   - Invalid URL format

2. **Shodh not ready:**
   The server exits with code 1 if Shodh is not healthy at startup. Check that the Shodh container is running and its health check passes.

## Restarting Services

```bash
# Restart both services
docker compose restart

# Restart only the server (e.g., after .env changes)
docker compose restart server

# Full rebuild and restart (after code changes or updates)
docker compose up -d --build

# Stop everything
docker compose down

# Stop everything and remove volumes (WARNING: deletes all Shodh data)
docker compose down -v
```

After changing `.env`, you must restart the affected service for changes to take effect.

## Provider-Specific Tips

### Anthropic

- **Prompt caching:** Home Mind uses Anthropic's prompt caching (`cache_control: ephemeral`) to reduce token costs. The static system prompt is cached; only the dynamic context (facts, time) is re-sent each request. This happens automatically.
- **Rate limits:** If you see 429 errors in the logs, you are hitting Anthropic's rate limits. Consider using a lower-tier model (Haiku) or reducing request frequency.
- **Model names:** Use the full model ID (e.g., `claude-haiku-4-5-20251001`), not shorthand.

### OpenAI

- **API key:** Ensure your key starts with `sk-` and has access to the Chat Completions API.
- **Azure/proxy endpoints:** Set `OPENAI_BASE_URL` to your deployment URL. The rest of the config is the same.
- **Tool calling:** All OpenAI models that support function calling will work. Models without tool support will not be able to interact with Home Assistant.

### Ollama

- **Model must be pulled first:** Run `ollama pull llama3.1` (or your chosen model) before starting Home Mind.
- **Docker networking:** If Ollama runs on the host, `localhost` inside the Docker container does not reach the host. Use:
  - The host's LAN IP: `OLLAMA_BASE_URL=http://192.168.1.100:11434/v1`
  - Or `host.docker.internal` on Docker Desktop: `OLLAMA_BASE_URL=http://host.docker.internal:11434/v1`
- **Cold start delay:** The first request after loading a model can be slow (10-30+ seconds depending on model size and hardware). Subsequent requests are faster.
- **Tool calling support:** Not all Ollama models support tool/function calling. Models known to work well: `llama3.1`, `qwen2.5`, `mistral`. If the AI never calls tools, try a different model.
- **Memory requirements:** Larger models need more VRAM/RAM. The 8B parameter models (e.g., `llama3.1`) typically need 8-10 GB of memory. 70B models need 40+ GB.
- **No API key needed:** Ollama does not use an API key. Home Mind passes `"ollama"` as a placeholder internally.

## Checking System State

### Health Endpoints

```bash
# Home Mind server
curl http://localhost:3100/api/health

# Shodh Memory
curl http://localhost:3030/health
```

### Container Status

```bash
docker compose ps
```

Both services should show `Up (healthy)`.

### Memory Contents

```bash
# List all facts for the default user
curl http://localhost:3100/api/memory/default

# Delete a specific fact by ID
curl -X DELETE http://localhost:3100/api/memory/default/facts/<fact-id>

# Delete all facts (start fresh)
curl -X DELETE http://localhost:3100/api/memory/default
```

### Test a Chat Request

```bash
curl -X POST http://localhost:3100/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "What time is it?"}'
```

This is a simple test that does not require HA tools -- it verifies the LLM connection is working.

## Getting Help

- [GitHub Issues](https://github.com/hoornet/home-mind/issues) -- Report bugs or request features
- Check the [Architecture](Architecture) page for understanding how the system works internally
