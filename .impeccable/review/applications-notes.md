# Applications section revision

The final direction follows the user's request for less space: four image-led columns at desktop widths, two columns at tablet widths, one column on phones. Each application has one photo-derived depth illustration, a heading and a short paragraph. No visible image credits, tags, section indices, controls or animation were added. Existing Archivo typography, dark background, orange accent, page gutters and spacing tokens are preserved.

## Content

Ports and coastal infrastructure focus on coastal surveying, water quality and open port approaches. Environmental monitoring covers ecosystem health and restoration assessment. Offshore energy focuses on metocean conditions, site assessment and vessel monitoring. Maritime security describes vessel tracking and passive acoustic observations. The introduction identifies all four as potential missions requiring appropriate sensors and payloads; it does not claim the student prototype already supports them.

## Assets

Final JPEG assets are in `public/images/applications/`. Source photographs, generated PNGs and the exact built-in image-generation prompt set are in `output/application-sources/`. Source records remain in `public/images/applications/SOURCES.md` for maintenance only.

## Verification

`npm run build` passes. Browser checks cover 1440, 768 and 390 pixels, all four loaded images, descriptive alt text, all four headings, zero visible source links, no page errors and no horizontal overflow. Captures isolate the Applications section; fixed navigation and the skip link are hidden only in the capture script so they cannot overlay a long element screenshot. Production UI is unchanged by that capture rule.

The Impeccable context launcher and detector could not run because their engine is not installed. Existing code, tokens and previous screenshots supplied the visual context. No global design system changes were made.
