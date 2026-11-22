# Pen-drive drop zone

Teammates who are new to GitHub put their app here. One folder per person:

```
contributions/
  ranvir/      <- copy the whole pen-drive folder here, as-is
  viren/
  <your-name>/
```

## For the student (or a parent/coach)

1. Copy your app folder from the pen drive into `contributions/<your-name>/`.
2. Delete any `node_modules/`, `.venv/` or `.env` files first — they are huge
   or contain secrets.
3. Commit it on its own branch so your name stays on your work:

   ```bash
   git checkout -b contrib/<your-name>
   git add contributions/<your-name>
   git commit -m "Add <your-name>'s wildfire app from pen drive"
   git push -u origin contrib/<your-name>
   ```

   Not comfortable with git? Hand the pen drive to a coach and they'll do it
   with you watching.

## For the integrator

Pick the best features and move them into the master app. Don't copy whole apps.

| If the feature is… | Put it in… |
| --- | --- |
| A new page | `src/routes/<page>.tsx`, then add it to `src/components/AppNav.tsx` |
| Sensor math / risk rules | `src/lib/sensors.ts` |
| Data shared across pages | `src/lib/field-data.tsx` (the shared feed) |
| Something on the map | `src/components/TerrainMap.tsx` **and** `LeafletMap.tsx` (both engines) |
| Pi / hardware code | `hardware/raspberry-pi/` |
| Server code or API | `src/routes/api/` or a `*.functions.ts` server function |

After moving a feature:

1. `npm run build` must pass.
2. Credit the student in `TEAM.md`.
3. Leave their original folder here — judges like to see where ideas came from.
