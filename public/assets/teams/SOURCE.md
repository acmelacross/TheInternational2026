# Team image cache

v1.3 ships team images inside `public/assets/teams/` so the UI does not hot-link external image hosts at runtime.

Initial visual seed used for the 16 local tiles:

`https://cdn.egamersworld.com/cdn-cgi/image/width%3D690%2Cquality%3D100%2Cformat%3Dwebp/uploads/content/1/17/1784546279583_resized.jpg`

The files are isolated by team name. Replacing a logo only requires overwriting the corresponding `.webp` file; frontend code does not need to change.

Special note: Iron Wing is the TI2026 tournament identity used by the former Tundra/1w roster. The bundled `iron-wing.webp` uses the pre-renaming 1w visual from the seed image. If a preferred final Iron Wing tournament mark is available, replace only `iron-wing.webp`.

Runtime path convention: `/assets/teams/<team>.webp`.
