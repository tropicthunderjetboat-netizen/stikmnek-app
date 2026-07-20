const sharp = require('sharp');
const path = require('path');

const p = path.join(__dirname, '..', 'public');

async function main() {
  const base = await sharp(path.join(p, 'welcome-hero.jpg'))
    .resize(1200, 630, { fit: 'cover', position: 'centre' })
    .toBuffer();

  const logo = await sharp(path.join(p, 'app-icon-192.png'))
    .resize(72, 72)
    .png()
    .toBuffer();

  const svg = Buffer.from(`
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#042f2e" stop-opacity="0.18"/>
      <stop offset="40%" stop-color="#042f2e" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#022c22" stop-opacity="0.94"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect x="48" y="48" width="220" height="44" rx="22" fill="rgba(15,181,181,0.95)"/>
  <text x="158" y="77" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" fill="#ffffff">Tourist Pass</text>
  <text x="60" y="360" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="800" fill="#ffffff">Save up to 35% in Vanuatu</text>
  <text x="60" y="425" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="600" fill="#ccfbf1">Dining · Tours · Activities · Spa · Stays</text>
  <text x="60" y="515" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" fill="#ffffff">Get your StikmNek Pass — book local deals direct</text>
  <text x="60" y="565" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="500" fill="#99f6e4">www.stikmnek.com</text>
</svg>`);

  const out = await sharp(base)
    .composite([
      { input: svg, top: 0, left: 0 },
      { input: logo, top: 48, left: 1080 },
    ])
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(path.join(p, 'og-facebook-preview.jpg'));

  await sharp(path.join(p, 'og-facebook-preview.jpg')).toFile(path.join(p, 'og.jpg'));
  console.log(out);
  const m = await sharp(path.join(p, 'og-facebook-preview.jpg')).metadata();
  console.log('final', m.width, m.height, m.size);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
