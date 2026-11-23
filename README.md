# WildGuard — FLL 2026 Team Bellevue

One app for wildfire prevention and early warning, built from the best feature of
each teammate's app. Firefighters see live temperature, humidity and fire risk
from Raspberry Pi sensors on a topography map, get alarms when a threshold is
crossed, and know which crews and equipment are closest.

See [TEAM.md](TEAM.md) for who built what and a 2-minute judge demo.

| Page | What it does |
| --- | --- |
| `/` Console | Fire-risk gauge, temperature / humidity / soil / wind cards, AI situation briefing, heat / risk / zone map, dispatch route + closest resources, trend charts |
| `/alerts` | Threshold alarms with adjustable limits and Acknowledge |
| `/intel` Area Intel | Search an area or pick a sensor: fire spread prediction, terrain, 4 fire-line positions with truck / drone / helicopter GPS and NOTAM notes |
| `/resources` | Live tracker for tankers, engines, ambulances, buses and supplies |
| `/readings` | Last 100 live readings with risk and online/offline status |
| `/devices` | Register field units, live Pi list, test readings, copy-ready Pi bridge script |
| Ask FireWatch AI | Helper on every page that answers from the live readings |

## Run it

Needs Node.js 22+.

```sh
npm install
npm run dev               # http://localhost:8080
```

To let a Raspberry Pi on the same Wi‑Fi send readings:

```sh
npm run dev -- --host 0.0.0.0
```

Then follow [hardware/raspberry-pi/README.md](hardware/raspberry-pi/README.md).

### Optional settings (server environment variables)

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Full AI answers, briefings and Area Intel web search. Without it, chat and briefings use built-in rules and Area Intel runs its offline spread model. |
| `FIREWATCH_AI_MODEL` | OpenAI model (default `gpt-5-mini`) |
| `FIREWATCH_INGEST_TOKEN` | Require this token from every Pi (`X-FireWatch-Token` header) |
| `VITE_WILDGUARD_MAP=osm` | Always use the free OpenTopoMap map instead of Google Maps |

Never put keys in code or commit them. Set them in the terminal before
`npm run dev`, e.g. `export OPENAI_API_KEY=...`.

### Good to know

- **Maps**: Google Maps terrain is used when its key allows the site. On a
  laptop (`localhost`) the Lovable key is refused, so the app switches to the
  free OpenTopoMap contour map on its own.
- **Live Pi data** is kept in server memory: it resets when the server restarts
  and is meant for a laptop running `npm run dev`, not the hosted Lovable site.
- **Simulated mesh**: the statewide sensors are simulated for the demo. Turn
  them off on the Devices page to show only real hardware.

## Repository layout

```
src/                      WildGuard master app (TanStack Start + React)
hardware/raspberry-pi/    Pi sensor scripts (Luke)
contributions/            Pen-drive drop zone for teammates new to GitHub
archive/firewatch-flask/  Original FireWatch Flask app (Luke + Shivi), for reference
```

Built with [Lovable](https://lovable.dev). Project editor:
https://lovable.dev/projects/43876407-4725-4dac-8072-39d0f80cdd12
