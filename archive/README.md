# Archived Code

This directory contains deprecated code that is no longer part of the active project.

## mcp-server-deprecated

**Deprecated in v0.5.0**

The MCP server was originally used to integrate Home Mind with LibreChat's web interface.
This created a split architecture with two separate memory stores (MongoDB for web,
SQLite/Shodh for voice) that didn't sync.

As of v0.5.0, Home Mind consolidates to a single architecture:
- **ha-bridge** is the only API server
- **Shodh** is the only memory backend
- **HA Assist** (voice + text) is the primary interface

If you need MCP/LibreChat integration in the future, this code can serve as a reference,
but it would need to be updated to use the ha-bridge API instead of direct HA access.

To restore: `git checkout v0.4.0-pre-consolidation -- src/mcp-server/`
