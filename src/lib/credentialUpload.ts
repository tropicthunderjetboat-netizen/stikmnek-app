const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

/** Windows often leaves `file.type` empty for PDFs — infer from extension. */
export function mimeTypeForCredentialFile(file: File): string {
  const t = (file.type || '').toLowerCase().trim();
  if (t && ALLOWED_MIME.has(t)) return t;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/pdf';
}

export function credentialStoragePath(userId: string, businessId: string, fileName: string): string {
  const ext = (fileName.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
  const safeExt = ['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(ext)
    ? ext === 'jpeg'
      ? 'jpg'
      : ext
    : 'pdf';
  return `${userId}/${businessId}/${crypto.randomUUID()}.${safeExt}`;
}

export async function edgeFunctionErrorMessage(
  data: unknown,
  invokeError: unknown,
): Promise<string> {
  const fromData = (o: unknown): string => {
    if (!o || typeof o !== 'object') return '';
    const r = o as Record<string, unknown>;
    if (typeof r.error === 'string' && r.error.trim()) return r.error.trim();
    if (typeof r.message === 'string' && r.message.trim()) return r.message.trim();
    return '';
  };
  let msg = fromData(data) || (invokeError as { message?: string })?.message?.trim() || '';
  const ctx = (invokeError as { context?: Response })?.context;
  if (!msg && ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      msg = fromData(body);
    } catch {
      /* ignore */
    }
  }
  return msg || 'Upload failed. Please try again.';
}
