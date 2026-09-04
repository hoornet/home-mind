# Changelog

## 0.17.1

- **Forecasts, calendars and to-do lists are now within reach.** Some Home Assistant services answer with data instead of changing a device: the weather forecast, calendar events, to-do items, media search. Home Assistant expects such a call to say up front that it wants the answer, and Home Mind now does that on its own, using Home Assistant's service catalog to tell which services return data. "Will it rain tomorrow?" is answered from the forecast your weather integration provides. Ordinary device commands are sent exactly as before. Server 0.17.1.

## 0.17.0

- **The home layout now contains what you exposed to Assist, not every entity in the house.** Home Mind reads the list of entities you exposed under Settings, Voice assistants, and builds the layout it sends with every request from that, which makes each request much smaller on a large install. When the list cannot be read it falls back to the device domains people ask an assistant about, so the layout is never empty. Config-style entities such as buttons, numbers and selects are left out unless you expose them or set `LAYOUT_DOMAINS`. Contributed by @PeterLinuxOSS. Server 0.17.0.

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
