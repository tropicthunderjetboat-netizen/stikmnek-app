// Build clean 1080x1920 (9:16) social cards that fill a phone screen.
//
// Design (no blur, no letterbox bars):
//   - A big square illustration (1080x1080) sits at the top, full-bleed.
//   - A solid brand-colour panel fills the bottom (teal for business,
//     coral for tourist) with a crisp numbered badge straddling the seam
//     and generous clean space for your caption text (add it in Canva).
//   - A small stikmnek.com wordmark sits at the very bottom.
//
// Source scenes (no baked-in numbers) live in docs/social-cards/scenes/
// as scene_business_1..6.png and scene_tourist_1..6.png.
// Output goes to docs/social-cards/mobile/business_step1..6.png and
// tourist_step1..6.png.
//
// Usage: node scripts/social-cards-mobile.mjs
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCENES_DIR = path.join(ROOT, 'docs', 'social-cards', 'scenes');
const OUT_DIR = path.join(ROOT, 'docs', 'social-cards', 'mobile');

const W = 1080;
const H = 1920;
const IMG_H = 1080; // square illustration region at the top
const BADGE_R = 96; // numbered badge radius (sits on the seam)

const THEMES = {
  business: { panel: { r: 14, g: 124, b: 107 }, hex: '#0E7C6B' }, // teal
  tourist: { panel: { r: 226, g: 96, b: 63 }, hex: '#E2603F' }, // coral
};

fs.mkdirSync(OUT_DIR, { recursive: true });

function overlaySvg(hex, number) {
  const cx = W / 2;
  const cy = IMG_H; // badge centred on the seam between image and panel
  return Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
       <!-- numbered badge straddling the image/panel seam -->
       <circle cx="${cx}" cy="${cy}" r="${BADGE_R + 12}" fill="${hex}"/>
       <circle cx="${cx}" cy="${cy}" r="${BADGE_R}" fill="#FFFFFF"/>
       <text x="${cx}" y="${cy}" fill="${hex}" font-family="Arial, Helvetica, sans-serif"
             font-size="120" font-weight="bold" text-anchor="middle"
             dominant-baseline="central">${number}</text>
       <!-- brand wordmark at the very bottom -->
       <text x="${cx}" y="${H - 70}" fill="#FFFFFF" fill-opacity="0.9"
             font-family="Arial, Helvetica, sans-serif" font-size="40"
             font-weight="bold" letter-spacing="2" text-anchor="middle">stikmnek.com</text>
     </svg>`,
  );
}

async function build(flow, n) {
  const theme = THEMES[flow];
  const scene = path.join(SCENES_DIR, `scene_${flow}_${n}.png`);
  if (!fs.existsSync(scene)) {
    console.warn('  ! missing', scene);
    return null;
  }

  // Square illustration, cover-cropped (keeps the centred subject sharp).
  const img = await sharp(scene)
    .resize(W, IMG_H, { fit: 'cover', position: 'centre' })
    .toBuffer();

  const out = path.join(OUT_DIR, `${flow}_step${n}.png`);
  await sharp({
    create: { width: W, height: H, channels: 4, background: theme.panel },
  })
    .composite([
      { input: img, left: 0, top: 0 },
      { input: overlaySvg(theme.hex, n), left: 0, top: 0 },
    ])
    .png()
    .toFile(out);

  return out;
}

const made = [];
for (const flow of ['business', 'tourist']) {
  for (let n = 1; n <= 6; n++) {
    const out = await build(flow, n);
    if (out) made.push(out);
  }
}

console.log(`Created ${made.length} vertical 1080x1920 cards in:`);
console.log('  ' + OUT_DIR);
for (const m of made) console.log('  - ' + path.basename(m));
