# Protosail final brand kit

Approved design A: Sora ExtraBold 800, native kerning, no added tracking. Panel height 79%; all eight sail corner controls 79%.

## Files

- svg/: icon, full wordmark, integrated primary (PROTOS + sails + L), horizontal, stacked, app and favicon.
- Colour editions: lime/charcoal, lime/white, solid charcoal, solid white where applicable. Filenames retain black for charcoal #141414.
- primary-panel-white is the exact approved main panel: 2960 × 0.79 = 2338.4 units high, reduced 310.8 units at each edge; fixed width and 180-unit white surround. Lettering and panel centres are y=500.
- Stacked panel: complete composition centred in 395-unit inner margins, with a 180-unit white surround.
- Ordinary SVGs have transparent backgrounds. App/favicons use charcoal tiles.
- png/: logos 512/2048 px wide; app 192/512 px square; favicon 16/32/48 px square.
- protosail-favicon.ico: 16/32/48 px PNG-compressed entries.
- index.html: visual guide. preview.png: contact sheet.
- geometry.json: paths, measurements, native glyph placement and layouts.
- final-settings.json: approved controls.
- source/: deterministic generator, frozen master font outlines and base geometry, geometry helpers, original Sora font and licence.
- manifest.json: SHA-256 hashes. ZIP contains the complete kit.

## Consistency

All variants share identical icon paths. Wing top and bottom edges are parallel at 20°. Sail bottoms align at y=1000; gap 65; right sail width 220. Corner values are 79% of A's radius controls, followed by the same uniform normalisation as the approved interactive preview. Text uses actual Sora outlines and HarfBuzz native placement. Glyph coordinates are immutable, with only translation and uniform scaling in compositions. No synthetic bold or stretching.

Clear space: icon 250 units; transparent lettering compositions 500 units. Panel and tile editions have composition-specific margins. Main icon height 1750, y=-480; horizontal height 2500, y=-750, gap 400; stacked height 3300, visible gap 400. Letter cap height 1000.

Minimum recommended widths including padding: icon 32 px; wordmark 160 px; primary 200 px; horizontal 240 px; stacked 180 px. Favicon 16 px. SVG is preferred for print and high-resolution work.

Colours: #E3F941 lime, #141414 charcoal, #FFFFFF white. Flat sRGB.

## Regeneration

In the original project: node scripts/build-brand.mjs. For vectors/docs only add --svg-only. In an extracted kit: node source/build-brand.mjs (install puppeteer-core for raster exports). Chrome is required for PNGs; set CHROME to override its path. Master data lives beside the generator in brand-master.json and brand-geometry.mjs. No font installation, Python, network request or font shaping dependency is needed to regenerate. The original Sora TTF and SIL Open Font Licence are provided for further type editing.

The generator is deterministic within the same Node/Chrome environment. Do not edit emitted files; update the master and regenerate. The website is not changed by this kit.
