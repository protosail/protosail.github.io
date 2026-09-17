"""Extract Sora's real outlines and native HarfBuzz placement for selection studies."""
import io
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(os.environ['TEMP']) / 'protosail-font-tools'))
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import uharfbuzz as hb

root = Path(__file__).resolve().parent.parent
source = root / 'output/protosail-font-options/fonts/sora.ttf'
all_weights = '--all-weights' in sys.argv
out = root / ('output/protosail-sora-playground' if all_weights else 'output/protosail-sora-studies')
out.mkdir(parents=True, exist_ok=True)
original = TTFont(source)
results = {}

for weight in (range(100, 801, 10) if all_weights else (700, 800)):
    font = instantiateVariableFont(original, {'wght': weight}, inplace=False)
    glyphs = font.getGlyphSet()
    hp = BoundsPen(glyphs)
    glyphs['H'].draw(hp)
    cap = hp.bounds[3]
    scale = 1000 / cap
    # Sora L's stem is an independent rectangular contour in the actual font.
    lp = RecordingPen()
    glyphs['L'].draw(lp)
    stem_points = []
    for operation, points in lp.value:
        if operation == 'closePath':
            break
        assert operation in ('moveTo', 'lineTo')
        stem_points.extend(points)
    stem = (max(p[0] for p in stem_points) - min(p[0] for p in stem_points)) * scale
    stream = io.BytesIO()
    font.save(stream)
    face = hb.Face(stream.getvalue())
    hfont = hb.Font(face)
    hfont.scale = (font['head'].unitsPerEm, font['head'].unitsPerEm)
    hb.ot_font_set_funcs(hfont)
    shapes = {}
    for text in ('PROTOS', 'PROTOSAIL', 'L'):
        buffer = hb.Buffer()
        buffer.add_str(text)
        buffer.guess_segment_properties()
        hb.shape(hfont, buffer, {'kern': True, 'liga': True})
        cursor = 0
        parts = []
        bounds = []
        for info, pos in zip(buffer.glyph_infos, buffer.glyph_positions):
            name = font.getGlyphName(info.codepoint)
            transform = (scale, 0, 0, -scale, (cursor + pos.x_offset) * scale, 1000 - pos.y_offset * scale)
            path_pen = SVGPathPen(glyphs, ntos=lambda n: str(round(n, 6)))
            glyphs[name].draw(TransformPen(path_pen, transform))
            bounds_pen = BoundsPen(glyphs)
            glyphs[name].draw(TransformPen(bounds_pen, transform))
            bounds.append(bounds_pen.bounds)
            parts.append({'glyph': name, 'cluster': info.cluster, 'path': path_pen.getCommands(), 'advance': pos.x_advance * scale})
            cursor += pos.x_advance
        left = min(b[0] for b in bounds)
        top = min(b[1] for b in bounds)
        right = max(b[2] for b in bounds)
        bottom = max(b[3] for b in bounds)
        shapes[text] = {'parts': parts, 'bounds': {'x': left, 'y': top, 'width': right-left, 'height': bottom-top}, 'advance': cursor * scale}
    results[str(weight)] = {'weight': weight, 'capHeight': 1000, 'sourceCapHeight': cap, 'stemWidth': stem, 'shapes': shapes}

(out / 'sora-outlines.json').write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'weights':len(results),'output':str(out)}))
