# FireWatch (original Flask app)

Luke's and Shivi's original app, kept for reference and git history. Its
features now live in the WildGuard master app:

| Flask feature | Master app |
| --- | --- |
| Pi telemetry API `POST /api/devices/<id>/telemetry` | Same URL and JSON — `src/routes/api/devices/` |
| Device map + list | Console map with white "LIVE" ring, Devices page |
| Low-humidity alerts + Acknowledge | Alerts page (threshold alerts + Acknowledge button) |
| Ask FireWatch AI | Floating AI helper on every page (`src/lib/ai.functions.ts`) |
| Resource tracker `/resources` | Resources page (`src/routes/resources.tsx`) |
| Pi sensor scripts | `hardware/raspberry-pi/` |

To run it anyway (Python 3.13 + uv):

```bash
cd archive/firewatch-flask
uv run wfp            # http://127.0.0.1:8080
```
