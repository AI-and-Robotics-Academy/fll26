# Team Bellevue — who built what

The master app combines the best feature from each teammate's app. Every
teammate's original commits are preserved in git history.

| Teammate | Original work | Where it lives in the master app | Status |
| --- | --- | --- | --- |
| **Smarna** | WildGuard console (Lovable): heat/risk/zones map, rate-of-rise chart, threshold alerts, °F/°C toggle, fire-station routing, sign-in (`main`, `feature/smarna-role-views_v2`) | Base of the master app — `/`, `/alerts`, `/auth` | Merged. Role views (`feature/smarna-role-views`) has no commits yet |
| **Luke** | FireWatch: Raspberry Pi telemetry API, GPIO sensor scripts, AI helper, alert acknowledge, public tunnel (`feature/luke-pi-telemetry`) | `/api/devices/*`, `/devices`, LIVE map markers, "Ask FireWatch AI", Acknowledge button, `hardware/raspberry-pi/` | Merged |
| **Shivi** | Resource tracker: tankers, trucks, ambulances, buses, supplies with live simulation (`feature/shivi-resource-tracker`) | `/resources`, resources layer on the console map, "Closest ready resources" in dispatch | Merged |
| **Ranvir** | Firefighter map (`feature/ranvir-firefighter-map`) | — | Branch is empty. Waiting for code (branch or pen drive) |
| **Viren** | Device admin (`feature/viren-device-admin`) | `/devices` is ready to extend | Branch is empty. Waiting for code (branch or pen drive) |
| *Pen-drive teammates* | — | See `contributions/README.md` | Waiting |

## How the pieces connect

```
Raspberry Pi ──POST /api/devices/<id>/telemetry──► server memory (telemetry.server.ts)
                                                        │
Simulated WA mesh ───────┐                              │ GET /api/devices every 5 s
Shivi's resources ───────┼──► FieldDataProvider (one shared feed for every page)
                         │
        ┌────────────────┼──────────────┬───────────────┬──────────────┐
     Console          Alerts        Resources        Devices     FireWatch AI
```

## 2-minute judge demo

1. **Console**: "Our mesh scores fire risk from heat, dryness and how fast
   temperature is rising." Click the top node to show risk drivers, the route
   from the nearest station, and the closest ready resources.
2. **Devices**: plug in the real Pi (or press *Send reading* with 38 °C / 14 %).
   It appears with a white ring: real hardware, not a simulation.
3. **Alerts**: the Pi's reading trips the alarms. Press *Acknowledge*.
4. **Resources**: show which tanker is ready and how close it is to the risky zone.
5. **Ask FireWatch AI**: "Is our live Pi sensor in danger?"
