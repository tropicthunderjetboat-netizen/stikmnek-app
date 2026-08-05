/**
 * Build Facebook cover, OG preview, and email signature from photo + logo + SVG type.
 * Run: node scripts/generate-brand-social.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');
const outDir = path.join(pub, 'brand');
const cursorAssets = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.cursor',
  'projects',
  'c-Users-User-Documents-GitHub-stikmnek-app',
  'assets',
);

const coverBgCandidates = [
  path.join(cursorAssets, 'facebook-cover-bg.png'),
  path.join(root, 'docs', 'brand-assets', 'facebook-cover-bg.png'),
  path.join(pub, 'welcome-hero.jpg'),
];
const harbourBgCandidates = [
  path.join(cursorAssets, 'brand-harbour-bg.png'),
  path.join(root, 'docs', 'brand-assets', 'brand-harbour-bg.png'),
  path.join(pub, 'welcome-hero.jpg'),
];

function firstExisting(paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`None found:\n${paths.join('\n')}`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'brand-assets'), { recursive: true });

  const coverBgSrc = firstExisting(coverBgCandidates);
  const harbourBgSrc = firstExisting(harbourBgCandidates);
  const logoSrc = path.join(pub, 'app-icon.png');

  // Keep source photos in repo for future regenerations
  await sharp(coverBgSrc).png().toFile(path.join(root, 'docs', 'brand-assets', 'facebook-cover-bg.png'));
  await sharp(harbourBgSrc).jpeg({ quality: 90 }).toFile(path.join(root, 'docs', 'brand-assets', 'brand-harbour-bg.jpg'));

  const logo72 = await sharp(logoSrc).resize(72, 72).png().toBuffer();
  const logo88 = await sharp(logoSrc).resize(88, 88).png().toBuffer();
  const logo56 = await sharp(logoSrc).resize(56, 56).png().toBuffer();

  // ── Facebook Page cover: 1640 × 624 ──────────────────────────────────────
  const COVER_W = 1640;
  const COVER_H = 624;
  const coverBase = await sharp(coverBgSrc)
    .resize(COVER_W, COVER_H, { fit: 'cover', position: 'right' })
    .toBuffer();

  const coverSvg = Buffer.from(`
<svg width="${COVER_W}" height="${COVER_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#042f2e" stop-opacity="0.88"/>
      <stop offset="48%" stop-color="#042f2e" stop-opacity="0.62"/>
      <stop offset="78%" stop-color="#042f2e" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#042f2e" stop-opacity="0.05"/>
    </linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0D9488"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <rect width="${COVER_W}" height="${COVER_H}" fill="url(#wash)"/>
  <rect x="72" y="48" width="168" height="36" rx="18" fill="url(#brand)"/>
  <text x="156" y="72" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#ffffff">StikmNek Pass</text>
  <text x="72" y="220" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="800" fill="#ffffff">One pass. Swipe deals.</text>
  <text x="72" y="284" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="800" fill="#ffffff">Show QR. Save.</text>
  <text x="72" y="342" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="600" fill="#ccfbf1">Up to 35% at local Vanuatu partners</text>
  <text x="72" y="388" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="600" fill="#99f6e4">Dining · Tours · Activities · Transport · Spa · Stays</text>
  <text x="72" y="448" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#5eead4">www.stikmnek.com · one QR for your group</text>
</svg>`);

  await sharp(coverBase)
    .composite([
      { input: coverSvg, top: 0, left: 0 },
      { input: logo88, top: 40, left: 1520 },
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(path.join(outDir, 'facebook-cover.jpg'));

  // ── OG / Facebook share preview: 1200 × 630 ──────────────────────────────
  const OG_W = 1200;
  const OG_H = 630;
  const ogBase = await sharp(coverBgSrc)
    .resize(OG_W, OG_H, { fit: 'cover', position: 'right' })
    .toBuffer();

  const ogSvg = Buffer.from(`
<svg width="${OG_W}" height="${OG_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#042f2e" stop-opacity="0.90"/>
      <stop offset="50%" stop-color="#042f2e" stop-opacity="0.58"/>
      <stop offset="100%" stop-color="#042f2e" stop-opacity="0.12"/>
    </linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0D9488"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <rect width="${OG_W}" height="${OG_H}" fill="url(#wash)"/>
  <rect x="48" y="48" width="168" height="40" rx="20" fill="url(#brand)"/>
  <text x="132" y="74" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" fill="#ffffff">StikmNek Pass</text>
  <text x="48" y="280" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="800" fill="#ffffff">One pass. Swipe deals.</text>
  <text x="48" y="338" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="800" fill="#ffffff">Show QR. Save.</text>
  <text x="48" y="400" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="600" fill="#ccfbf1">Up to 35% · local Vanuatu partners</text>
  <text x="48" y="448" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="600" fill="#99f6e4">Dining · Tours · Activities · Transport · Spa · Stays</text>
  <text x="48" y="560" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#5eead4">www.stikmnek.com</text>
</svg>`);

  const ogOut = path.join(pub, 'og-facebook-preview.jpg');
  await sharp(ogBase)
    .composite([
      { input: ogSvg, top: 0, left: 0 },
      { input: logo72, top: 48, left: 1080 },
    ])
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(ogOut);
  await sharp(ogOut).toFile(path.join(pub, 'og.jpg'));
  await sharp(ogOut).toFile(path.join(outDir, 'og-facebook-preview.jpg'));

  // ── Email signature: split photo + brand card ─────────────────────────────
  const SIG_W = 640;
  const SIG_H = 220;
  const PHOTO_W = 250;

  const sigPhoto = await sharp(coverBgSrc)
    .resize(PHOTO_W, SIG_H, { fit: 'cover', position: 'right' })
    .jpeg({ quality: 88 })
    .toBuffer();

  await sharp(coverBgSrc)
    .resize(168, 220, { fit: 'cover', position: 'right' })
    .jpeg({ quality: 88 })
    .toFile(path.join(outDir, 'email-signature-thumb.jpg'));

  const sigCardSvg = Buffer.from(`
<svg width="${SIG_W}" height="${SIG_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F766E"/>
      <stop offset="55%" stop-color="#0D9488"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <rect x="${PHOTO_W}" y="0" width="${SIG_W - PHOTO_W}" height="${SIG_H}" fill="url(#card)"/>
  <rect x="${PHOTO_W}" y="0" width="6" height="${SIG_H}" fill="#F97316"/>
  <text x="${PHOTO_W + 78}" y="52" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="800" fill="#ffffff">StikmNek</text>
  <text x="${PHOTO_W + 22}" y="92" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" fill="#ffffff">Swipe deals. Show QR. Save.</text>
  <text x="${PHOTO_W + 22}" y="118" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="600" fill="#ccfbf1">One pass for your group · up to 35% local</text>
  <rect x="${PHOTO_W + 22}" y="138" width="148" height="34" rx="17" fill="#F97316"/>
  <text x="${PHOTO_W + 96}" y="160" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="800" fill="#ffffff">Get your pass →</text>
  <text x="${PHOTO_W + 22}" y="196" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="600" fill="#ecfdf5">www.stikmnek.com · +678 7766107</text>
</svg>`);

  await sharp({
    create: { width: SIG_W, height: SIG_H, channels: 3, background: '#0F766E' },
  })
    .jpeg()
    .composite([
      { input: sigPhoto, top: 0, left: 0 },
      { input: sigCardSvg, top: 0, left: 0 },
      { input: logo56, top: 18, left: PHOTO_W + 16 },
    ])
    .png()
    .toFile(path.join(outDir, 'email-signature.png'));

  await sharp(path.join(outDir, 'email-signature.png'))
    .jpeg({ quality: 90 })
    .toFile(path.join(outDir, 'email-signature.jpg'));

  const SIG2_W = 1280;
  const SIG2_H = 440;
  const PHOTO2_W = 500;
  const sigPhoto2 = await sharp(coverBgSrc)
    .resize(PHOTO2_W, SIG2_H, { fit: 'cover', position: 'right' })
    .jpeg({ quality: 88 })
    .toBuffer();
  const logo64 = await sharp(logoSrc).resize(64, 64).png().toBuffer();
  const sig2Svg = Buffer.from(`
<svg width="${SIG2_W}" height="${SIG2_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F766E"/>
      <stop offset="55%" stop-color="#0D9488"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <rect x="${PHOTO2_W}" y="0" width="${SIG2_W - PHOTO2_W}" height="${SIG2_H}" fill="url(#card)"/>
  <rect x="${PHOTO2_W}" y="0" width="12" height="${SIG2_H}" fill="#F97316"/>
  <text x="${PHOTO2_W + 156}" y="108" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="800" fill="#ffffff">StikmNek</text>
  <text x="${PHOTO2_W + 44}" y="186" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700" fill="#ffffff">Swipe deals. Show QR. Save.</text>
  <text x="${PHOTO2_W + 44}" y="236" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="600" fill="#ccfbf1">One pass for your group · up to 35% local</text>
  <rect x="${PHOTO2_W + 44}" y="270" width="296" height="68" rx="34" fill="#F97316"/>
  <text x="${PHOTO2_W + 192}" y="314" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="800" fill="#ffffff">Get your pass →</text>
  <text x="${PHOTO2_W + 44}" y="392" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="600" fill="#ecfdf5">www.stikmnek.com · +678 7766107</text>
</svg>`);
  await sharp({
    create: { width: SIG2_W, height: SIG2_H, channels: 3, background: '#0F766E' },
  })
    .jpeg()
    .composite([
      { input: sigPhoto2, top: 0, left: 0 },
      { input: sig2Svg, top: 0, left: 0 },
      { input: await sharp(logoSrc).resize(112, 112).png().toBuffer(), top: 36, left: PHOTO2_W + 32 },
    ])
    .png()
    .toFile(path.join(outDir, 'email-signature@2x.png'));

  console.log('Wrote:');
  console.log(' ', path.join(outDir, 'facebook-cover.jpg'));
  console.log(' ', ogOut);
  console.log(' ', path.join(outDir, 'email-signature.png'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
