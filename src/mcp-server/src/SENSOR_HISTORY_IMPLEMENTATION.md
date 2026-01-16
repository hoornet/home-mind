# Sensor History Implementation Guide

## Overview

This update adds **historical data querying** to the MCP server, allowing Claude to answer questions like:
- "How has the temperature changed since this morning?"
- "What was the humidity at 3pm yesterday?"
- "Show me the last 6 hours of CO2 readings"

## What Changed

### 1. New Tool: `get_history`

**Purpose:** Query historical state data for any entity

**Parameters:**
- `entity_id` (required) - Entity to query (e.g., "sensor.temperature")
- `start_time` (optional) - ISO 8601 timestamp (default: 24 hours ago)
- `end_time` (optional) - ISO 8601 timestamp (default: now)

**Example Usage:**
```typescript
{
  entity_id: "sensor.dnevna_temperature",
  start_time: "2026-01-16T08:00:00Z",
  end_time: "2026-01-16T20:00:00Z"
}
```

**Response Format:**
```json
{
  "entity_id": "sensor.dnevna_temperature",
  "data_points": 145,
  "start": "2026-01-16T08:00:00Z",
  "end": "2026-01-16T20:00:00Z",
  "history": [
    { "time": "2026-01-16T08:00:00Z", "state": "18.5", "unit": "°C" },
    { "time": "2026-01-16T08:15:00Z", "state": "18.7", "unit": "°C" },
    ...
  ]
}
```

### 2. Updated Files

#### `src/mcp-server/src/ha-client.ts`
- Added `HistoryEntry` interface
- Added `getHistory()` method
- Uses HA's `/api/history/period/<start_time>` endpoint

#### `src/mcp-server/src/index.ts`
- Added `GetHistorySchema` Zod validation
- Added `get_history` tool definition
- Added `get_history` handler in request switch

## Home Assistant History API

The HA history API endpoint format:
```
/api/history/period/<start_time>?filter_entity_id=<entity>&end_time=<end>
```

**Notes:**
- Returns array of arrays (one array per entity)
- Timestamps must be ISO 8601 format
- Default period is 1 day if no start_time specified
- Data points depend on entity's update frequency

## Deployment Steps

1. **Copy updated files to your server:**
   ```bash
   scp src/mcp-server/src/ha-client.ts ubuntuserver:~/LibreChat/mcp-server/src/
   scp src/mcp-server/src/index.ts ubuntuserver:~/LibreChat/mcp-server/src/
   ```

2. **Rebuild the MCP server:**
   ```bash
   ssh ubuntuserver
   cd ~/LibreChat
   docker run --rm -v ~/LibreChat/mcp-server:/app -w /app node:20 sh -c 'npm install && npm run build'
   ```

3. **Restart LibreChat:**
   ```bash
   docker compose restart api
   ```

4. **Verify in logs:**
   ```bash
   docker logs LibreChat 2>&1 | grep -i mcp
   ```
   
   Should see: `Tools: get_state, get_entities, search_entities, call_service, get_history`

## Testing

### Test 1: Recent History (Default 24h)
```
User: What's the temperature history for the living room?
Claude: [calls get_history with entity_id="sensor.dnevna_temperature"]
```

### Test 2: Specific Time Range
```
User: Show me the temperature from 8am to noon today
Claude: [calls get_history with start_time="2026-01-16T08:00:00Z", end_time="2026-01-16T12:00:00Z"]
```

### Test 3: Comparison with Memory
```
User: How does today's temperature compare to normal?
Claude: [uses memory for "normal" + get_history for today's data]
```

## Benefits with Memory System

History + Memory is powerful:

**Without History:**
- User: "Has it been getting warmer?"
- Claude: "I can't tell without historical data"

**With History:**
- User: "Has it been getting warmer?"
- Claude: [queries last 3 days] "Yes, temperatures have increased from 18°C to 21°C average"
- Claude: [updates memory] "Your home has been warming up this week"

**Next Conversation:**
- User: "Is it still warming up?"
- Claude: [uses memory] "Last week it was warming. Let me check current trend..." [queries history]

## Known Limitations

1. **Data Volume:** Requesting long time periods (weeks/months) returns large datasets
   - Solution: Claude should intelligently sample or aggregate
   - Future: Add aggregation parameters (hourly/daily averages)

2. **Timestamp Handling:** Claude needs to convert natural language to ISO 8601
   - "this morning" → "2026-01-16T06:00:00Z"
   - Claude is generally good at this

3. **No Aggregation:** Returns all raw data points
   - Future enhancement: Add min/max/avg calculations

## Next Steps

After deploying this feature:

1. **Test with various time ranges**
2. **Document examples in MEMORY_EXAMPLES.md**
3. **Test memory + history combination**
4. **Consider adding aggregation functions**

## Example Conversations After Deployment

**Scenario 1: Temperature Trend**
```
User: How has the living room temperature changed since this morning?
Claude: Let me check the history...
        [calls get_history]
        The living room started at 18.2°C at 8am and has gradually 
        increased to 20.7°C now. Peak was 21.1°C at 2pm.
```

**Scenario 2: Anomaly Detection**
```
User: Was there anything unusual with the CO2 levels today?
Claude: [calls get_history]
        Yes, CO2 spiked to 1200 ppm at 3pm (normal is 400-600 ppm 
        based on what I remember). It's back to 580 ppm now.
```

**Scenario 3: Verification**
```
User: Did the temperature actually reach 25°C yesterday like you remember?
Claude: [calls get_history for yesterday]
        Checking history... Actually, the peak was 23.8°C at 2:30pm 
        yesterday. I'll update my memory - the peak was 23.8°C, not 25°C.
```

## Impact on PROJECT_PLAN.md

This completes:
- ✅ Milestone 2.2: "Get sensor history" 

Updates Phase 2 progress to ~70% complete.

---

**Implementation Date:** January 16, 2026
**Status:** Ready to deploy
**Phase:** 2.2 - State Queries & Context
