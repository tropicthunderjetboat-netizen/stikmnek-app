/**
 * Post-Vite SSG: bake listing/FAQ content into static HTML for crawlers.
 *
 * Writes under dist/:
 *   index.html (home), deals/index.html, faq/index.html,
 *   deal/<slug>/index.html, partner/<slug>/index.html, sitemap.xml
 *
 * Humans still get the SPA: content is injected inside #root and React
 * replaces it on mount. Crawlers that skip JS see the baked HTML + JSON-LD.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOURIST_FAQ } from './faq.mjs';
import {
  SITE_ORIGIN,
  DEFAULT_OG_IMAGE,
  escapeHtml,
  categoryLabel,
  formatVT,
  loadListings,
  groupPartners,
  jsonLdScript,
  localBusinessJsonLd,
} from './helpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DIST = path.join(ROOT, 'dist');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeHtml(relPath, html) {
  const full = path.join(DIST, relPath);
  ensureDir(path.dirname(full));
  fs.writeFileSync(full, html, 'utf8');
}

function priceLine(listing) {
  const bits = [];
  if (listing.discount) bits.push(listing.discount);
  const dealOk = listing.dealPrice != null && listing.dealPrice > 0;
  const origOk = listing.originalPrice != null && listing.originalPrice > 0;
  const deal = dealOk ? formatVT(listing.dealPrice) : null;
  const orig = origOk ? formatVT(listing.originalPrice) : null;
  if (deal && orig && listing.dealPrice < listing.originalPrice) {
    bits.push(`${deal} (was ${orig})`);
  } else if (deal) {
    bits.push(deal);
  }
  return bits.join(' · ');
}

function listingCard(listing) {
  const price = priceLine(listing);
  return `<li>
  <a href="${escapeHtml(listing.dealPath)}"><strong>${escapeHtml(listing.title)}</strong></a>
  ${listing.profileName && listing.profileName !== listing.title ? ` — ${escapeHtml(listing.profileName)}` : ''}
  <br />
  <span>${escapeHtml(categoryLabel(listing.category))}${listing.location ? ` · ${escapeHtml(listing.location)}` : ''}${price ? ` · ${escapeHtml(price)}` : ''}</span>
  ${listing.description ? `<p>${escapeHtml(listing.description.slice(0, 220))}${listing.description.length > 220 ? '…' : ''}</p>` : ''}
</li>`;
}

function stripPreviousSsg(html) {
  const startMarker = '<div id="ssg-content"';
  let out = html;
  let start = out.indexOf(startMarker);
  while (start !== -1) {
    let i = start;
    let depth = 0;
    let end = -1;
    while (i < out.length) {
      const nextOpen = out.indexOf('<div', i);
      const nextClose = out.indexOf('</div>', i);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        i = nextOpen + 4;
      } else {
        depth -= 1;
        i = nextClose + 6;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break;
    out = `${out.slice(0, start)}${out.slice(end)}`;
    start = out.indexOf(startMarker);
  }
  // Collapse #root back to empty so injection is deterministic.
  out = out.replace(/<div id="root"[^>]*>\s*<\/div>/i, '<div id="root"></div>');
  return out;
}

function shellPage({
  template,
  title,
  description,
  canonicalPath,
  jsonLdBlocks = [],
  bodyHtml,
  ogImage = DEFAULT_OG_IMAGE,
}) {
  const canonical = `${SITE_ORIGIN}${canonicalPath === '/' ? '/' : canonicalPath}`;
  let html = stripPreviousSsg(template);

  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);

  html = html.replace(
    /<meta\s+name="title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="title" content="${escapeHtml(title)}" />`,
  );
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(description)}" />`,
  );
  html = html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
  );

  const ogReplacements = [
    [/property="og:url"\s+content="[^"]*"/i, `property="og:url" content="${escapeHtml(canonical)}"`],
    [/property="og:title"\s+content="[^"]*"/i, `property="og:title" content="${escapeHtml(title)}"`],
    [
      /property="og:description"\s+content="[^"]*"/i,
      `property="og:description" content="${escapeHtml(description)}"`,
    ],
    [/property="og:image"\s+content="[^"]*"/i, `property="og:image" content="${escapeHtml(ogImage)}"`],
    [
      /property="og:image:secure_url"\s+content="[^"]*"/i,
      `property="og:image:secure_url" content="${escapeHtml(ogImage)}"`,
    ],
    [/name="twitter:url"\s+content="[^"]*"/i, `name="twitter:url" content="${escapeHtml(canonical)}"`],
    [/name="twitter:title"\s+content="[^"]*"/i, `name="twitter:title" content="${escapeHtml(title)}"`],
    [
      /name="twitter:description"\s+content="[^"]*"/i,
      `name="twitter:description" content="${escapeHtml(description)}"`,
    ],
    [/name="twitter:image"\s+content="[^"]*"/i, `name="twitter:image" content="${escapeHtml(ogImage)}"`],
  ];
  for (const [re, replacement] of ogReplacements) {
    html = html.replace(re, replacement);
  }

  // Drop JSON-LD blocks we injected on a previous SSG pass (keep the sitewide
  // Organization / WebApplication blocks from the Vite index.html template).
  html = html.replace(
    /\n?\s*<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"(?:WebSite|CollectionPage|FAQPage|TouristTrip|TouristAttraction|FoodEstablishment|LocalBusiness|TravelAgency|DaySpa|LodgingBusiness|Store)"[\s\S]*?<\/script>/g,
    '',
  );

  if (jsonLdBlocks.length) {
    const injection = `\n    ${jsonLdBlocks.map(jsonLdScript).join('\n    ')}\n`;
    html = html.replace('</head>', `${injection}</head>`);
  }

  const crawlerBlock = `
    <div id="ssg-content" data-ssg="true">
${bodyHtml}
    </div>`;

  // Inject once inside #root only — never also into <noscript> (that caused
  // the homepage deals list to appear twice in raw HTML).
  if (/<div id="root"><\/div>/i.test(html)) {
    html = html.replace(
      /<div id="root"><\/div>/i,
      `<div id="root">${crawlerBlock}\n    </div>`,
    );
  } else {
    html = html.replace('</body>', `${crawlerBlock}\n  </body>`);
  }

  return html;
}

function homeBody(listings) {
  const featured = listings.filter((l) => l.discount).slice(0, 40);
  const list = featured.length ? featured : listings.slice(0, 40);
  return `
      <h1>StikmNek — Save up to 35% in Vanuatu</h1>
      <p>Unlock local dining, tours, activities, spa &amp; stays with a StikmNek Tourist Pass. Book direct with partners via WhatsApp.</p>
      <p><a href="/deals">Browse all deals</a> · <a href="/passes">Get a pass</a> · <a href="/faq">FAQ</a></p>
      <h2>Featured deals</h2>
      <ul>
${list.map(listingCard).join('\n') || '        <li>New partner deals are added regularly.</li>'}
      </ul>`;
}

function dealsBody(listings) {
  const byCat = new Map();
  for (const listing of listings) {
    const key = listing.category || 'activities';
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key).push(listing);
  }
  const sections = [...byCat.entries()]
    .sort(([a], [b]) => categoryLabel(a).localeCompare(categoryLabel(b)))
    .map(
      ([cat, items]) => `
      <h2>${escapeHtml(categoryLabel(cat))}</h2>
      <ul>
${items.map(listingCard).join('\n')}
      </ul>`,
    )
    .join('\n');

  return `
      <h1>All Deals — StikmNek Vanuatu</h1>
      <p>Browse dining, tours, activities, spa, shopping, transportation, and accommodation discounts for StikmNek Pass holders.</p>
      <p><a href="/">Home</a> · <a href="/passes">Get a pass</a></p>
${sections || '      <p>No live deals right now — check back soon.</p>'}`;
}

function faqBody() {
  const items = TOURIST_FAQ.map(
    (item) => `
      <section>
        <h2>${escapeHtml(item.question)}</h2>
        <p>${escapeHtml(item.answer)}</p>
      </section>`,
  ).join('\n');
  return `
      <h1>StikmNek FAQ</h1>
      <p>Common questions about the StikmNek Pass, redemptions, and partner deals in Vanuatu.</p>
${items}
      <p><a href="/">Home</a> · <a href="/deals">Browse deals</a></p>`;
}

function dealBody(listing) {
  const price = priceLine(listing);
  return `
      <h1>${escapeHtml(listing.title)}</h1>
      ${listing.profileName ? `<p><strong>${escapeHtml(listing.profileName)}</strong></p>` : ''}
      <p>${escapeHtml(categoryLabel(listing.category))}${listing.location ? ` · ${escapeHtml(listing.location)}` : ''}</p>
      ${price ? `<p><strong>${escapeHtml(price)}</strong></p>` : ''}
      ${listing.description ? `<p>${escapeHtml(listing.description)}</p>` : ''}
      <p>Pass holders unlock this deal on StikmNek. <a href="/passes">Get a pass</a> · <a href="/deals">More deals</a>${
        listing.partnerPath
          ? ` · <a href="${escapeHtml(listing.partnerPath)}">Partner page</a>`
          : ''
      }</p>`;
}

function partnerBody(partner) {
  return `
      <h1>${escapeHtml(partner.name)}</h1>
      <p>${escapeHtml(categoryLabel(partner.category))}${partner.location ? ` · ${escapeHtml(partner.location)}` : ''}</p>
      ${partner.description ? `<p>${escapeHtml(partner.description)}</p>` : ''}
      <h2>Live deals</h2>
      <ul>
${partner.offerings.map(listingCard).join('\n')}
      </ul>
      <p><a href="/deals">All deals</a> · <a href="/passes">Get a pass</a></p>`;
}

function buildSitemap({ listings, partners }) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE_ORIGIN}/`, priority: '1.0', changefreq: 'daily' },
    { loc: `${SITE_ORIGIN}/deals`, priority: '0.9', changefreq: 'daily' },
    { loc: `${SITE_ORIGIN}/faq`, priority: '0.7', changefreq: 'weekly' },
    { loc: `${SITE_ORIGIN}/help`, priority: '0.5', changefreq: 'weekly' },
    { loc: `${SITE_ORIGIN}/map`, priority: '0.6', changefreq: 'weekly' },
    { loc: `${SITE_ORIGIN}/passes`, priority: '0.8', changefreq: 'weekly' },
  ];
  for (const listing of listings) {
    urls.push({
      loc: `${SITE_ORIGIN}${listing.dealPath}`,
      priority: '0.8',
      changefreq: 'daily',
    });
  }
  for (const partner of partners) {
    urls.push({
      loc: `${SITE_ORIGIN}${partner.partnerPath}`,
      priority: '0.7',
      changefreq: 'daily',
    });
  }

  const body = urls
    .map(
      (u) => `  <url>
    <loc>${escapeHtml(u.loc)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: TOURIST_FAQ.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

async function main() {
  const templatePath = path.join(DIST, 'index.html');
  if (!fs.existsSync(templatePath)) {
    console.error('[ssg] dist/index.html missing — run `vite build` first');
    process.exit(1);
  }
  const template = fs.readFileSync(templatePath, 'utf8');

  console.log('[ssg] Fetching active listings from Supabase…');
  const listings = await loadListings();
  const partners = groupPartners(listings);
  console.log(`[ssg] ${listings.length} deals, ${partners.length} partners`);

  // Home
  writeHtml(
    'index.html',
    shellPage({
      template,
      title: 'Save up to 35% in Vanuatu — StikmNek Tourist Pass',
      description:
        "Unlock local dining, tours, activities, spa & stays. Buy a StikmNek Tourist Pass and book Vanuatu's best deals direct with WhatsApp.",
      canonicalPath: '/',
      bodyHtml: homeBody(listings),
      jsonLdBlocks: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'StikmNek',
          url: SITE_ORIGIN,
          description:
            "Vanuatu tourist discount pass — dining, tours, activities, spa and stays.",
        },
      ],
    }),
  );

  // /deals
  writeHtml(
    'deals/index.html',
    shellPage({
      template,
      title: 'All Deals in Vanuatu — StikmNek',
      description:
        'Browse StikmNek Pass holder deals across dining, tours, activities, spa, shopping, transportation and accommodation in Vanuatu.',
      canonicalPath: '/deals',
      bodyHtml: dealsBody(listings),
      jsonLdBlocks: [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'StikmNek Deals',
          url: `${SITE_ORIGIN}/deals`,
          mainEntity: listings.slice(0, 50).map((l) => ({
            '@type': 'Offer',
            name: l.title,
            url: `${SITE_ORIGIN}${l.dealPath}`,
            description: l.discount || l.description.slice(0, 160),
          })),
        },
      ],
    }),
  );

  // /faq
  writeHtml(
    'faq/index.html',
    shellPage({
      template,
      title: 'FAQ — StikmNek Tourist Pass',
      description:
        'How the StikmNek Pass works, where to use it, pricing, redemptions, and more.',
      canonicalPath: '/faq',
      bodyHtml: faqBody(),
      jsonLdBlocks: [faqJsonLd()],
    }),
  );

  // /deal/:slug
  for (const listing of listings) {
    const desc =
      (listing.discount ? `${listing.discount}. ` : '') +
      (listing.description.slice(0, 180) ||
        `${listing.title} — local Vanuatu deal on StikmNek.`);
    writeHtml(
      `${listing.dealPath.replace(/^\//, '')}/index.html`,
      shellPage({
        template,
        title: `${listing.title} · StikmNek`,
        description: desc.slice(0, 200),
        canonicalPath: listing.dealPath,
        ogImage: listing.image || DEFAULT_OG_IMAGE,
        bodyHtml: dealBody(listing),
        jsonLdBlocks: [localBusinessJsonLd(listing)],
      }),
    );
  }

  // /partner/:slug
  for (const partner of partners) {
    const desc =
      partner.description.slice(0, 200) ||
      `${partner.name} — StikmNek partner in Vanuatu with ${partner.offerings.length} live deal(s).`;
    writeHtml(
      `${partner.partnerPath.replace(/^\//, '')}/index.html`,
      shellPage({
        template,
        title: `${partner.name} · StikmNek Partner`,
        description: desc,
        canonicalPath: partner.partnerPath,
        ogImage: partner.image || DEFAULT_OG_IMAGE,
        bodyHtml: partnerBody(partner),
        jsonLdBlocks: [localBusinessJsonLd(partner, { isPartner: true })],
      }),
    );
  }

  writeHtml('sitemap.xml', buildSitemap({ listings, partners }));

  console.log(
    `[ssg] Wrote home, /deals, /faq, ${listings.length} deal pages, ${partners.length} partner pages, sitemap.xml`,
  );
}

main().catch((err) => {
  console.error('[ssg] Failed:', err);
  process.exit(1);
});
