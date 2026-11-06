// Renders every app icon in public/ from the one design below, so the
// favicon, home-screen icons and manifest icons can't drift apart.
// (src/components/icons.tsx's AppIcon draws the same glyph in React; keep
// it in sync by hand if you change the design here.)
//
// Run from frontend/ (resvg is a one-off tool, not a project dependency):
//   npm install --no-save @resvg/resvg-js && node scripts/render-icons.mjs

import { writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

// 64x64 grid. A house outline with a thermometer inside, on the app's
// accent blue. Bounds (strokes included) x 10.75..53.25, y 12.75..51.25,
// inside the maskable safe zone (radius 25.6 from center) even unscaled.
const BG = "#2a78d6";

const glyph = `<g>
    <path d="M13 31 L32 15 L51 31" fill="none" stroke="#fcfcfb" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M19 28 V49 H45 V28" fill="none" stroke="#fcfcfb" stroke-width="4.5" stroke-linejoin="round"/>
    <line x1="32" y1="30" x2="32" y2="38" stroke="#ff8a3d" stroke-width="4" stroke-linecap="round"/>
    <circle cx="32" cy="41.5" r="4.5" fill="#ff8a3d"/>
  </g>`;

// Browser tab / installed-app icon: rounded badge, transparent corners.
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${BG}"/>
  ${glyph}
</svg>
`;

// Home-screen icons: full-bleed square, since iOS and Android launchers
// apply their own corner mask/shape. Glyph shrunk a little so it doesn't
// crowd a circular mask.
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${BG}"/>
  <g transform="translate(32 32) scale(0.82) translate(-32 -32)">${glyph}</g>
</svg>
`;

function png(svg, size, file) {
  const out = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(`public/${file}`, out);
  console.log(`public/${file} (${size}x${size}, ${out.length} B)`);
}

writeFileSync("public/favicon.svg", rounded);
console.log("public/favicon.svg");
png(rounded, 32, "favicon-32.png"); // fallback for browsers without SVG favicons
png(rounded, 192, "icon-192.png");
png(rounded, 512, "icon-512.png");
png(fullBleed, 512, "icon-maskable-512.png");
png(fullBleed, 180, "apple-touch-icon.png");
