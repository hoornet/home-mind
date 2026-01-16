# Memory Examples

This document demonstrates the memory capabilities of the LibreChat-HomeAssistant integration.

## Overview

The memory system allows Claude to remember facts, preferences, and corrections across chat sessions. This is the key differentiator from other Home Assistant AI integrations.

## How Memory Works

- **Automatic Learning**: Claude automatically identifies important information to remember
- **Persistent Storage**: Information persists across chat sessions (stored in MongoDB)
- **User Transparency**: Memory updates are indicated with "Updated saved memory" notifications
- **Cross-Session**: Facts learned in one conversation are available in future conversations

## Validated Examples

### Example 1: Learning User Identity

**Chat Session 1:**
```
User: What is my name?
Claude: I don't have your name stored in my memory. The information I have about you 
        is limited to a note about NOx levels in your home environment (that 100 is 
        your normal baseline).
        
        Would you like to tell me your name so I can remember it for future interactions?

User: yes. my name is Jure. I am also sometimes known as Hoornet
Claude: [🔖 Updated saved memory]
        Great to meet you, Jure! I'll remember that you're also known as Hoornet. 
        I've stored this information and will use it in our future interactions.
```

**Result:** ✅ Claude now knows:
- User's name is Jure
- User's alias is Hoornet
- Will address user by name in future conversations

### Example 2: Sensor Baseline Learning (NOx)

**Chat Session 1:**
```
User: What's the NOx sensor reading?
Claude: [uses get_state tool] The NOx sensor shows 100 ppm.

User: Is that high?
Claude: Typically, indoor NOx levels are 20-40 ppm, so 100 seems elevated...

User: Actually, 100 is completely normal for my home. Please remember that.
Claude: [🔖 Updated saved memory]
        I understand - I'll remember that 100 ppm is within normal parameters 
        for your home's NOx levels.
```

**Chat Session 2 (New Conversation):**
```
User: How's the air quality?
Claude: [checks NOx sensor] The NOx sensor shows 98 ppm, which is within 
        normal parameters for your home.
```

**Result:** ✅ Claude remembers the baseline without being reminded

### Example 3: Device Nicknames (Planned Test)

**Chat Session 1:**
```
User: Turn on the kitchen lights
Claude: I found light.wled_kitchen. Should I turn this on?

User: Yes, and please call it "main kitchen light" from now on
Claude: [🔖 Updated saved memory]
        Got it, I'll remember that light.wled_kitchen is your main kitchen light.
```

**Chat Session 2:**
```
User: Turn off the main kitchen light
Claude: [identifies light.wled_kitchen and turns it off]
```

**Status:** 📋 To be tested

### Example 4: Automation Patterns (Planned Test)

**Chat Session 1:**
```
User: When I say "sleep mode", turn off bedroom lights, set thermostat to 18°C, 
      and lock the doors

Claude: [executes actions] Done. Should I remember this as your sleep mode routine?

User: Yes please
Claude: [🔖 Updated saved memory]
        I'll remember your sleep mode routine: turn off bedroom lights, set 
        thermostat to 18°C, and lock doors.
```

**Chat Session 2:**
```
User: Activate sleep mode
Claude: [executes all three actions]
        Sleep mode activated: bedroom lights off, thermostat set to 18°C, doors locked.
```

**Status:** 📋 To be tested

## Memory Best Practices

### For Users

1. **Be Explicit When Teaching**
   - ✅ "Remember that 100 is normal for my NOx sensor"
   - ❌ "That's fine" (too vague)

2. **Corrections Work**
   - Claude updates memory when you correct it
   - Example: "Actually, that's wrong - the normal value is X"

3. **Ask for Confirmation**
   - If unsure what Claude remembers, just ask: "What do you know about X?"

4. **Memory is Transparent**
   - Look for "Updated saved memory" notifications
   - These indicate when facts are being stored

### For Developers

1. **Memory Configuration**
   - Use Haiku for memory agent (NOT Sonnet 4 - thinking mode causes errors)
   - Set reasonable tokenLimit (2000 works well)
   - Enable personalize: true for user control

2. **Memory Works Best With**
   - Factual information (baselines, preferences, device names)
   - User corrections and clarifications
   - Repeated patterns and routines

3. **Memory Limitations**
   - Limited by tokenLimit (default 2000 tokens)
   - Older memories may be forgotten as new ones are added
   - Complex logic may not persist perfectly

## Testing Memory

To test if memory is working:

1. **Start a new chat** and teach Claude something
2. **Start a completely new chat** (new conversation, not same thread)
3. **Ask Claude about what you taught it**
4. **Verify** it remembers without being reminded

## Memory Configuration

Current configuration in `librechat.yaml`:

```yaml
memory:
  disabled: false
  tokenLimit: 2000
  charLimit: 10000
  personalize: true
  messageWindowSize: 5
  agent:
    provider: "anthropic"
    model: "claude-3-5-haiku-20241022"  # MUST use Haiku, not Sonnet 4
```

**Important:** Using Sonnet 4 causes "temperature is not supported when thinking is enabled" errors.

## Troubleshooting

### Memory Not Working?

1. **Check LibreChat logs:**
   ```bash
   docker logs LibreChat 2>&1 | grep -i memory
   ```

2. **Verify configuration:**
   - Is `memory.disabled: false`?
   - Is memory agent model available?
   - Is tokenLimit reasonable?

3. **Check memory agent errors:**
   - Look for temperature/thinking errors (means wrong model)
   - Look for API key issues

### Memory Inconsistent?

1. **May need to be more explicit:**
   - "Remember this..." vs just stating facts
   - Ask Claude to confirm: "Did you remember that?"

2. **May be hitting token limits:**
   - Increase tokenLimit if needed
   - Check if old memories are being forgotten

## Known Limitations

1. **Token Budget**: Limited by tokenLimit (default 2000 tokens)
2. **Model Requirement**: Must use Haiku, not Sonnet 4
3. **Scope**: Memory is per-user (not shared across users)
4. **Persistence**: Stored in MongoDB (requires backup)

## Success Metrics

✅ **Validated Features:**
- Remembers sensor baselines across sessions
- Remembers user identity and preferences
- Updates memory when corrected
- Shows transparency via "Updated saved memory" notifications

📋 **To Validate:**
- Device nickname persistence
- Complex automation patterns
- Memory retention over time
- Memory behavior at token limits

---

**Last Updated:** January 16, 2026  
**Status:** Memory core features validated and working
