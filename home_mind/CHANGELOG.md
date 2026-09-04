# Changelog

## 0.18.0

- **Trend questions now see every reading.** Asking about a week of a sensor used to give the assistant a thin sample of the data, one reading per 50 minutes, so a short daily spike could vanish entirely. It now gets hourly summaries that cover every reading, at a lower cost than before.
- **Long answers get room to finish, and a cut-off answer says so.** The written answer ceiling is four times what it was, and a new **Maximum answer length** option raises it further if you need to. An answer that still runs out of room ends with a sentence saying so instead of just stopping. Spoken answers stay short.
- If you use the Home Mind integration from HACS, update it to 0.10.2 as well: it treated every question as spoken, so long typed answers were cut short. Server 0.18.0.

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
