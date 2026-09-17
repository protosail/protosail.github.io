# Protosail Sora selection studies

Open index.html or comparison.png. These are charcoal-panel-on-white previews only. The production brand kit has not been modified.

A/B use Sora 800 and the current 220-unit right sail. C/D use Sora 800 and a right sail narrowed to 145.596869 icon units. E/F use Sora 700 and a right sail narrowed to 128.375734 icon units. A/C/E have rounded inner corners; B/D/F have sharp inner corners. Sora native kerning is preserved at each weight, with zero added tracking.

The font only provides weights 100–800. At 800 its vertical L stem is 254.794521 units for a 1000-unit cap; the current right sail is 385 units at the 1.75x icon scale. A font-weight-only match is therefore unavailable. Matched studies change the right sail width as explicitly labelled, preserving its 32-degree caps and 670-unit height.

The revised left sail has parallel 20-degree top and bottom edges. Its nominal top edge between theoretical corner intersections is 25% shorter than the previous rounded master; corner fillets affect the visible straight length. The left shoulder moves inward. All icon variants have a 1000-unit height, a 65-unit gap and aligned bottom extrema.

The panel centre uses the combined lettering ink bounds, excluding the icon. The text and panel centres are both y=500. All six share panel dimensions and letter cap height; no letter is stretched or synthetically boldened.

SVGs contain paths only. FontTools extracts original font outlines and HarfBuzz supplies native glyph placement. Font copyright/licence is included.

To regenerate: node scripts/preview-sora-variations.mjs. The helper scripts/outline-sora-studies.py needs fonttools and uharfbuzz; this session installed those into the temporary protosail-font-tools directory. BRAND_PYTHON can override the Python executable.
