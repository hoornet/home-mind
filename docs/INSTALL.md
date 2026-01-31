# Home Mind Installation Guide

Complete installation guide for Home Mind - AI assistant for Home Assistant with cognitive memory.

## Prerequisites

Before starting, you need:

1. **A Linux server** (Ubuntu 22.04+ recommended) with:
   - Docker installed (`curl -fsSL https://get.docker.com | sh`)
   - Docker Compose (`apt install docker-compose-plugin` or comes with Docker)
   - Git installed (`apt install git`)
   - Network access to Home Assistant

2. **Home Assistant** with:
   - HACS installed
   - A long-lived access token (Settings → People → Your User → Long-Lived Access Tokens → Create Token)

3. **An Anthropic API key** from [console.anthropic.com](https://console.anthropic.com/)

---

## Part 1: Deploy Home Mind Server

Run these commands on your Linux server.

### Step 1: Clone the repository

```bash
git clone https://github.com/hoornet/home-mind.git
cd home-mind
```

### Step 2: Download Shodh Memory

```bash
cd docker/shodh
curl -L https://github.com/varun29ankuS/shodh-memory/releases/latest/download/shodh-memory-linux-x64.tar.gz | tar -xzv
cd ../..
```

Verify you see 4 files extracted (including `libonnxruntime.so` and `shodh-memory-server`). If not, check your internet connection and try again.

### Step 3: Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your preferred editor (`nano`, `vi`, or `vim`):
```bash
nano .env    # or: vi .env
```

Fill in these **required** settings:

| Variable | Description | How to get it |
|----------|-------------|---------------|
| `ANTHROPIC_API_KEY` | Your Claude API key | [console.anthropic.com](https://console.anthropic.com/) → API Keys → Create Key |
| `HA_URL` | Your Home Assistant URL | Usually `http://192.168.x.x:8123` or `http://homeassistant.local:8123` |
| `HA_TOKEN` | Long-lived access token | In HA: Profile (bottom left) → Long-Lived Access Tokens → Create Token |
| `SHODH_API_KEY` | Random string for Shodh auth | Generate with: `openssl rand -hex 32` |

Example `.env`:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
HA_URL=http://192.168.1.100:8123
HA_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SHODH_API_KEY=a1b2c3d4e5f6...
```

**Optional settings** (defaults are fine for most users):
```bash
PORT=3100                    # API port (default: 3100)
HA_SKIP_TLS_VERIFY=true      # Set to true if HA uses self-signed HTTPS cert
MEMORY_TOKEN_LIMIT=1500      # Max memory context tokens (default: 1500)
```

### Step 4: Deploy

```bash
./scripts/deploy.sh
```

### Step 5: Verify it's running

```bash
curl http://localhost:3100/api/health
```

Should return: `{"status":"ok",...}`

---

## Part 2: Install Home Assistant Integration

### Step 1: Add HACS custom repository

1. Open Home Assistant
2. Go to HACS → Integrations
3. Click the three dots (⋮) in the top right
4. Select "Custom repositories"
5. Enter: `https://github.com/hoornet/home-mind-hacs`
6. Category: Integration
7. Click "Add"

### Step 2: Install Home Mind

1. In HACS → Integrations, click "+ Explore & Download Repositories"
2. Search for "Home Mind"
3. Click on it, then click "Download"
4. **Restart Home Assistant** (Settings → System → Restart)

### Step 3: Configure the integration

1. Go to Settings → Devices & Services
2. Click "+ Add Integration"
3. Search for "Home Mind"
4. Enter your server URL: `http://YOUR_SERVER_IP:3100`
5. Click Submit

---

## Part 3: Set as Voice Assistant

1. Go to Settings → Voice assistants
2. Click your voice assistant (or create one)
3. Under "Conversation agent", select "Home Mind"
4. Save

---

## Verify Installation

Test with Assist (press 'e' in the HA UI or use voice):

- "What's the time?"
- "What lights are on?"
- "Turn on [a light name]"

If it responds with information from your Home Assistant, it's working!

---

## Troubleshooting

### "Cannot connect to server"
- Check the server is running: `docker ps | grep home-mind`
- Check the URL is correct and reachable from HA
- Check firewall allows port 3100

### "Shodh Memory is not available"
- Check Shodh is running: `docker logs home-mind-shodh`
- Wait a few seconds and retry (Shodh takes a moment to start)

### Integration not appearing in HACS
- Make sure you added it as "Integration" not "Plugin"
- Try refreshing HACS: three dots → "Reload"

### Generic responses (no HA data)
- Check HA_URL and HA_TOKEN in your .env
- View logs: `docker logs home-mind-server`
