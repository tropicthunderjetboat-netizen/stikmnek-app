/**
 * Edge Middleware — previously served crawler-only OG HTML for `/deal/:path*`.
 *
 * Build-time SSG (`scripts/ssg/generate-static.mjs`) now writes per-deal static
 * HTML (meta + JSON-LD + body content) into `dist/deal/<slug>/index.html`.
 * Always fall through so those static files (and the SPA) are served.
 */
import { next } from '@vercel/edge';

export const config = {
  matcher: '/deal/:path*',
};

export default async function middleware(_request: Request): Promise<Response> {
  return next();
}
