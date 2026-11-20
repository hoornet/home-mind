# Changelog

## 0.22.1

- **If the add-on's port is already in use, the server stops and says why** in the add-on log, so the add-on can start it again once the port is free, rather than showing "Ready" for a server that cannot answer. Server 0.22.1; no settings to change.

## 0.22.0

- **The "not protected yet" reminder comes back every 6 hours while it applies.** Home Assistant forgets notifications when it restarts; the reminder now returns until the Home Mind integration uses the API token, and stops then.
- **The speech-to-text, text-to-speech and CORS options are removed.** They served a companion app that was never released; voice through Assist is unaffected and works as before. If you had set any of them, the Supervisor log mentions that each one no longer exists, which is harmless. Server 0.22.0; no settings to change.

## 0.21.0

- **The add-on now protects its API with a token by itself.** If you haven't set `api_token`, the add-on creates one and hands it to the Home Mind integration. Update the integration in HACS to 0.11.0 and restart Home Assistant: it picks the token up and starts using it, and from then on the API refuses requests without it. Until then a notification says the API is not protected yet, and everything works as before.
- **Do your own scripts or tools call the add-on's API directly?** They need the token too once the integration uses it, and you can't see the generated one. Set your own `api_token` in the add-on's options and use it there; the add-on hands it to the integration by itself.
- If you added the integration by hand rather than from the discovered add-on, remove it and accept the discovered add-on instead. A token you set yourself is required from the start, as before. Server 0.21.0.

## 0.20.3

- **A security update; we recommend installing it.** The assistant now sticks to everyday device control, whoever asks: it switches and dims, works locks, covers, climate, media players and vacuums, runs your exposed scripts and scenes, sets helpers and timers, and uses your to-do lists, calendars, weather, announcements and notifications. Restarting Home Assistant, the host, add-ons and backups, shell and REST commands, MQTT and other integrations' own services are off-limits. To let it run something more, put it in a script and expose the script to Assist.
- **If nothing is exposed to Assist, the assistant reaches nothing.** Until now, exposing nothing meant there was no limit at all. A notification explains how to expose devices (Settings → Voice assistants → Expose); most homes already expose lights and switches by default and notice no change.
- Every request has to name the device it acts on, media plays from your libraries, radio stations, local audio and streaming services, and an alarm or lock code is sent only a few times in ten minutes. Server 0.20.3; no settings to change.
- **Recommended: protect the API with a token.** Home Mind's API on port 3100 accepts requests without a token unless you set one. Choose a long random token, set it as `api_token` in the add-on's options (or `API_TOKEN` in `.env` for Docker Compose) and restart; then remove the Home Mind integration in Home Assistant and add it again, entering the same token. Your memories stay on the server. A later version will set this up for you.

## 0.20.2

- **Steadier answers on follow-ups.** On newer models such as Claude Haiku 5.5, a follow-up or a simple thanks could make the assistant take back a correct answer or look everything up again. It now stands by what it checked, and looks again when you ask it to or when something may have changed. No settings to change.

## 0.20.1

- **Memory now works on the newest Claude models.** If you use your own Anthropic key with a model that thinks before it answers, such as Claude Haiku 5.5 or Opus 5.5, the add-on now picks up the facts you tell it and remembers them. Other models and providers work as before. No settings to change. Server 0.20.1.

## 0.20.0

- **Security update.** The library the add-on uses to talk to OpenAI-compatible services moves to its newest major version, which fixes three issues reported against the old one. Checked with real requests before release: a reply that looked devices up in Home Assistant, memory, speech-to-text and text-to-speech. No settings to change. Server 0.20.0.

## 0.19.6

- **Security housekeeping.** The libraries the add-on uses to read requests and to talk to Home Assistant are updated to their newest fixed releases. Most of the issues fixed in them do not affect how the add-on uses these libraries, so on 0.19.5 this keeps it current. If you are still on 0.19.4 or older, it also closes a way for a crafted request to stop the add-on. No settings to change. Server 0.19.6.

## 0.19.5

- **Runs on Node.js 24**, which gets security fixes until April 2028.
- **Compressed requests are refused.** The add-on no longer unpacks a compressed request body; it answers with an error instead. Home Assistant never sends one, so nothing changes for you, and a flaw like the one fixed in 0.19.4 can no longer be reached through a request body. No settings to change. Server 0.19.5.

## 0.19.4

- **Security update: Node.js 22.23.4.** The add-on used to run on Node.js 20, which no longer gets security fixes. It now runs on the October 21 Node.js 22 security release. The most serious fix is in how Node.js unpacks Brotli-compressed data, which a crafted request to the add-on could have used to run code inside it. The release also updates the certificates Node.js trusts, following the eMudhra certificate authority compromise. Please update; there are no settings to change. Server 0.19.4.

## 0.19.3

- **Expose something and ask again, and it works straight away.** When the assistant says it cannot use something you have not exposed to Assist, you can now expose it and ask again right away; the assistant checks the list again before saying no, instead of waiting up to 30 minutes. No settings to change. Server 0.19.3.

## 0.19.2

- **Announcements need the speaker exposed, not the voice.** Home Assistant does not expose voice engines to Assist by default, so announcements used to be refused. Now any voice can be used, and the speaker it plays on has to be exposed, as does every speaker you ask the assistant to group together. No settings to change. Server 0.19.2.

## 0.19.1

- **Scenes and groups stay within what you exposed to Assist.** Since 0.19.0 the assistant reads and controls only the entities you have exposed. Scenes and groups it sets up now follow the same rule, so it cannot reach an entity you have not exposed by putting it in a scene or a group. No settings to change; turning off **Tools limited to exposed entities** still lifts the limit. Server 0.19.1.

## 0.19.0

- **The assistant now reaches only what you exposed to Assist**, the way Home Assistant's own assistant does. Until now the home layout followed your exposure list but the assistant could still read and control any entity in the house. If you relied on that, turn off the new **Tools limited to exposed entities** option. Two things to know: a group you exposed still acts on all its members, and an entity you expose while the add-on is running is picked up within 30 minutes or on restart.
- **Google Gemini works through its OpenAI-compatible endpoint.** Choose the `openai` provider, set the base URL to `https://generativelanguage.googleapis.com/v1beta/openai/` and a model such as `gemini-3.5-flash-lite`. The reasoning-effort and "Done." reply settings arrive as add-on options in a later version.
- **Entities are found across accents, and the home layout shows each entity's name next to its id**, which makes a non-English home much easier for the assistant to work with.
- Security housekeeping in two libraries; the add-on was not affected by either. All three features contributed by @PeterLinuxOSS. Server 0.19.0.

## 0.18.3

- **Security housekeeping.** A library behind the add-on's web server had a critical advisory raised against it and is now updated. The add-on was not exposed to it — the flaw only appears with a proxy-trust setting the add-on does not use — and the new version refuses that setting outright, so it stays closed if it is ever added. Server 0.18.3.

## 0.18.2

- **Security fix.** A crafted request could tie the add-on's server up completely and stop it answering anything, using nothing but a malformed upload field name. The upload endpoint now rejects those, and the underlying library is updated. Worth updating if your Home Assistant is reachable from outside your network. Server 0.18.2.

## 0.18.1

- **Large homes get their rooms back.** If you have a few thousand entities, the add-on could not read your home's layout at all — the log said `Template output exceeded maximum size of 262144 characters` — so the assistant did not know which room anything was in. It now reads the layout in smaller pieces, and asks Home Assistant only for the kinds of entity it actually uses, so it works however large your home is. Thanks to @mdallaire for the report. Server 0.18.1.

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
