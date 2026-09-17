# Protosail — website

Single-page site for Protosail, UCL's Microtransat Challenge team: a WebGL hero, the
challenge explained, an interactive 3D boat section built around a live wingsail
simulation, and placeholder-first team, news and contact sections.

```
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # tsc --noEmit, then a static build into dist/
npm run preview    # serves dist/ at http://127.0.0.1:4173
```

| script | what it does |
| --- | --- |
| `npm run dev` / `build` / `preview` | Vite. Both `dev` and `build` first check that `public/boat.opt.glb` exists. |
| `npm run typecheck` | `tsc --noEmit` on its own |
| `npm run model` | `boat.glb` → `public/boat.opt.glb` (names parts, flattens, quantizes, verifies pose) |
| `npm run inspect` | Dumps nodes, primitives, materials and world bounds of a GLB |
| `npm run fonts` | Copies the two self-hosted woff2 files and their licences into `public/fonts/` |
| `npm run chart` | Bakes the Atlantic coastline into `src/generated/atlantic.ts` (Natural Earth 110m, Mercator) |
| `npm run shots` | Screenshots every section at 1440 and 390 px into `.screenshots/` using the installed Chrome |

Generated files (`public/boat.opt.glb`, `public/fonts/*`, `src/generated/atlantic.ts`) are
committed, so a fresh clone runs without the generator steps.

## Editing content

Everything that is a fact about the team lives in `src/content.ts`: flags, team members,
supervisors, alumni, news items, previous boats, stats, the rule coordinates and
contact details. Prose that appears once — hero, challenge, boat introduction, contact —
is in `index.html` so it reads without JavaScript.

Media is optional. A person with no `photo`, or a previous boat with no `image`, gets a
placeholder tile. Drop a file into `public/` and set the path to switch. Everything that
still needs replacing carries `data-placeholder`; open the site with `?debug` to see them
outlined.

Flags in `src/content.ts`:

- `SMOOTH_SCROLL` — Lenis wheel smoothing (touch is always native).

## URL switches

| query | effect |
| --- | --- |
| `?debug` | outlines placeholders, draws the joint axes, exposes `window.lenis`, `window.ocean`, `window.viewer` |
| `?shots` | screenshot mode: no scroll smoothing, reveals land instantly |
| `?nosmooth` | native scrolling only |
| `?nohero` | skip the hero WebGL scene |
| `?motion=full` / `?motion=reduce` | full motion is the default; `reduce` opts into the low-motion presentation |
| `?graphics=off` | exercise the readable fallback for both WebGL scenes |
| `?qa=model-error` | request a missing model to exercise the loading failure path |

## Layout

```
index.html                 page shell: nav, hero, challenge, boat, team, news, contact, footer
src/main.ts                composition root
src/content.ts             placeholder-first content + flags
src/lib/                   scroll (Lenis + GSAP + ScrollTrigger), spring, visibility, dom helpers
src/hero/                  shaded Gerstner ocean, procedural detail texture, capped renderer, hero wiring
src/sections/              nav, reveals, challenge chart, boat scrollytelling, content renderers
src/viewer/                the 3D viewer: stage, model, materials, rig, sim, camera — knows nothing about the page
src/ui/                    labels, controls, HUD, loader — know nothing about three.js
src/config/                parts, joint axes and the six authored views: all the model-specific data
src/styles/                tokens, fonts, base, primitives, nav, hero, sections, boat, viewer, motion
scripts/                   model pipeline, font sync, chart bake, screenshots
```

## The 3D boat

`src/viewer/` is self-contained behind one function:

```ts
const viewer = await createBoatViewer(element, { onProgress, reducedMotion, controls: { zoom: false } })
viewer.setTourProgress(0.2)
viewer.setInteractionMode('explore')
viewer.sim.set({ tabDeg: 30 })
```

`src/sections/boat.ts` maps the six chapters to continuous `setTourProgress(0…1)`.
Each chapter has a settled reading interval followed by a reversible spherical camera
path. Only chapter changes update annotations, materials and simulation presets.
`setView(id)` remains available for authored, static presentations.

Explore preserves the displayed camera and exposes the existing simulation controls.
Resume, chapter links, or a subsequent page scroll return from the current camera to
the tour and restore its simulation settings. Wheel zoom is disabled. One finger
scrolls the page; two fingers orbit in Explore. Keyboard users can select chapters,
adjust controls and press Escape to resume.

The hero uses seven unequal crossing waves with curved crests and varying wave-group
amplitudes, analytic surface normals and a small procedural normal/foam texture generated
once. A pale-blue silhouette of the supplied boat rides the same displaced surface,
with damped heave, pitch and roll; water occludes its keel. Portrait layouts reserve
space below the copy for the boat. Its independent clock advances with real elapsed
time. Rendering uses antialiasing, fits its mesh to the camera and supports up to 2×
device resolution, capped at 3.6 million pixels (1.8 million on touch devices) so the
larger hero boat retains crisp edges. Quality stays stable when browser timers throttle.
Visible banks of sea mist drift over the waves on the same clock; distant wave crests
darken gradually to give the sea depth. Scrolling away slows this clock to 30% speed and fades the boat first,
then blurs and darkens the waves and mist into a fixed background behind the following
sections, including the transparent boat viewer and applications section. On tall mobile
heroes, the lower scene enters view before this transition starts.
The hero atmosphere keeps animating while the main page is visible; the interactive
viewer pauses offscreen. Both scenes pause in hidden tabs.
The large swells take about 14.5 seconds per cycle; short ripples and highlights are softened to avoid shimmer. Reduced motion defaults to a still ocean and static chapter framings. The Play/Pause
waves & fog button lets the reader choose ocean, fog and boat motion explicitly.

`npm run test:tour` checks boundaries, reverse paths, interrupted handoffs, Explore,
portrait framing, reduced motion, touch policy and simulation restoration.

### The model is a placeholder

`boat.glb` is a wingsail demonstrator built by another team. It must be replaced before
the site goes public. When Protosail's own hull is ready:

1. Export it from Fusion and overwrite `boat.glb`.
2. Update the `RULES` table in `scripts/process-model.mjs` (it fails loudly and prints every
   node if anything is unmatched), then `npm run model`.
3. Update `PART_IDS`, `WING_ASSEMBLY`, `XRAY_*`, `ELECTRONICS` and `HULL_EXTENT` in
   `src/config/parts.ts`; the joint axes in `src/config/joints.ts`; the material readings in
   `src/viewer/materials.ts`; the camera poses, captions, labels and dimensions in
   `src/config/views.ts`.
4. Check the rig with `?debug` (it draws the three joint axes).

The wingsail simulation (`src/viewer/sim.ts`) models a free-pivoting wing driven by a
trim tab as a damped second-order system; see the comments there for the derivation.

## Before publishing

- Replace the placeholder model (above), or obtain permission to show it.
- Fill in `src/content.ts`: names, bios, photos, news, previous boats, the real email.
- Confirm the copy marked `data-placeholder` in `index.html`: entry year, class/division,
  attempt count after 2023 (see microtransat.org/history.php).
- Check UCL brand rules for student teams before adding any logo.

Interface font: Archivo, SIL Open Font License (`public/fonts/LICENSES.txt`).



## Local verification — 6 September 2026

- Production build and `npm run test:tour` pass.
- Browser layouts reviewed at 1440 × 900, 768 × 1024, 390 × 844 and 320 × 740, including resizing, chapter links and label clearance.
- Tested desktop orbiting, scroll-to-resume, reverse scrolling, keyboard sliders, Escape, mobile menu focus, and both motion preferences.
- Reviewed the ocean across moving frames. The revised sea runs at one quarter of its earlier speed; visible desktop samples settled at 55–60 fps.
- Tested missing-model and graphics-disabled fallbacks: all six captions remain readable and unavailable controls are hidden.
- Touch gesture routing is covered by the camera checks. Physical iOS/Android multitouch remains a device QA step.
