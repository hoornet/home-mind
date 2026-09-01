# Changelog

## 0.16.5-1

- **Saving the configuration no longer fails when a URL field is left blank.**
  The optional endpoint fields were declared as URLs, and Home Assistant rejects
  an empty string as an invalid URL, so pressing Save without filling all of them
  in could be refused. They accept an empty value now. Same server, same
  behaviour otherwise.

## 0.16.5

First release of the Home Assistant add-on. Packages Home Mind server 0.16.5
and Shodh Memory 0.2.0 in one container.

- Home Assistant is reached through the Supervisor proxy, so `HA_URL` and
  `HA_TOKEN` are gone. Set them only to control a different instance.
- The Shodh API key is generated on first start and kept in `/data`.
- `conversation_storage` defaults to `sqlite`, so history survives restarts.
- Shodh Memory listens on loopback only; just the API port 3100 is published.
