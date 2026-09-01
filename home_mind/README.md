# Home Mind add-on

Runs the Home Mind API server and the Shodh Memory backend as a single Home
Assistant add-on, so no separate Docker host is needed.

- No long-lived access token — Home Assistant is reached through the Supervisor proxy
- Configuration in the add-on UI instead of a `.env` file
- Memory and conversation history live in `/data` and are included in Home Assistant backups

See [DOCS.md](DOCS.md) for installation and configuration.
