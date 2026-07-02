import React, { Suspense, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { getEdgeAuthHeaders, supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { AdminOnboardContext } from './BusinessListingForm';
import PhotoUploader, { type UploadedPhoto } from './PhotoUploader';
import BusinessCredentialsSettings from './BusinessCredentialsSettings';
import {
  UserPlus, Loader2, CheckCircle, Copy, RefreshCw, Mail, KeyRound,
  ExternalLink, AlertCircle, ArrowRight, Store, Image as ImageIcon, Save,
} from 'lucide-react';

const BusinessListingForm = React.lazy(() => import('./BusinessListingForm'));

type Phase = 'login' | 'listing' | 'done';

interface CreatedResult {
  businessId: string;
  offeringId: string;
  listingUrl: string;
  emailSent: boolean;
  emailError?: string;
  passwordLinkGenerated: boolean;
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const pick = (n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)))
      .map((x) => chars[x % chars.length])
      .join('');
  return `${pick(4)}-${pick(4)}-${pick(4)}`;
}

async function readEdgeError(error: unknown, data: unknown): Promise<string> {
  const fromObj = (o: unknown): string => {
    if (!o || typeof o !== 'object') return '';
    const r = o as Record<string, unknown>;
    if (typeof r.error === 'string' && r.error.trim()) return r.error.trim();
    if (typeof r.message === 'string' && r.message.trim()) return r.message.trim();
    return '';
  };
  const direct = fromObj(data);
  if (direct) return direct;
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx instanceof Response) {
    try {
      const j = await ctx.clone().json();
      const m = fromObj(j);
      if (m) return m;
    } catch {
      /* ignore */
    }
  }
  return (error as { message?: string } | null)?.message?.trim() || 'Request failed';
}

const inputClass =
  'w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

const AdminBusinessOnboarding: React.FC = () => {
  const { user } = useAppContext();
  const [phase, setPhase] = useState<Phase>('login');
  const [creating, setCreating] = useState(false);

  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [ownerId, setOwnerId] = useState('');
  const [result, setResult] = useState<CreatedResult | null>(null);

  // Post-creation finishing touches (need the live businessId).
  const [logoPhotos, setLogoPhotos] = useState<UploadedPhoto[]>([]);
  const [savingLogo, setSavingLogo] = useState(false);
  const [logoSaved, setLogoSaved] = useState(false);

  const loginValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && password.length >= 6;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error('Copy failed'),
    );
  };

  const resetAll = () => {
    setPhase('login');
    setOwnerName('');
    setEmail('');
    setPassword('');
    setOwnerId('');
    setResult(null);
    setLogoPhotos([]);
    setLogoSaved(false);
  };

  const handleSaveLogo = async () => {
    const logoUrl = logoPhotos[0]?.url?.trim();
    if (!logoUrl || !result?.businessId) return;
    setSavingLogo(true);
    try {
      const headers = await getEdgeAuthHeaders();
      const { data, error } = await supabase.functions.invoke('manage-business', {
        body: {
          action: 'update_business',
          businessId: result.businessId,
          updates: { logo_url: logoUrl, image: logoUrl },
        },
        headers,
      });
      const payload = data as Record<string, unknown> | null;
      if (error || payload?.success !== true) {
        toast.error(await readEdgeError(error, data));
        return;
      }
      setLogoSaved(true);
      toast.success('Logo saved');
    } catch (err) {
      toast.error('Failed to save logo: ' + ((err as Error)?.message || 'Unknown error'));
    } finally {
      setSavingLogo(false);
    }
  };

  const handleCreateLogin = async () => {
    setCreating(true);
    try {
      const headers = await getEdgeAuthHeaders();
      if (!headers.Authorization) {
        toast.error('No admin session. Sign in again and retry.');
        return;
      }
      const { data, error } = await supabase.functions.invoke('manage-business', {
        body: {
          action: 'admin_create_business_user',
          ownerName: ownerName.trim(),
          email: email.trim().toLowerCase(),
          password,
        },
        headers,
      });
      const payload = data as Record<string, unknown> | null;
      if (error || payload?.success !== true || !payload?.ownerId) {
        toast.error(await readEdgeError(error, data));
        return;
      }
      setOwnerId(String(payload.ownerId));
      setPhase('listing');
      toast.success('Login created — now set up the business profile and deal');
    } catch (err) {
      toast.error('Failed: ' + ((err as Error)?.message || 'Unknown error'));
    } finally {
      setCreating(false);
    }
  };

  const onListingCreated: AdminOnboardContext['onCreated'] = (r) => {
    setResult(r);
    setPhase('done');
  };

  // ─── Success ───
  if (phase === 'done' && result) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-6 text-white">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-3">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold">Business account created</h3>
            <p className="text-white/80 text-sm mt-1">The login, profile, and deal are live.</p>
          </div>
          <div className="p-6 space-y-5">
            <div className={`rounded-xl border p-4 flex items-start gap-3 ${
              result.emailSent ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
            }`}>
              {result.emailSent ? (
                <Mail className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              )}
              <div className="text-sm">
                {result.emailSent ? (
                  <p className="text-green-800">
                    A welcome email was sent to <strong>{email.trim().toLowerCase()}</strong> with a link to set
                    their password and review the listing.
                  </p>
                ) : (
                  <div className="text-amber-800">
                    <p className="font-semibold">The account and listing were created, but the email could not be sent.</p>
                    <p className="mt-1">
                      {result.passwordLinkGenerated
                        ? 'Share the login details below and ask them to use “Forgot password” to set their own password.'
                        : 'Check RESEND_API_KEY and Supabase redirect URLs. Share the login details below in the meantime.'}
                      {result.emailError ? ` (${result.emailError})` : ''}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Login email</p>
                  <p className="text-sm font-medium text-gray-900">{email.trim().toLowerCase()}</p>
                </div>
                <button onClick={() => copy(email.trim().toLowerCase(), 'Email')} className="p-2 rounded-lg hover:bg-gray-100">
                  <Copy className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Temporary password</p>
                  <p className="text-sm font-mono font-medium text-gray-900">{password}</p>
                </div>
                <button onClick={() => copy(password, 'Password')} className="p-2 rounded-lg hover:bg-gray-100">
                  <Copy className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              {result.listingUrl && (
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Listing</p>
                    <a
                      href={result.listingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-teal-600 hover:underline truncate flex items-center gap-1"
                    >
                      View listing <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                    </a>
                  </div>
                  <button onClick={() => copy(result.listingUrl, 'Listing URL')} className="p-2 rounded-lg hover:bg-gray-100">
                    <Copy className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800 flex items-start gap-2">
              <KeyRound className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>
                The owner sets their own password from the emailed link (or via “Forgot password”).
                The temporary password above is a fallback so they can sign in right away.
              </p>
            </div>
          </div>
        </div>

        {/* Finishing touches: logo + credentials (need the live business profile). */}
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
              <ImageIcon className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-gray-900">Business logo</h3>
              <p className="text-sm text-gray-500 mt-1">
                Optional — tourists see this on the map and in search. Upload, then drag/zoom to fit the square.
              </p>
            </div>
          </div>
          {user?.id && (
            <PhotoUploader
              photos={logoPhotos}
              onPhotosChange={(next) => { setLogoPhotos(next); setLogoSaved(false); }}
              maxPhotos={1}
              userId={user.id}
              logoCrop
              label="Business logo"
              sublabel="Optional — upload, then adjust to fit the square (like a profile photo)."
            />
          )}
          <button
            onClick={handleSaveLogo}
            disabled={savingLogo || !logoPhotos[0]?.url || logoSaved}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 transition-colors disabled:opacity-40"
          >
            {savingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : logoSaved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {logoSaved ? 'Logo saved' : savingLogo ? 'Saving…' : 'Save logo'}
          </button>
        </div>

        {/* Credentials uploader (same component owners use; admin is authorized). */}
        {result.businessId && (
          <div className="mt-6">
            <BusinessCredentialsSettings
              profileBusinessId={result.businessId}
              persistOnUpload
            />
          </div>
        )}

        <button
          onClick={resetAll}
          className="mt-6 w-full max-w-2xl mx-auto py-3 rounded-xl bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700 transition-colors flex items-center justify-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Onboard another business
        </button>
      </div>
    );
  }

  // ─── Step 2: business profile + deal (the exact same listing form/tiles as normal) ───
  if (phase === 'listing') {
    return (
      <div>
        <div className="max-w-2xl mx-auto mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 flex items-start gap-3">
          <Store className="w-5 h-5 text-teal-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-teal-900">
            <p className="font-semibold">Login created for {email.trim().toLowerCase()}</p>
            <p>Now fill out the business profile and first deal below. When you submit, it goes live and the owner is emailed to set their password and review it.</p>
          </div>
        </div>
        <Suspense
          fallback={
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 text-teal-600 animate-spin" />
            </div>
          }
        >
          <BusinessListingForm
            adminOnboard={{
              ownerId,
              ownerEmail: email.trim().toLowerCase(),
              ownerName: ownerName.trim(),
              onCreated: onListingCreated,
            }}
          />
        </Suspense>
      </div>
    );
  }

  // ─── Step 1: login ───
  return (
    <div className="max-w-xl mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Onboard a business — Step 1: Login</h3>
            <p className="text-sm text-gray-500">Create the owner's sign-in. They set their own password from an emailed link.</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Owner name</label>
            <input
              className={inputClass}
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="e.g. Marie Joseph"
            />
          </div>
          <div>
            <label className={labelClass}>Login email <span className="text-red-500">*</span></label>
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@business.com"
              autoComplete="off"
            />
          </div>
          <div>
            <label className={labelClass}>Temporary password <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setPassword(generatePassword())}
                className="flex-shrink-0 px-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors flex items-center gap-1.5"
                title="Generate a password"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Generate
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              A fallback only — the owner gets an email to set their own password.
            </p>
          </div>
          <button
            onClick={handleCreateLogin}
            disabled={!loginValid || creating}
            className="w-full py-3 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {creating ? 'Creating login…' : 'Create login & continue'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminBusinessOnboarding;
