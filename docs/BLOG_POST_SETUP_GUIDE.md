# Give Your Home Assistant a Brain: Setting Up Home Mind with Claude AI

Ever wished you could just *talk* to your smart home naturally? Not "Hey Google, turn on light dot living room dot ceiling" but actually "make it cozy in here" and have it understand what you mean?

That's exactly what Home Mind does. It's a conversation agent for Home Assistant powered by Claude AI that actually remembers your preferences, understands context, and learns how you like things.

In this guide, I'll walk you through setting it up from scratch. By the end, you'll have a smart home that:
- Understands natural language commands
- Remembers your preferences ("I like the bedroom at 20°C")
- Handles follow-up questions ("Yes, make it warmer")
- Provides real-time sensor data in conversational responses

Let's get started.

---

## What You'll Need

Before we begin, make sure you have:

1. **Home Assistant** (2026.1.0 or newer) - running and accessible on your network
2. **HACS** installed on Home Assistant - [installation guide](https://hacs.xyz/docs/use/)
3. **A server to run Home Mind** - this can be:
   - The same machine running Home Assistant (if it has enough resources)
   - A separate Raspberry Pi 4+
   - Any always-on computer or NAS with Docker
4. **An Anthropic API key** - sign up at [console.anthropic.com](https://console.anthropic.com/)

The API costs are minimal for home use - typically under $1/month with normal usage.

---

## Part 1: Setting Up the Home Mind Server

Home Mind needs a small server component that handles the AI processing. We'll use Docker to make this easy.

### Step 1: Clone the Repository

On your server (not your Home Assistant machine, unless they're the same), open a terminal:

```bash
git clone https://github.com/hoornet/home-mind.git
cd home-mind/src/ha-bridge
```

### Step 2: Configure Environment Variables

Create your configuration file:

```bash
cp .env.example .env
```

Now edit `.env` with your details:

```bash
nano .env
```

You need to set three required values:

```env
# Required: Your Anthropic API key
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# Required: Your Home Assistant URL (use the IP address)
HA_URL=http://192.168.1.100:8123

# Required: Home Assistant long-lived access token
HA_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Getting your HA_TOKEN:**
1. In Home Assistant, click your profile (bottom left)
2. Scroll to "Long-Lived Access Tokens"
3. Click "Create Token"
4. Name it "Home Mind" and copy the token

**Note:** If you use HTTPS with a self-signed certificate, add:
```env
HA_SKIP_TLS_VERIFY=true
```

### Step 3: Start the Server

```bash
docker compose up -d
```

That's it! The server will build and start. First build takes a few minutes.

### Step 4: Verify It's Running

```bash
curl http://localhost:3100/api/health
```

You should see:
```json
{"status":"ok","version":"0.4.0","memoryBackend":"sqlite"}
```

If you see this, your server is ready. Note the IP address of this machine - you'll need it for the next part.

---

## Part 2: Installing the Home Assistant Integration

Now we'll install the integration that connects Home Assistant to your Home Mind server.

### Step 1: Add the Custom Repository to HACS

1. Open Home Assistant
2. Go to **HACS** in the sidebar
3. Click **Integrations**
4. Click the three dots menu (⋮) in the top right
5. Select **Custom repositories**
6. Add:
   - **URL:** `https://github.com/hoornet/home-mind-hacs`
   - **Category:** Integration
7. Click **Add**

### Step 2: Install Home Mind

1. Still in HACS Integrations, click **+ Explore & Download Repositories**
2. Search for "Home Mind"
3. Click on it and then **Download**
4. **Restart Home Assistant** (Settings → System → Restart)

### Step 3: Configure the Integration

After restart:

1. Go to **Settings** → **Devices & Services**
2. Click **+ Add Integration**
3. Search for "Home Mind"
4. Enter your Home Mind server URL:
   - Example: `http://192.168.1.50:3100`
   - Use the IP of the machine running Docker, not `localhost`
5. Click **Submit**

You should see "Success" - the integration is now configured.

---

## Part 3: Setting Up as Your Voice Assistant

Now let's make Home Mind your default conversation agent.

### For Text-Based Assist

1. Go to **Settings** → **Voice assistants**
2. Click on your assistant (or create one)
3. Under **Conversation agent**, select **Home Mind**
4. Save

Now when you open Assist (the chat icon), it uses Home Mind.

### For Voice Assistants (Optional)

If you have voice satellites (like ESP32-based devices with Wyoming):

1. In **Settings** → **Voice assistants**
2. Edit your voice assistant configuration
3. Set **Conversation agent** to **Home Mind**

**Important:** Make sure "Prefer handling commands locally" is **OFF**. This setting can intercept commands before they reach Home Mind.

---

## Part 4: Try It Out!

Open Assist and try these commands:

### Basic Queries
- "What's the temperature in the living room?"
- "Are any lights on?"
- "What's the humidity in the bathroom?"

### Device Control
- "Turn on the kitchen lights"
- "Set the bedroom to 50% brightness"
- "Turn off all the lights"

### The Magic: Memory

This is where Home Mind shines. Try:

1. "Remember that I like the bedroom at 20 degrees"
2. Later: "What temperature do I like in the bedroom?"

It remembers! Or try:

1. "Is the office too warm?"
2. Response: "The office is 24°C. Would you like me to adjust it?"
3. "Yes" ← It understands this is a follow-up!

### Natural Language

Don't worry about exact entity names:

- "How's the air quality?" → finds your air quality sensors
- "Is it cold outside?" → checks outdoor temperature sensors
- "Make the living room cozy" → adjusts lights appropriately

---

## Tips for Best Results

### Be Natural
Home Mind uses Claude AI, which excels at understanding natural language. Talk to it like you'd talk to a person, not a computer.

### Teach It Your Preferences
The more you tell it about your preferences, the better it gets:
- "I prefer warm lighting in the evening"
- "My wake-up time is 7 AM"
- "The garage sensor often reads high, that's normal"

### Use Follow-ups
Don't repeat yourself. If you ask about the temperature and want to change it, just say "make it warmer" - it remembers the context.

### Check Response Times
- Simple questions: ~2 seconds
- Questions requiring device lookup: ~5-8 seconds

This is normal - the AI is actually thinking, not just pattern matching.

---

## Troubleshooting

**"Cannot connect to Home Mind server"**
- Check the server is running: `docker compose logs`
- Verify the URL uses the correct IP (not localhost)
- Ensure port 3100 is accessible from Home Assistant

**Slow or no responses**
- Check your Anthropic API key is valid
- Verify HA_TOKEN has the correct permissions
- Check server logs: `docker compose logs -f`

**"I don't have access to that information"**
- Make sure the HA_TOKEN is a long-lived token with full access
- Restart the Home Mind container after changing .env

---

## What's Next?

You now have an AI-powered smart home that understands natural language and remembers your preferences. Some ideas to explore:

- **Automations:** Trigger Home Mind from automations for intelligent responses
- **Multiple users:** Each user gets their own memory (coming in v1.0)
- **Voice satellites:** Add ESP32 voice devices around your home

---

## Resources

- [Home Mind Repository](https://github.com/hoornet/home-mind) - Full documentation
- [HACS Integration](https://github.com/hoornet/home-mind-hacs) - Report integration issues
- [Home Assistant Community](https://community.home-assistant.io/) - General HA help

---

*Home Mind is open source (AGPL-3.0). If you find it useful, consider starring the repo on GitHub!*
