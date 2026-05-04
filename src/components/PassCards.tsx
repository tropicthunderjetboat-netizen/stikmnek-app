import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAppContext, defaultPassCartFromProfile } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import { shouldOpenCheckoutInsteadOfPassesPage } from '@/utils/passNavigation';
import { Check, Zap, Crown, Star, CreditCard, Lock, ShieldCheck, Users, Baby, Calendar, Share2, Gift, Sparkles, Loader2, PartyPopper, Info } from 'lucide-react';

import { usePassConfig, PassConfig } from '@/hooks/usePassConfig';
import DealsPricingCard from '@/components/DealsPricingCard';
import { BASE_PRICE_AUD, MAX_PARTY_SIZE } from '@/data/pricing';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  getPassTripGuidance,
  buildPassStayMismatchMessage,
} from '@/lib/passRecommendation';

export interface PassCardsProps {
  /** Home layout: short CTA for signed-in buyers instead of the full marketing funnel. */
  embeddedOnHome?: boolean;
}

const KNOW_BEFORE_KEYS = ['pass.know_bullet_1', 'pass.know_bullet_2', 'pass.know_bullet_3', 'pass.know_bullet_4'] as const;
const KNOW_BEFORE_ICONS = [Share2, Users, Share2, Calendar] as const;

const getIconComponent = (icon: PassConfig['icon'], className = 'w-6 h-6') => {
  switch (icon) {
    case 'zap': return <Zap className={className} />;
    case 'star': return <Star className={className} />;
    case 'crown': return <Crown className={className} />;
    default: return <Zap className={className} />;
  }
};

// ─── Confetti Particle Component ───
const ConfettiParticle: React.FC<{ delay: number; color: string; left: number }> = ({ delay, color, left }) => (
  <div
    className="absolute w-2 h-2 rounded-full animate-confetti-fall pointer-events-none"
    style={{
      backgroundColor: color,
      left: `${left}%`,
      animationDelay: `${delay}ms`,
      top: '-8px',
    }}
  />
);

// ─── Celebration Overlay ───
const CelebrationOverlay: React.FC<{ show: boolean; passName: string; bonusDays: number; bonusPeople: number; bonusKids: number; language: string; onClose: () => void }> = ({
  show, passName, bonusDays, bonusPeople, bonusKids, language, onClose,
}) => {
  // Don't auto-close — wait for user to tap "Awesome!" so they see the updated validity
  // This ensures they're back in the app and see the confirmation before navigating away
  useEffect(() => {
    if (show) {
      // Safety auto-close after 15 seconds in case user doesn't interact
      const timer = setTimeout(onClose, 15000);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);


  if (!show) return null;

  const confettiColors = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        {/* Confetti particles */}
        <div className="absolute -inset-20 overflow-hidden pointer-events-none">
          {Array.from({ length: 40 }).map((_, i) => (
            <ConfettiParticle
              key={i}
              delay={Math.random() * 1500}
              color={confettiColors[i % confettiColors.length]}
              left={Math.random() * 100}
            />
          ))}
        </div>

        {/* Celebration Card */}
        <div className="relative bg-white rounded-3xl shadow-2xl p-8 max-w-sm mx-4 text-center animate-celebration-pop overflow-hidden">
          {/* Sparkle background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-4 left-6 animate-sparkle-1">
              <Sparkles className="w-5 h-5 text-yellow-400" />
            </div>
            <div className="absolute top-8 right-8 animate-sparkle-2">
              <Sparkles className="w-4 h-4 text-teal-400" />
            </div>
            <div className="absolute bottom-12 left-10 animate-sparkle-3">
              <Sparkles className="w-3 h-3 text-purple-400" />
            </div>
            <div className="absolute bottom-8 right-6 animate-sparkle-1" style={{ animationDelay: '0.5s' }}>
              <Sparkles className="w-4 h-4 text-pink-400" />
            </div>
          </div>

          <div className="relative">
            {/* Success icon */}
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-xl shadow-emerald-200 animate-bounce-slow">
              <PartyPopper className="w-10 h-10 text-white" />
            </div>

            <h3 className="text-2xl font-extrabold text-gray-900 mb-2">
              {language === 'en' ? 'Bonus Unlocked!' : language === 'fr' ? 'Bonus Débloqué !' : 'Bonus i Anlokem!'}
            </h3>

            <p className="text-gray-500 text-sm mb-5">
              {language === 'en'
                ? `Your ${passName} has been extended!`
                : language === 'fr'
                  ? `Votre ${passName} a été prolongé !`
                  : `${passName} blong yu i go longfala moa!`}
            </p>

            {/* Bonus badges */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
              {bonusDays > 0 && (
                <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 text-emerald-800 font-bold text-sm animate-badge-pop" style={{ animationDelay: '0.3s' }}>
                  <Calendar className="w-4 h-4" />
                  +{bonusDays} {language === 'en' ? 'free day' : language === 'fr' ? 'jour gratuit' : 'fri dei'}
                </div>
              )}
              {bonusPeople > 0 && (
                <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-blue-800 font-bold text-sm animate-badge-pop" style={{ animationDelay: '0.5s' }}>
                  <Users className="w-4 h-4" />
                  +{bonusPeople} {language === 'en' ? 'people' : language === 'fr' ? 'personnes' : 'man'}
                </div>
              )}
              {bonusKids > 0 && (
                <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 text-purple-800 font-bold text-sm animate-badge-pop" style={{ animationDelay: '0.7s' }}>
                  <Baby className="w-4 h-4" />
                  +{bonusKids} {language === 'en' ? 'kids' : language === 'fr' ? 'enfants' : 'pikinini'}
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:from-emerald-600 hover:to-teal-700 transition-all shadow-lg shadow-emerald-200"
            >
              {language === 'en' ? 'Awesome!' : language === 'fr' ? 'Génial !' : 'Nambawan!'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Ensure fresh session helper (replaces getValidAccessToken) ───
// We call this to force a session refresh if needed, but we do NOT
// pass the token as a custom Authorization header. The SDK handles that.
async function ensureFreshSession(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    const expiresAt = session.expires_at;
    const now = Math.floor(Date.now() / 1000);
    const secondsLeft = expiresAt ? expiresAt - now : 0;
    if (secondsLeft < 120) {
      console.log('[PassCards] Session expires in', secondsLeft, 's — refreshing...');
      const { data: { session: refreshed }, error } = await supabase.auth.refreshSession();
      if (error || !refreshed?.access_token) {
        console.warn('[PassCards] Session refresh failed:', error?.message);
        return null;
      }
      return refreshed.access_token;
    }
    return session.access_token;
  } catch (err) {
    console.error('[PassCards] ensureFreshSession threw:', err);
    return null;
  }
}


// ─── Helper: Extract HTTP status code from supabase FunctionsHttpError ───
// supabase.functions.invoke returns FunctionsHttpError for non-2xx responses.
// The error object has a `context` property which is the original Response object.
function extractStatusCode(error: any): number | null {
  try {
    // FunctionsHttpError.context is the Response object
    if (error?.context && typeof error.context.status === 'number') {
      return error.context.status;
    }
    // Some versions store status differently
    if (typeof error?.status === 'number') {
      return error.status;
    }
  } catch {}
  return null;
}

// ─── Helper: Extract error body from supabase.functions.invoke error ───
// FunctionsHttpError has a `context` property containing the Response object.
// We try multiple approaches since the body may already be consumed.
async function extractErrorBody(error: any): Promise<any> {
  try {
    // Approach 1: FunctionsHttpError.context is the Response — try .json()
    if (error?.context && typeof error.context.json === 'function') {
      try {
        return await error.context.json();
      } catch {
        // Body may already be consumed, try .text() on a clone if available
      }
    }

    // Approach 2: Try .text() and then JSON.parse
    if (error?.context && typeof error.context.text === 'function') {
      try {
        const text = await error.context.text();
        if (text) return JSON.parse(text);
      } catch {
        // Not JSON text
      }
    }

    // Approach 3: Some Supabase versions put the body in error.message
    if (error?.message) {
      try {
        return JSON.parse(error.message);
      } catch {
        // error.message is not JSON (e.g., "Edge Function returned a non-2xx status code")
      }
    }

    // Approach 4: Check if error itself has structured data properties
    if (error?.already_claimed !== undefined || error?.error !== undefined) {
      return error;
    }
  } catch (outerErr) {
    console.warn('[PassCards] extractErrorBody outer catch:', outerErr);
  }
  return null;
}

// ─── Helper: Invoke extend-pass with retry logic ───
async function invokeExtendPassWithRetry(
  userId: string,
  shareProof: string,
  platform: string,
  accessToken: string,
  maxRetries = 1
): Promise<{ data: any; error: any; errorBody: any; statusCode: number | null }> {
  let lastError: any = null;
  let lastErrorBody: any = null;
  let lastStatusCode: number | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1s, 2s
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
      console.log(`[PassCards] Retry ${attempt}/${maxRetries} for extend-pass (waiting ${delay}ms)...`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      // FIXED: No custom Authorization header — let the SDK handle it automatically

      const { data, error } = await supabase.functions.invoke('extend-pass', {
        body: {
          user_id: userId,
          share_proof: shareProof,
          platform: platform,
        },
        // NO custom headers — SDK sends its own Authorization automatically
      });


      if (!error) {
        return { data, error: null, errorBody: null, statusCode: 200 };
      }

      // Extract HTTP status code from the error's Response context
      const httpStatus = extractStatusCode(error);
      const errorBody = await extractErrorBody(error);
      lastError = error;
      lastErrorBody = errorBody;
      lastStatusCode = httpStatus;

      console.warn(`[PassCards] extend-pass attempt ${attempt} failed:`, {
        httpStatus,
        errorName: error.name,
        errorMessage: error.message,
        errorBody,
      });

      // Determine if this is a retryable error using the actual HTTP status code
      const isNetworkError = error.name === 'FunctionsFetchError' || 
                             error.message?.includes('Failed to send') ||
                             error.message?.includes('NetworkError') ||
                             error.message?.includes('fetch');
      
      // Client errors (4xx) should NOT be retried
      const isClientError = (httpStatus !== null && httpStatus >= 400 && httpStatus < 500) ||
                            errorBody?.already_claimed;

      if (isClientError) {
        return { data: null, error, errorBody, statusCode: httpStatus || (errorBody?.already_claimed ? 409 : 400) };
      }

      // Server errors (5xx) — retry if we have attempts left
      if (httpStatus !== null && httpStatus >= 500 && attempt < maxRetries) {
        continue;
      }

      // Network errors — always retry if we have attempts left
      if (isNetworkError && attempt < maxRetries) {
        continue;
      }

      // Last attempt or unknown error — return what we have
      if (attempt >= maxRetries) {
        return { data: null, error, errorBody, statusCode: httpStatus || 500 };
      }
    } catch (thrown: any) {
      lastError = thrown;
      console.warn(`[PassCards] extend-pass attempt ${attempt} threw:`, thrown.message);
      // Always retry on thrown exceptions (network failures) if we have attempts left
      if (attempt >= maxRetries) {
        return { data: null, error: thrown, errorBody: null, statusCode: null };
      }
    }
  }

  return { data: null, error: lastError, errorBody: lastErrorBody, statusCode: lastStatusCode };
}

function getShareAppUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'https://www.stikmnek.com';
}

type ShareLang = 'en' | 'fr' | 'bi';

/** Rich share / email body: value prop, Share Bonus explanation, pass-specific perk, and app URL (many clients only show `url` unless `text` is self-contained). */
function buildPassShareContent(pass: PassConfig, language: ShareLang): { title: string; text: string; url: string; mailSubject: string } {
  const url = getShareAppUrl();
  const name = language === 'fr' ? pass.nameFr : language === 'bi' ? pass.nameBi : pass.name;
  const bonusDesc =
    language === 'fr'
      ? pass.shareBonus.descriptionFr
      : language === 'bi'
        ? pass.shareBonus.descriptionBi
        : pass.shareBonus.description;

  if (language === 'fr') {
    const text =
      `Découvrez StikmNek — votre guide des réductions et bons plans au Vanuatu ! Restaurants, activités, commerces : avantages exclusifs pour les détenteurs de pass.\n\n` +
      `Bonus de partage : partagez l'application avec vos proches pour débloquer GRATUITEMENT des places supplémentaires sur votre pass groupe et/ou un jour de réductions en plus. ` +
      `Avec le ${name} : ${bonusDesc}\n\n` +
      `Ouvrir StikmNek : ${url}`;
    return {
      title: 'StikmNek — réductions au Vanuatu',
      text,
      url,
      mailSubject: 'StikmNek — promos au Vanuatu + bonus de partage gratuit',
    };
  }

  if (language === 'bi') {
    const text =
      `Lukim StikmNek — gaid blong diskaun mo gudfala prais long Vanuatu! Res, aktiviti, bisnis lokal: yu save kasem spesel save wetem pas.\n\n` +
      `Bonus blong serem: serem app wetem ol pren blong yu blong anlokem fri moa man long grup pas mo o wan ekstra dei blong diskaun. ` +
      `Long ${name}: ${bonusDesc}\n\n` +
      `Op StikmNek: ${url}`;
    return {
      title: 'StikmNek — diskaun long Vanuatu',
      text,
      url,
      mailSubject: 'StikmNek — prais long Vanuatu + fri bonus taem yu serem',
    };
  }

  const text =
    `Check out StikmNek — your guide to discounts and deals across Vanuatu! Restaurants, activities, and local businesses offer exclusive savings for pass holders.\n\n` +
    `Share Bonus: share the app with friends to unlock FREE extra people on your group pass and/or an extra day of discounts — at no extra cost. ` +
    `For the ${name}: ${bonusDesc}\n\n` +
    `Get the app: ${url}`;

  return {
    title: 'StikmNek — discounts in Vanuatu',
    text,
    url,
    mailSubject: 'StikmNek — Vanuatu deals + free Share Bonus',
  };
}


// ─── Main PassCards Component ───
const PassCards: React.FC<PassCardsProps> = ({ embeddedOnHome = false }) => {
  const navigate = useNavigate();
  const { language, purchasePass, user, userProfile, refreshUserPass, refreshUserProfile, setCurrentView } = useAppContext();

  const { activePasses } = usePassConfig();
  useEffect(() => {
    if (user?.id && !userProfile) {
      refreshUserProfile();
    }
  }, [user?.id, userProfile, refreshUserProfile]);
  const tripGuidance = useMemo(() => {
    if (!userProfile) return null;
    return getPassTripGuidance(userProfile);
  }, [userProfile]);

  /** Cart defaults when opening checkout (registration + saved prefs + trip dates). */
  const checkoutPreview = useMemo(() => {
    if (!user?.id || !userProfile) return null;
    return defaultPassCartFromProfile(userProfile, null);
  }, [user?.id, userProfile]);

  const passI18nLang: 'en' | 'fr' | 'bi' = language === 'fr' ? 'fr' : language === 'bi' ? 'bi' : 'en';

  const [sharedPasses, setSharedPasses] = useState<Set<string>>(
    () => {
      try {
        const stored = localStorage.getItem('stikmnek-shared-passes');
        return stored ? new Set(JSON.parse(stored)) : new Set();
      } catch { return new Set(); }
    }
  );
  const [sharingPassId, setSharingPassId] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{
    show: boolean;
    passName: string;
    bonusDays: number;
    bonusPeople: number;
    bonusKids: number;
  }>({ show: false, passName: '', bonusDays: 0, bonusPeople: 0, bonusKids: 0 });

  const handleShare = async (pass: PassConfig) => {
    const shareLang: ShareLang = language === 'fr' ? 'fr' : language === 'bi' ? 'bi' : 'en';
    const payload = buildPassShareContent(pass, shareLang);
    const shareData = { title: payload.title, text: payload.text, url: payload.url };

    setSharingPassId(pass.id);
    // Track whether we triggered a celebration in this invocation
    let celebrationTriggered = false;
    // Track whether the bonus was actually claimed on the backend (avoid false “unlocked” states)
    let bonusClaimed = false;

    try {
      // ═══ STEP 1: Share the app via Web Share API or clipboard ═══
      let shareSucceeded = false;
      let platform = 'clipboard';
      
      if (navigator.share) {
        try {
          await navigator.share(shareData);
          shareSucceeded = true;
          platform = 'native-share';
        } catch (err: any) {
          if (err.name === 'AbortError') {
            // User cancelled the share dialog
            setSharingPassId(null);
            return;
          }
          // Fallback to clipboard
          try {
            await navigator.clipboard.writeText(shareData.text);
            shareSucceeded = true;
            platform = 'clipboard';
            toast.success(
              language === 'en' ? 'Link copied to clipboard!' :
              language === 'fr' ? 'Lien copié dans le presse-papiers !' :
              'Link i kopi!'
            );
          } catch (clipErr) {
            console.error('[PassCards] Clipboard fallback failed:', clipErr);
            toast.error(
              language === 'en' ? 'Could not share. Please try again.' :
              language === 'fr' ? 'Impossible de partager. Veuillez réessayer.' :
              'No save serem. Plis traem agen.'
            );
            setSharingPassId(null);
            return;
          }
        }
      } else {
        // No Web Share API — use clipboard
        try {
          await navigator.clipboard.writeText(shareData.text);
          shareSucceeded = true;
          platform = 'clipboard';
          toast.success(
            language === 'en' ? 'Link copied! Share it to unlock your bonus.' :
            language === 'fr' ? 'Lien copié ! Partagez-le pour débloquer votre bonus.' :
            'Link i kopi! Serem blong anlokem bonus blong yu.'
          );
        } catch (clipErr) {
          console.error('[PassCards] Clipboard write failed:', clipErr);
          toast.error(
            language === 'en' ? 'Could not copy link. Please try again.' :
            language === 'fr' ? 'Impossible de copier le lien. Veuillez réessayer.' :
            'No save kopi link. Plis traem agen.'
          );
          setSharingPassId(null);
          return;
        }
      }

      if (!shareSucceeded) {
        setSharingPassId(null);
        return;
      }

      // ═══ STEP 2: Call extend-pass edge function ═══
      // Backend supports both:
      // - Active pass → applies bonus to that pass
      // - No pass yet → records pre-purchase share bonus unlock in user_profiles
      if (user?.id) {
        const accessToken = await ensureFreshSession();

        
        if (!accessToken) {
          // Auth token expired and couldn't refresh
          console.warn('[PassCards] Could not get valid access token for extend-pass');
          toast.warning(
            language === 'en' ? 'Shared successfully! Sign in again to claim your bonus days.' :
            language === 'fr' ? 'Partagé avec succès ! Reconnectez-vous pour réclamer vos jours bonus.' :
            'Serem i saksesful! Saen in agen blong klemem bonus dei blong yu.',
            { duration: 5000 }
          );
        } else {
          const shareProof = `share_${Date.now()}_${platform}_${pass.type}`;
          
          const { data, error, errorBody, statusCode } = await invokeExtendPassWithRetry(
            user.id,
            shareProof,
            platform,
            accessToken,
            1 // 1 retry
          );

          if (data?.success) {
            // ═══ SUCCESS: Pass extended OR pre-purchase unlock recorded ═══
            console.log('[PassCards] extend-pass success:', data);
            bonusClaimed = true;

            if (data?.prepurchase) {
              toast.success(
                language === 'en'
                  ? 'Share Bonus unlocked! It will be applied automatically when you purchase your pass.'
                  : language === 'fr'
                    ? 'Bonus de partage débloqué ! Il sera appliqué automatiquement quand vous achèterez votre pass.'
                    : 'Bonus blong serem i anlokem! Bae i go insaed otomatik taem yu baem pas.',
                { duration: 6000 }
              );
              try { await refreshUserProfile(); } catch {}
              // No celebration (no pass to extend). Stop here.
              setSharingPassId(null);
              return;
            }
            
            const passName = language === 'fr' ? pass.nameFr : language === 'bi' ? pass.nameBi : pass.name;
            const bonusDays = data.bonus?.days ?? pass.shareBonus.extraDays;
            const bonusPeople = data.bonus?.people ?? pass.shareBonus.extraPeople;
            const bonusKids = data.bonus?.kids ?? pass.shareBonus.extraKids;

            setCelebration({
              show: true,
              passName,
              bonusDays,
              bonusPeople,
              bonusKids,
            });
            celebrationTriggered = true;

            // ═══ REFRESH PASS DATA: Reload pass from DB to update validity dates in UI ═══
            // Add a small delay to ensure the DB has fully committed the extend-pass changes
            try {
              console.log('[PassCards] Waiting 1s for DB commit before refreshing pass data...');
              await new Promise(resolve => setTimeout(resolve, 1000));
              console.log('[PassCards] Refreshing user pass data after successful share extension...');
              await refreshUserPass();
              await refreshUserProfile();
              console.log('[PassCards] Pass data refreshed successfully — validity dates updated');
            } catch (refreshErr) {
              console.warn('[PassCards] Failed to refresh pass data, will retry on celebration close:', refreshErr);
            }


            // Also show a toast for accessibility
            const bonusParts: string[] = [];
            if (bonusDays > 0) bonusParts.push(`+${bonusDays} ${language === 'en' ? 'day' : language === 'fr' ? 'jour' : 'dei'}`);
            if (bonusPeople > 0) bonusParts.push(`+${bonusPeople} ${language === 'en' ? 'people' : language === 'fr' ? 'personnes' : 'man'}`);
            if (bonusKids > 0) bonusParts.push(`+${bonusKids} ${language === 'en' ? 'kids' : language === 'fr' ? 'enfants' : 'pikinini'}`);
            
            toast.success(
              language === 'en' ? `Bonus unlocked: ${bonusParts.join(', ')}!` :
              language === 'fr' ? `Bonus débloqué : ${bonusParts.join(', ')} !` :
              `Bonus i anlokem: ${bonusParts.join(', ')}!`,
              { duration: 5000 }
            );



          } else if (errorBody?.already_claimed || data?.already_claimed) {
            // ═══ ALREADY CLAIMED: Share bonus was already used for this pass ═══
            console.log('[PassCards] Share bonus already claimed:', errorBody || data);
            bonusClaimed = true;
            toast.info(
              language === 'en' ? 'You\'ve already claimed your share bonus for this pass! Thanks for sharing again.' :
              language === 'fr' ? 'Vous avez déjà réclamé votre bonus de partage pour ce pass ! Merci de partager à nouveau.' :
              'Yu klemem bonus blong serem finis blong pas ia! Tangkiu blong serem agen.',
              { duration: 5000 }
            );

          } else if (statusCode === 401 || errorBody?.error?.includes?.('Session expired') || errorBody?.error?.includes?.('Not authenticated')) {
            // ═══ AUTH ERROR: Session expired ═══
            console.warn('[PassCards] Auth error on extend-pass:', errorBody?.error || error?.message);
            toast.warning(
              language === 'en' ? 'Shared successfully! Please sign in again to claim your bonus.' :
              language === 'fr' ? 'Partagé avec succès ! Reconnectez-vous pour réclamer votre bonus.' :
              'Serem i saksesful! Plis saen in agen blong klemem bonus blong yu.',
              { duration: 5000 }
            );

          } else if (statusCode === 404 || errorBody?.error?.includes?.('No active pass')) {
            // ═══ NO ACTIVE PASS: User's pass may have expired ═══
            console.warn('[PassCards] No active pass found:', errorBody?.error);
            toast.warning(
              language === 'en' ? 'Thanks for sharing! Your pass may have expired. Purchase a new pass to earn bonuses.' :
              language === 'fr' ? 'Merci d\'avoir partagé ! Votre pass a peut-être expiré. Achetez un nouveau pass pour gagner des bonus.' :
              'Tangkiu blong serem! Pas blong yu i ded finis. Baem niufala pas blong kasem bonus.',
              { duration: 5000 }
            );

          } else if (statusCode === 429 || errorBody?.error?.includes?.('Too many requests')) {
            // ═══ RATE LIMITED ═══
            const retryAfter = errorBody?.retryAfter || 60;
            console.warn('[PassCards] Rate limited:', errorBody);
            toast.error(
              language === 'en' ? `Too many attempts. Please try again in ${retryAfter} seconds.` :
              language === 'fr' ? `Trop de tentatives. Réessayez dans ${retryAfter} secondes.` :
              `Tumas traem. Plis traem agen long ${retryAfter} sekon.`,
              { duration: 6000 }
            );

          } else {
            // ═══ GENERIC SERVER ERROR ═══
            const errorMsg = errorBody?.error || error?.message || 'Unknown error';
            console.error('[PassCards] extend-pass failed:', errorMsg, { error, errorBody, statusCode });
            toast.error(
              language === 'en' ? 'Shared successfully, but couldn\'t apply your bonus. Please try sharing again later.' :
              language === 'fr' ? 'Partagé avec succès, mais impossible d\'appliquer votre bonus. Veuillez réessayer plus tard.' :
              'Serem i saksesful, be no save aplae bonus blong yu. Plis traem serem agen biaen.',
              {
                duration: 6000,
                action: {
                  label: language === 'en' ? 'Retry' : language === 'fr' ? 'Réessayer' : 'Traem agen',
                  onClick: () => handleShare(pass),
                },
              }
            );
          }
        }
      }

      // ═══ STEP 3: Mark locally only if the backend bonus was claimed ═══
      // Avoid showing “Bonus Unlocked” purely from a share action that did not persist to DB.
      if (bonusClaimed) {
        const newShared = new Set(sharedPasses);
        newShared.add(pass.id);
        setSharedPasses(newShared);
        try { localStorage.setItem('stikmnek-shared-passes', JSON.stringify([...newShared])); } catch {}
      }

      // ═══ STEP 4: Show basic success if no celebration was triggered and user has no active pass ═══
      if (!celebrationTriggered && !(user?.pass && user?.passId)) {
        toast.success(
          language === 'en' ? 'Thanks for sharing! Your Share Bonus will apply automatically when you purchase a pass.' :
          language === 'fr' ? 'Merci d\'avoir partagé ! Votre bonus sera appliqué automatiquement quand vous achèterez un pass.' :
          'Tangkiu blong serem! Bonus bae i go insaed otomatik taem yu baem pas.',
          { duration: 5000 }
        );
      }
    } catch (err: any) {
      console.error('[PassCards] Share error:', err);
      if (err.name !== 'AbortError') {
        toast.error(
          language === 'en' ? 'Something went wrong. Please try again.' :
          language === 'fr' ? 'Une erreur est survenue. Veuillez réessayer.' :
          'Wan samting i rong. Plis traem agen.',
          { duration: 4000 }
        );
      }
    } finally {
      setSharingPassId(null);
    }
  };

  const isShared = (passId: string) => sharedPasses.has(passId);

  const closeCelebration = useCallback(async () => {
    setCelebration(prev => ({ ...prev, show: false }));
    // Refresh pass data one more time when user closes celebration to ensure latest validity dates
    try {
      await refreshUserPass();
    } catch {}
    // Navigate back to deals view so user returns to the app after sharing
    setCurrentView('deals');
  }, [setCurrentView, refreshUserPass]);

  if (embeddedOnHome && shouldOpenCheckoutInsteadOfPassesPage(user)) {
    return (
      <section className="py-14 bg-gradient-to-b from-white to-teal-50/40" id="passes">
        <div className="max-w-lg mx-auto px-4 text-center">
          <h2 className="text-2xl font-black text-gray-900 mb-2">{t('passFlow.home_skip_title', language)}</h2>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{t('passFlow.home_skip_desc', language)}</p>
          <button
            type="button"
            onClick={() => void purchasePass()}
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold text-sm hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200"
          >
            {t('passFlow.home_skip_cta', language)}
          </button>
          <div className="mt-5">
            <button
              type="button"
              onClick={() => navigate('/passes?info=1')}
              className="text-sm text-teal-700 font-semibold hover:underline"
            >
              {t('passFlow.home_passes_info_link', language)}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* Celebration Overlay */}
      <CelebrationOverlay
        show={celebration.show}
        passName={celebration.passName}
        bonusDays={celebration.bonusDays}
        bonusPeople={celebration.bonusPeople}
        bonusKids={celebration.bonusKids}
        language={language}
        onClose={closeCelebration}
      />

      {/* Custom animation styles */}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
          50% { opacity: 1; }
          100% { transform: translateY(400px) rotate(720deg) scale(0.3); opacity: 0; }
        }
        @keyframes celebration-pop {
          0% { transform: scale(0.3) rotate(-5deg); opacity: 0; }
          50% { transform: scale(1.05) rotate(1deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes badge-pop {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes sparkle-1 {
          0%, 100% { transform: scale(0.8) rotate(0deg); opacity: 0.5; }
          50% { transform: scale(1.2) rotate(180deg); opacity: 1; }
        }
        @keyframes sparkle-2 {
          0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.3; }
          50% { transform: scale(0.6) rotate(-180deg); opacity: 1; }
        }
        @keyframes sparkle-3 {
          0%, 100% { transform: scale(0.6) rotate(0deg); opacity: 0.6; }
          50% { transform: scale(1.3) rotate(90deg); opacity: 1; }
        }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes card-glow {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
          50% { box-shadow: 0 0 20px 4px rgba(16, 185, 129, 0.3); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        .animate-confetti-fall { animation: confetti-fall 2.5s ease-out forwards; }
        .animate-celebration-pop { animation: celebration-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        .animate-badge-pop { animation: badge-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; opacity: 0; }
        .animate-sparkle-1 { animation: sparkle-1 2s ease-in-out infinite; }
        .animate-sparkle-2 { animation: sparkle-2 2.5s ease-in-out infinite; }
        .animate-sparkle-3 { animation: sparkle-3 1.8s ease-in-out infinite; }
        .animate-bounce-slow { animation: bounce-slow 2s ease-in-out infinite; }
        .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
        .animate-card-glow { animation: card-glow 1.5s ease-out; }
      `}</style>

      <section className="py-20 bg-gradient-to-b from-white to-teal-50/30" id="passes">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-50 border border-teal-100 text-teal-700 text-sm font-semibold mb-4">
              <Users className="w-4 h-4" />
              {language === 'en' ? 'Tourist Pass' : language === 'fr' ? 'Pass touriste' : 'Turis Pas'}
            </div>
            <div className="text-center mb-6">
              <h2 className="text-2xl md:text-3xl font-black text-gray-900">
                {t('passSelection.title', language)}
              </h2>
              <p className="text-sm text-gray-600 mt-2 max-w-lg mx-auto leading-relaxed">
                {t('passSelection.subtitle', language)}
              </p>
            </div>
          </div>

          {tripGuidance && (
            <div className="max-w-5xl mx-auto mb-10">
              <div className="rounded-2xl border border-teal-100 bg-white shadow-sm ring-1 ring-teal-50 p-5 sm:p-6">
                <h3 className="text-sm font-bold text-teal-800 tracking-wide uppercase mb-3">
                  {t('pass.know_before_title', language)}
                </h3>
                <p className="text-sm text-gray-600 mb-4 leading-snug">
                  {t('pass.know_trip_line', language)
                    .replace('{days}', String(tripGuidance.tripDays))
                    .replace('{party}', String(tripGuidance.partyCountExInfants))}
                </p>
                <ul className="space-y-3">
                  {KNOW_BEFORE_KEYS.map((key, i) => {
                    const Icon = KNOW_BEFORE_ICONS[i] ?? Info;
                    return (
                      <li key={key} className="flex gap-3 text-sm text-gray-800 leading-snug">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                          <Icon className="w-4 h-4" aria-hidden />
                        </span>
                        <span className="pt-1">{t(key, language)}</span>
                      </li>
                    );
                  })}
                </ul>
                {tripGuidance.showSupportHint && (
                  <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50/80 px-3.5 py-2.5 text-sm text-amber-950 leading-snug">
                    {t('pass.know_support', language)}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="max-w-xl mx-auto mb-10">
            <DealsPricingCard language={passI18nLang} />
          </div>

          <div className="grid grid-cols-1 gap-8 max-w-lg mx-auto">
            {(activePasses[0] ? [activePasses[0]] : []).map((pass) => {
              const passName = language === 'fr' ? pass.nameFr : language === 'bi' ? pass.nameBi : pass.name;
              const passPeriod = language === 'fr' ? pass.periodFr : language === 'bi' ? pass.periodBi : pass.period;
              const color = `from-${pass.colorFrom} to-${pass.colorTo}`;
              const shadow = `shadow-${pass.shadowColor}`;
              const isCurrentUserPass = Boolean(user?.passId);
              const shared = isCurrentUserPass ? Boolean(user?.shareBonusApplied) : isShared(pass.id);
              const isSharing = sharingPassId === pass.id;
              const bonus = pass.shareBonus;
              const shareLang: ShareLang = language === 'fr' ? 'fr' : language === 'bi' ? 'bi' : 'en';
              const shareContent = buildPassShareContent(pass, shareLang);
              const hasBonusDays = bonus.extraDays > 0;
              const hasBonusPeople = bonus.extraPeople > 0 || bonus.extraKids > 0;
              const hasBonus = hasBonusDays || hasBonusPeople;
              const isRecommended = false;
              const arrival = String(userProfile?.expected_arrival_date ?? '').slice(0, 10);
              const departure = String(userProfile?.expected_departure_date ?? '').slice(0, 10);
              const stayMismatchMsg =
                arrival && departure
                  ? buildPassStayMismatchMessage(
                      arrival,
                      departure,
                      pass.baseDays,
                      pass.fullDays,
                      pass.shareBonus.extraDays,
                      passI18nLang,
                    )
                  : null;
              // Calculate group display
              const groupLabel = pass.totalPeople
                ? (language === 'en' ? `${pass.totalPeople} people` : language === 'fr' ? `${pass.totalPeople} personnes` : `${pass.totalPeople} man`)
                : (language === 'en' ? `${pass.adults} adults & ${pass.kids} kids` : language === 'fr' ? `${pass.adults} adultes et ${pass.kids} enfants` : `${pass.adults} bigman mo ${pass.kids} pikinini`);

              const daysLabel = shared && hasBonusDays
                ? `${pass.fullDays} ${language === 'en' ? 'days' : language === 'fr' ? 'jours' : 'dei'}`
                : `${pass.baseDays} ${language === 'en' ? (pass.baseDays === 1 ? 'day' : 'days') : language === 'fr' ? (pass.baseDays === 1 ? 'jour' : 'jours') : 'dei'}`;

              // Calculate people after share bonus
              const bonusPeopleLabel = shared && hasBonusPeople
                ? (() => {
                    if (bonus.extraPeople > 0 && pass.totalPeople) {
                      return language === 'en' ? `${pass.totalPeople + bonus.extraPeople} people` : language === 'fr' ? `${pass.totalPeople + bonus.extraPeople} personnes` : `${pass.totalPeople + bonus.extraPeople} man`;
                    }
                    if (bonus.extraPeople > 0) {
                      return language === 'en' ? `${pass.adults} adults, ${pass.kids} kids + ${bonus.extraPeople} more` : language === 'fr' ? `${pass.adults} adultes, ${pass.kids} enfants + ${bonus.extraPeople} de plus` : `${pass.adults} bigman, ${pass.kids} pikinini + ${bonus.extraPeople} moa`;
                    }
                    if (bonus.extraKids > 0) {
                      return language === 'en' ? `${pass.adults} adults & ${pass.kids + bonus.extraKids} kids` : language === 'fr' ? `${pass.adults} adultes et ${pass.kids + bonus.extraKids} enfants` : `${pass.adults} bigman mo ${pass.kids + bonus.extraKids} pikinini`;
                    }
                    return groupLabel;
                  })()
                : null;

              return (
                <div
                  key={pass.id}
                  className={`relative bg-white rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-2 ${
                    shared ? 'animate-card-glow' : ''
                  } ${
                    isRecommended
                      ? `ring-2 ring-indigo-500 shadow-xl shadow-indigo-200/40 ${shadow}`
                      : 'border border-gray-200 shadow-sm hover:shadow-lg'
                  }`}
                >
                  {isRecommended && (
                    <div className="absolute top-3 right-3 z-10">
                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-600 text-white text-[11px] font-extrabold shadow-lg">
                        {language === 'en' ? 'Recommended' : language === 'fr' ? 'Recommandé' : 'Rekomendem'}
                      </span>
                    </div>
                  )}

                  <div className="p-8">
                    {/* Icon */}
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center text-white mb-5 shadow-lg ${shadow}`}>
                      {getIconComponent(pass.icon)}
                    </div>

                    <h3 className="text-xl font-bold text-gray-900 mb-1">{passName}</h3>

                    {/* Group Info Badge */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        shared && hasBonusPeople
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        <Users className="w-3.5 h-3.5" />
                        {bonusPeopleLabel || groupLabel}
                        {shared && hasBonusPeople && <Sparkles className="w-3 h-3 text-emerald-500" />}
                      </div>
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        shared && hasBonusDays
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        <Calendar className="w-3.5 h-3.5" />
                        {daysLabel}
                        {shared && hasBonusDays && <Sparkles className="w-3 h-3 text-emerald-500" />}
                      </div>
                    </div>

                    {stayMismatchMsg && (
                      <div className="mb-4 flex gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-left">
                        <Info className="w-4 h-4 shrink-0 text-slate-500 mt-0.5" aria-hidden />
                        <p className="text-xs text-slate-700 leading-snug">{stayMismatchMsg}</p>
                      </div>
                    )}

                    {pass.type === 'dynamic' ? (
                      <div className="text-center mb-3">
                        <p className="text-lg font-bold text-gray-900">
                          {language === 'fr' ? `À partir de ${BASE_PRICE_AUD} $ AUD` : `From A$${BASE_PRICE_AUD}`}
                          <span className="text-sm font-normal text-gray-600 ml-0 sm:ml-2 block sm:inline mt-1 sm:mt-0">
                            {language === 'fr'
                              ? `Jusqu'à ${MAX_PARTY_SIZE} personnes (6 ans et +)`
                              : language === 'bi'
                                ? `Antap long ${MAX_PARTY_SIZE} man (6+)`
                                : `Up to ${MAX_PARTY_SIZE} people (ages 6+)`}
                          </span>
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1 mb-3">
                        <span className="text-4xl font-extrabold text-gray-900">${pass.price}</span>
                        <span className="text-gray-400 text-sm">{passPeriod}</span>
                      </div>
                    )}

                    {/* Share Bonus Badge - prominent callout */}
                    {hasBonus && !shared && (
                      <div className="mb-5 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200">
                        <Gift className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span className="text-sm font-bold text-amber-800">
                          {bonus.extraPeople > 0 && bonus.extraDays > 0
                            ? (language === 'en' ? `Share to get +${bonus.extraPeople} people FREE & +${bonus.extraDays} day!` : language === 'fr' ? `Partagez pour +${bonus.extraPeople} personnes gratuites et +${bonus.extraDays} jour !` : `Serem blong kasem +${bonus.extraPeople} man fri mo +${bonus.extraDays} dei!`)
                            : bonus.extraPeople > 0
                              ? (language === 'en' ? `Share to get +${bonus.extraPeople} people FREE!` : language === 'fr' ? `Partagez pour +${bonus.extraPeople} personnes gratuites !` : `Serem blong kasem +${bonus.extraPeople} man fri!`)
                              : (language === 'en' ? `Share to get +${bonus.extraDays} free day!` : language === 'fr' ? `Partagez pour +${bonus.extraDays} jour gratuit !` : `Serem blong kasem +${bonus.extraDays} fri dei!`)}
                        </span>
                      </div>
                    )}

                    <ul className="space-y-3 mb-5">
                      {pass.features.map((feature) => {
                        const featureText = language === 'fr' ? feature.textFr : language === 'bi' ? feature.textBi : feature.text;
                        const isShareFeature = feature.text.toLowerCase().includes('share');
                        return (
                          <li key={feature.id} className={`flex items-center gap-3 text-sm ${isShareFeature ? 'text-teal-700 font-medium' : 'text-gray-600'}`}>
                            <div className={`w-5 h-5 rounded-full ${isShareFeature ? 'bg-gradient-to-br from-teal-400 to-emerald-500' : `bg-gradient-to-br ${color}`} flex items-center justify-center flex-shrink-0`}>
                              {isShareFeature ? <Gift className="w-3 h-3 text-white" strokeWidth={3} /> : <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                            </div>
                            {featureText}
                          </li>
                        );
                      })}
                    </ul>

                    {/* Share Bonus Section */}
                    {hasBonus && (
                      <div className={`mb-5 p-3.5 rounded-xl border transition-all duration-500 ${
                        shared
                          ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200'
                          : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200'
                      }`}>
                        <div className="flex items-start gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                            shared ? 'bg-emerald-500' : 'bg-gradient-to-br from-amber-400 to-orange-500'
                          }`}>
                            {shared ? <Check className="w-4 h-4 text-white" strokeWidth={3} /> : <Share2 className="w-4 h-4 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-bold uppercase tracking-wider mb-1 transition-colors duration-500 ${shared ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {shared
                                ? (language === 'en' ? 'Bonus Unlocked!' : language === 'fr' ? 'Bonus Débloqué !' : 'Bonus i Anlokem!')
                                : (language === 'en' ? 'Share to Unlock' : language === 'fr' ? 'Partagez pour Débloquer' : 'Serem blong Anlokem')}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {hasBonusDays && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors duration-500 ${
                                  shared ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  <Calendar className="w-3 h-3" />
                                  +{bonus.extraDays} {language === 'en' ? 'free day' : language === 'fr' ? 'jour gratuit' : 'fri dei'}
                                </span>
                              )}
                              {bonus.extraPeople > 0 && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors duration-500 ${
                                  shared ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  <Users className="w-3 h-3" />
                                  +{bonus.extraPeople} {language === 'en' ? 'people' : language === 'fr' ? 'personnes' : 'man'}
                                </span>
                              )}
                              {bonus.extraKids > 0 && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors duration-500 ${
                                  shared ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  <Baby className="w-3 h-3" />
                                  +{bonus.extraKids} {language === 'en' ? 'kids' : language === 'fr' ? 'enfants' : 'pikinini'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {!shared && (
                          <button
                            onClick={() => handleShare(pass)}
                            disabled={isSharing}
                            className="mt-2.5 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                          >
                            {isSharing ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                {language === 'en' ? 'Sharing...' : language === 'fr' ? 'Partage...' : 'Serem...'}
                              </>
                            ) : (
                              <>
                                <Share2 className="w-3.5 h-3.5" />
                                {language === 'en' ? 'Share App Now' : language === 'fr' ? 'Partager Maintenant' : 'Serem Nao'}
                              </>
                            )}
                          </button>
                        )}
                        {!shared && (
                          <a
                            className="mt-2 w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg bg-white/70 border border-amber-200 text-amber-800 text-xs font-bold hover:bg-white transition-colors"
                            href={`mailto:?subject=${encodeURIComponent(shareContent.mailSubject)}&body=${encodeURIComponent(shareContent.text.replace(/\n/g, '\r\n'))}`}
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            {language === 'fr' ? 'Partager par e-mail' : language === 'bi' ? 'Serem long imel' : 'Share via email'}
                          </a>
                        )}
                      </div>
                    )}

                    {checkoutPreview && (checkoutPreview.partySize > 1 || checkoutPreview.isExtended) && (
                      <p className="text-xs text-teal-800 bg-teal-50/90 border border-teal-100 rounded-xl px-3 py-2.5 mb-3 leading-snug">
                        {t('passFlow.checkout_preview', language)
                          .replace('{party}', String(checkoutPreview.partySize))
                          .replace(
                            '{duration}',
                            checkoutPreview.isExtended
                              ? t('passFlow.duration_extended', language)
                              : t('passFlow.duration_short', language),
                          )}
                      </p>
                    )}

                    <button
                      onClick={() => purchasePass()}
                      className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                        isCurrentUserPass
                          ? 'bg-green-50 text-green-700 border border-green-200 cursor-default'
                          : isRecommended
                            ? `bg-gradient-to-r ${color} text-white hover:opacity-90 shadow-lg ${shadow}`
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {user?.pass === pass.type ? (
                        <>
                          <Check className="w-4 h-4" />
                          {language === 'en' ? 'Active' : language === 'fr' ? 'Actif' : 'Aktiv'}
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4" />
                          {language === 'en' ? 'Purchase Pass' : language === 'fr' ? 'Acheter un pass' : 'Baem Pas'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Payment Methods & Security */}
          <div className="mt-12 text-center">
            <p className="text-sm text-gray-400 mb-4">
              {language === 'en' ? 'Secure payment powered by' : language === 'fr' ? 'Paiement sécurisé par' : 'Sekua pemen blong'}
            </p>
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl border border-gray-200 shadow-sm">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#003087]" fill="currentColor">
                  <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797H9.603c-.564 0-1.04.408-1.13.964L7.076 21.337z"/>
                </svg>
                <span className="text-sm font-bold text-[#003087]">PayPal</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl border border-gray-200 shadow-sm">
                <CreditCard className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-bold text-gray-600">Credit Card</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-6">
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <div className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] font-bold text-gray-500">VISA</div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <div className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] font-bold text-gray-500">Mastercard</div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <div className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] font-bold text-gray-500">AMEX</div>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400">
                <div className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] font-bold text-gray-500">Apple Pay</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 mt-4">
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Lock className="w-3 h-3" />
                <span>256-bit SSL</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <ShieldCheck className="w-3 h-3" />
                <span>PCI DSS Compliant</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default PassCards;
