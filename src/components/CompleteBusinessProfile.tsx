import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Store, Loader2, AlertCircle, X, ArrowRight, ArrowLeft, Check,
  Utensils, Waves, Compass, Car, ShoppingBag, Heart, Home, MessageCircle, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { categories, type Category } from '@/data/businesses';
import PhotoUploader, { type UploadedPhoto } from '@/components/PhotoUploader';
import LocationMapPicker from '@/components/LocationMapPicker';
import { parseLatLngFromMapUrl } from '@/lib/urlHelpers';
import { validateBusinessProfileOnboarding } from '@/lib/businessOnboardingValidation';
import { checkBusinessOwnerNeedsFirstListing } from '@/lib/businessOwnerListingStatus';
import BusinessCredentialsSettings from '@/components/BusinessCredentialsSettings';
import WizardLanguageToggle from '@/components/WizardLanguageToggle';

/** Maps `validateBusinessProfileOnboarding` error keys → local `errors` state keys used by this form. */
const PROFILE_VALIDATION_KEY_TO_FORM: Record<string, string> = {
  businessName: 'businessName',
  ownerName: 'ownerName',
  email: 'businessEmail',
  phone: 'businessPhone',
  whatsapp: 'whatsappNumber',
  whatsappOptIn: 'whatsappOptIn',
  address: 'address',
};

const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  utensils: Utensils,
  waves: Waves,
  compass: Compass,
  car: Car,
  'shopping-bag': ShoppingBag,
  heart: Heart,
  home: Home,
};

/** Ordered wizard steps — one simple thing per screen. */
const STEPS = ['name', 'category', 'owner', 'contact', 'whatsapp', 'location', 'logo', 'review'] as const;
type StepId = (typeof STEPS)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const tr = (language: string, en: string, fr: string, bi: string) =>
  language === 'fr' ? fr : language === 'bi' ? bi : en;

/** Shared page chrome. Module-scoped so inputs don't remount (and lose focus) on each render. */
const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-gradient-to-b from-white to-emerald-50/40 pt-20 pb-16">
    <div className="max-w-md mx-auto px-4">
      <div className="bg-white rounded-2xl border border-emerald-100 shadow-lg overflow-hidden">
        {children}
      </div>
    </div>
  </div>
);

const CompleteBusinessProfile: React.FC = () => {
  const {
    user,
    userProfile,
    language,
    setCurrentView,
    refreshUserProfile,
    refreshBusinesses,
    refreshBusinessOwnerRowStatus,
    userProfileLoadError,
    retryUserProfileFetch,
  } = useAppContext();

  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [noWhatsApp, setNoWhatsApp] = useState(false);
  const [whatsappMarketingOptIn, setWhatsappMarketingOptIn] = useState(true);
  const [category, setCategory] = useState<Category>('dining');
  const [address, setAddress] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [logoPhotos, setLogoPhotos] = useState<UploadedPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [step, setStep] = useState(0);
  /** True once the profile is saved — switches the wizard to the success screen. */
  const [savedDone, setSavedDone] = useState(false);
  const [needsFirstListing, setNeedsFirstListing] = useState(true);
  const [showCreds, setShowCreds] = useState(false);
  /** Set after first successful save — unlocks credentials upload + “Continue”. */
  const [savedProfileBusinessId, setSavedProfileBusinessId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data?.id) {
        setSavedProfileBusinessId(String(data.id));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const continueToBusinessHub = () => {
    setCurrentView('business-dashboard');
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('switch-dashboard-tab', { detail: { tab: 'submit' } }));
    }, 150);
  };

  useEffect(() => {
    if (!userProfile && user) {
      setOwnerName((user.name || '').trim());
      setBusinessEmail((user.email || '').trim());
      return;
    }
    if (!userProfile) return;
    setOwnerName(
      (userProfile.full_name || userProfile.name || userProfile.display_name || user?.name || '').trim(),
    );
    setBusinessEmail(
      (userProfile.business_email || userProfile.email || user?.email || '').trim(),
    );
    setBusinessPhone((userProfile.business_phone || userProfile.phone || '').trim());
    setWhatsappNumber((userProfile.whatsapp_number || '').trim());
    setWhatsappMarketingOptIn(Boolean(userProfile.whatsapp_marketing_opt_in));
    setBusinessName((userProfile.business_name || '').trim());
    const cat = userProfile.business_category as Category | undefined;
    if (cat && categories.some((c) => c.key === cat)) setCategory(cat);
    setAddress((userProfile.business_location || '').trim());
  }, [userProfile, user]);

  /**
   * Client-side profile validation (final check).
   * Rules live in `@/lib/businessOnboardingValidation` so listing/dashboard flows stay aligned.
   */
  const runProfileValidation = (): boolean => {
    const { valid, errors: validationErrors } = validateBusinessProfileOnboarding({
      businessName,
      ownerName,
      email: businessEmail,
      phone: businessPhone,
      whatsapp: whatsappNumber,
      whatsappMarketingOptIn,
      requireWhatsAppOptIn: true,
      noWhatsApp,
      address,
    });
    if (valid) {
      setErrors({});
      return true;
    }
    const next: Record<string, string> = {};
    for (const [key, message] of Object.entries(validationErrors)) {
      const formKey = PROFILE_VALIDATION_KEY_TO_FORM[key];
      if (formKey && message) next[formKey] = message;
    }
    setErrors(next);
    return false;
  };

  const handleSubmit = async () => {
    if (!user?.id) return;
    if (!runProfileValidation()) {
      // Jump back to the first step with a problem so they can fix it.
      const firstBad = STEPS.findIndex((s) =>
        s === 'name'
          ? !businessName.trim()
          : s === 'owner'
            ? !ownerName.trim()
            : s === 'contact'
              ? !businessPhone.trim() || !EMAIL_RE.test(businessEmail.trim())
              : s === 'whatsapp'
                ? !noWhatsApp && (!whatsappNumber.trim() || !whatsappMarketingOptIn)
                : s === 'location'
                  ? !address.trim()
                  : false,
      );
      if (firstBad >= 0) setStep(firstBad);
      toast.error(tr(language, 'Please fix the highlighted field.', 'Corrigez le champ indiqué.', 'Fiksem ol erro'));
      return;
    }

    setSubmitting(true);
    const wasUpdate = Boolean(savedProfileBusinessId);
    try {
      const parsed = mapUrl.trim() ? parseLatLngFromMapUrl(mapUrl.trim()) : null;
      const logoUrl = logoPhotos[0]?.url?.trim() || '';
      const rowPayload: Record<string, unknown> = {
        name: businessName.trim(),
        category,
        description: '',
        description_fr: '',
        description_bi: '',
        image: logoUrl,
        logo_url: logoUrl,
        discount: '',
        original_price: 0,
        deal_price: 0,
        location: address.trim(),
        hours: '',
        phone: businessPhone.trim(),
        email: businessEmail.trim(),
        whatsapp_number: noWhatsApp ? null : whatsappNumber.trim() || null,
        tags: [category],
        active: false,
        map_url: mapUrl.trim() || null,
      };
      if (parsed) {
        rowPayload.lat = parsed.lat;
        rowPayload.lng = parsed.lng;
      }

      let businessId = savedProfileBusinessId || '';
      if (wasUpdate && savedProfileBusinessId) {
        const { error: updateErr } = await supabase
          .from('businesses')
          .update(rowPayload as never)
          .eq('id', savedProfileBusinessId)
          .eq('owner_id', user.id);
        if (updateErr) throw updateErr;
        businessId = savedProfileBusinessId;
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('businesses')
          .insert({ ...rowPayload, owner_id: user.id } as never)
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        businessId = inserted?.id ? String(inserted.id) : '';
      }

      if (businessId) setSavedProfileBusinessId(businessId);

      const { error: profileErr } = await supabase
        .from('user_profiles')
        .update({
          name: ownerName.trim(),
          full_name: ownerName.trim(),
          display_name: ownerName.trim(),
          business_name: businessName.trim(),
          business_category: category,
          business_location: address.trim(),
          business_phone: businessPhone.trim(),
          business_email: businessEmail.trim(),
          phone: businessPhone.trim(),
          whatsapp_number: noWhatsApp ? null : whatsappNumber.trim() || null,
          whatsapp_marketing_opt_in: noWhatsApp ? false : whatsappMarketingOptIn,
          whatsapp_marketing_opt_in_at:
            !noWhatsApp && whatsappMarketingOptIn ? new Date().toISOString() : null,
          onboarding_complete: true,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (profileErr) {
        console.warn('[CompleteBusinessProfile] Profile update warning:', profileErr);
      }

      await refreshUserProfile();
      await refreshBusinesses();
      await refreshBusinessOwnerRowStatus();

      const needsListing = await checkBusinessOwnerNeedsFirstListing(supabase, user.id);
      setNeedsFirstListing(needsListing);
      toast.success(tr(language, 'Profile saved!', 'Profil enregistré !', 'Profail i sevem!'));
      setSavedDone(true);
    } catch (err: any) {
      console.error('[CompleteBusinessProfile]', err);
      toast.error(err?.message || 'Failed to save business profile');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user?.id) return null;

  const handleExitForNow = () => {
    setCurrentView('home');
  };

  // ─── Per-step gating (light required checks; full validation runs on Save) ───
  const stepValid = (id: StepId): boolean => {
    switch (id) {
      case 'name':
        return businessName.trim().length > 0;
      case 'owner':
        return ownerName.trim().length > 0;
      case 'contact':
        return businessPhone.trim().length > 0 && EMAIL_RE.test(businessEmail.trim());
      case 'whatsapp':
        return noWhatsApp || (whatsappNumber.trim().length > 0 && whatsappMarketingOptIn);
      case 'location':
        return address.trim().length > 0;
      default:
        return true;
    }
  };

  const stepErrorMessage = (id: StepId): string => {
    switch (id) {
      case 'name':
        return tr(language, 'Please enter your business name.', "Entrez le nom de l'entreprise.", 'Putem nem blong bisnis.');
      case 'owner':
        return tr(language, 'Please enter your name.', 'Entrez votre nom.', 'Putem nem blong yu.');
      case 'contact':
        return businessPhone.trim().length === 0
          ? tr(language, 'Please enter a phone number.', 'Entrez un téléphone.', 'Putem fon namba.')
          : tr(language, 'Please enter a valid email.', 'Entrez un email valide.', 'Putem wan stret email.');
      case 'whatsapp':
        return whatsappNumber.trim().length === 0
          ? tr(language, 'Enter your WhatsApp number, or tick “I don’t use WhatsApp”.', 'Entrez votre WhatsApp ou cochez la case.', 'Putem WhatsApp namba, o tikem box.')
          : tr(language, 'Please tick the box to receive setup tips.', 'Cochez la case pour recevoir les conseils.', 'Tikem box blong kasem tips.');
      case 'location':
        return tr(language, 'Please enter your town or address.', 'Entrez votre ville ou adresse.', 'Putem taon o adres.');
      default:
        return '';
    }
  };

  const currentId = STEPS[step];
  const isLast = currentId === 'review';

  const goNext = () => {
    if (!stepValid(currentId)) {
      const key =
        currentId === 'name' ? 'businessName'
        : currentId === 'owner' ? 'ownerName'
        : currentId === 'contact' ? (businessPhone.trim() ? 'businessEmail' : 'businessPhone')
        : currentId === 'whatsapp' ? (whatsappNumber.trim() ? 'whatsappOptIn' : 'whatsappNumber')
        : currentId === 'location' ? 'address'
        : '';
      if (key) setErrors((p) => ({ ...p, [key]: stepErrorMessage(currentId) }));
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const stepTitle = (id: StepId): string => {
    switch (id) {
      case 'name':
        return tr(language, "What's your business called?", 'Quel est le nom de votre entreprise ?', 'Wanem nem blong bisnis blong yu?');
      case 'category':
        return tr(language, 'What kind of business is it?', 'Quel type d’entreprise ?', 'Wanem kaen bisnis?');
      case 'owner':
        return tr(language, "What's your name?", 'Quel est votre nom ?', 'Wanem nem blong yu?');
      case 'contact':
        return tr(language, 'How can customers reach you?', 'Comment vous joindre ?', 'Olsem wanem kastoma i kontaktem yu?');
      case 'whatsapp':
        return tr(language, 'Do you use WhatsApp?', 'Utilisez-vous WhatsApp ?', 'Yu yusum WhatsApp?');
      case 'location':
        return tr(language, 'Where are you?', 'Où êtes-vous ?', 'Yu stap wea?');
      case 'logo':
        return tr(language, 'Add your logo', 'Ajoutez votre logo', 'Putem logo blong yu');
      case 'review':
        return tr(language, 'All done — save your profile', 'Terminé — enregistrez', 'I redi — sevem profail');
      default:
        return '';
    }
  };

  const inputBig = 'h-12 text-base';
  const errFor = (k: string) => errors[k] && <p className="text-sm text-red-500 mt-2">{errors[k]}</p>;

  const renderStepBody = () => {
    switch (currentId) {
      case 'name':
        return (
          <div>
            <Input
              autoFocus
              value={businessName}
              onChange={(e) => { setBusinessName(e.target.value); setErrors((p) => ({ ...p, businessName: '' })); }}
              onKeyDown={(e) => { if (e.key === 'Enter') goNext(); }}
              className={inputBig}
              placeholder={tr(language, 'e.g. Island Adventures', 'ex. Island Adventures', 'eg. Island Adventures')}
            />
            {errFor('businessName')}
          </div>
        );
      case 'category':
        return (
          <div className="grid grid-cols-2 gap-3">
            {categories.map((c) => {
              const Icon = CATEGORY_ICON[c.icon] || Store;
              const selected = category === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => { setCategory(c.key); setStep((s) => Math.min(s + 1, STEPS.length - 1)); }}
                  className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 p-5 text-center transition ${
                    selected ? 'border-teal-500 bg-teal-50' : 'border-gray-200 bg-white hover:border-teal-300'
                  }`}
                >
                  <Icon className={`w-7 h-7 ${selected ? 'text-teal-600' : 'text-gray-500'}`} />
                  <span className="text-sm font-bold text-gray-800">
                    {language === 'fr' ? c.labelFr : language === 'bi' ? c.labelBi : c.label}
                  </span>
                </button>
              );
            })}
          </div>
        );
      case 'owner':
        return (
          <div>
            <Input
              autoFocus
              value={ownerName}
              onChange={(e) => { setOwnerName(e.target.value); setErrors((p) => ({ ...p, ownerName: '' })); }}
              onKeyDown={(e) => { if (e.key === 'Enter') goNext(); }}
              className={inputBig}
              placeholder={tr(language, 'Your full name', 'Votre nom complet', 'Fulnem blong yu')}
            />
            {errFor('ownerName')}
          </div>
        );
      case 'contact':
        return (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1.5">{tr(language, 'Phone', 'Téléphone', 'Fon')}</p>
              <Input
                autoFocus
                type="tel"
                value={businessPhone}
                onChange={(e) => { setBusinessPhone(e.target.value); setErrors((p) => ({ ...p, businessPhone: '' })); }}
                className={inputBig}
                placeholder="+678 …"
              />
              {errFor('businessPhone')}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1.5">{tr(language, 'Email', 'Email', 'Email')}</p>
              <Input
                type="email"
                value={businessEmail}
                onChange={(e) => { setBusinessEmail(e.target.value); setErrors((p) => ({ ...p, businessEmail: '' })); }}
                className={inputBig}
                placeholder="name@example.com"
              />
              {errFor('businessEmail')}
            </div>
          </div>
        );
      case 'whatsapp':
        return (
          <div className="space-y-4">
            {!noWhatsApp && (
              <div>
                <Input
                  autoFocus
                  type="tel"
                  value={whatsappNumber}
                  onChange={(e) => { setWhatsappNumber(e.target.value); setErrors((p) => ({ ...p, whatsappNumber: '' })); }}
                  className={inputBig}
                  placeholder={tr(language, 'WhatsApp number (+678 …)', 'Numéro WhatsApp (+678 …)', 'WhatsApp namba (+678 …)')}
                />
                {errFor('whatsappNumber')}
                <label className="mt-3 flex items-start gap-3 cursor-pointer rounded-xl border border-teal-100 bg-teal-50/50 p-3">
                  <input
                    type="checkbox"
                    checked={whatsappMarketingOptIn}
                    onChange={(e) => { setWhatsappMarketingOptIn(e.target.checked); setErrors((p) => ({ ...p, whatsappOptIn: '' })); }}
                    className="mt-0.5 h-5 w-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-700">
                    {tr(language, 'Send me free setup tips on WhatsApp.', 'Envoyez-moi des conseils sur WhatsApp.', 'Sendem fri tips long WhatsApp.')}
                  </span>
                </label>
                {errFor('whatsappOptIn')}
              </div>
            )}
            <label className="flex items-center gap-3 cursor-pointer text-sm text-gray-600">
              <input
                type="checkbox"
                checked={noWhatsApp}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setNoWhatsApp(checked);
                  if (checked) { setWhatsappNumber(''); setWhatsappMarketingOptIn(false); }
                  setErrors((p) => ({ ...p, whatsappNumber: '', whatsappOptIn: '' }));
                }}
                className="h-5 w-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              {tr(language, "I don't use WhatsApp", "Je n'utilise pas WhatsApp", 'Mi no yusum WhatsApp')}
            </label>
          </div>
        );
      case 'location':
        return (
          <div className="space-y-4">
            <Input
              autoFocus
              value={address}
              onChange={(e) => { setAddress(e.target.value); setErrors((p) => ({ ...p, address: '' })); }}
              className={inputBig}
              placeholder={tr(language, 'Town or address (e.g. Port Vila)', 'Ville ou adresse (ex. Port Vila)', 'Taon o adres (eg. Port Vila)')}
            />
            {errFor('address')}
            <LocationMapPicker mapUrl={mapUrl} onMapUrlChange={setMapUrl} language={language} />
          </div>
        );
      case 'logo':
        return (
          <PhotoUploader
            photos={logoPhotos}
            onPhotosChange={setLogoPhotos}
            maxPhotos={1}
            userId={user.id}
            logoCrop
            label={tr(language, 'Business logo', 'Logo', 'Logo')}
            sublabel={tr(language, 'Optional — you can add this later.', 'Optionnel — à ajouter plus tard.', 'Optional — yu save putem bihain.')}
          />
        );
      case 'review': {
        const rows: { label: string; value: string }[] = [
          { label: tr(language, 'Business', 'Entreprise', 'Bisnis'), value: businessName },
          {
            label: tr(language, 'Type', 'Type', 'Kaen'),
            value: (() => {
              const c = categories.find((x) => x.key === category);
              return c ? (language === 'fr' ? c.labelFr : language === 'bi' ? c.labelBi : c.label) : category;
            })(),
          },
          { label: tr(language, 'Owner', 'Gérant', 'Ona'), value: ownerName },
          { label: tr(language, 'Phone', 'Téléphone', 'Fon'), value: businessPhone },
          { label: tr(language, 'Email', 'Email', 'Email'), value: businessEmail },
          {
            label: 'WhatsApp',
            value: noWhatsApp ? tr(language, 'Not used', 'Non utilisé', 'No yusum') : whatsappNumber,
          },
          { label: tr(language, 'Location', 'Lieu', 'Ples'), value: address },
        ];
        return (
          <div className="rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{r.label}</span>
                <span className="text-sm font-medium text-gray-800 text-right truncate">{r.value || '—'}</span>
              </div>
            ))}
          </div>
        );
      }
      default:
        return null;
    }
  };

  // ─── Success screen ───
  if (savedDone) {
    return (
      <PageShell>
        <div className="p-6 sm:p-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Check className="h-8 w-8" strokeWidth={3} />
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2">
            {tr(language, 'Profile saved!', 'Profil enregistré !', 'Profail i sevem!')}
          </h1>
          <p className="text-sm text-gray-600 mb-6">
            {needsFirstListing
              ? tr(language, 'Next, add your first deal — photos and a price. It only takes a minute.', 'Ensuite, ajoutez votre première offre.', 'Nekis, putem fastaem deal blong yu.')
              : tr(language, 'Your details are saved.', 'Vos informations sont enregistrées.', 'Ol samting blong yu i sevem.')}
          </p>

          {needsFirstListing ? (
            <Button
              type="button"
              onClick={continueToBusinessHub}
              className="w-full h-12 text-base bg-gradient-to-r from-emerald-600 to-teal-700 hover:opacity-95"
            >
              <Plus className="w-5 h-5 mr-2" />
              {tr(language, 'Add my first deal', 'Ajouter ma première offre', 'Putem fastaem deal')}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => setCurrentView('business-dashboard')}
              className="w-full h-12 text-base bg-gradient-to-r from-emerald-600 to-teal-700 hover:opacity-95"
            >
              {tr(language, 'Go to my dashboard', 'Aller au tableau de bord', 'Go long dashboard')}
            </Button>
          )}

          {savedProfileBusinessId && (
            <div className="mt-5 text-left">
              <button
                type="button"
                onClick={() => setShowCreds((v) => !v)}
                className="text-sm font-semibold text-teal-700 hover:underline underline-offset-2"
              >
                {tr(language, 'Add licence or permit (optional)', 'Ajouter une licence (optionnel)', 'Putem laesens (optional)')}
              </button>
              {showCreds && (
                <div className="mt-3">
                  <BusinessCredentialsSettings profileBusinessId={savedProfileBusinessId} />
                </div>
              )}
            </div>
          )}
        </div>
      </PageShell>
    );
  }

  // ─── Wizard ───
  const progressPct = Math.round(((step + 1) / STEPS.length) * 100);
  const isOptionalStep = currentId === 'logo' || currentId === 'location';

  return (
    <PageShell>
      {/* Header: progress + exit */}
      <div className="relative px-6 pt-6 sm:px-8 sm:pt-8">
        <button
          type="button"
          onClick={handleExitForNow}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
          aria-label={tr(language, 'Exit and finish later', 'Quitter', 'Go aot')}
          title={tr(language, 'Exit — finish later', 'Quitter — plus tard', 'Go aot — bihain')}
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white">
            <Store className="h-4 w-4" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wide text-gray-400">
            {tr(language, 'Step', 'Étape', 'Step')} {step + 1} / {STEPS.length}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="flex justify-center mt-3">
          <WizardLanguageToggle />
        </div>
      </div>

      {userProfileLoadError && (
        <div role="alert" className="mx-6 sm:mx-8 mt-6 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
            <p>{userProfileLoadError}</p>
          </div>
          <button type="button" onClick={() => void retryUserProfileFetch()} className="shrink-0 px-3 py-1.5 rounded-lg bg-red-700 text-white font-semibold">
            {tr(language, 'Try again', 'Réessayer', 'Traem gen')}
          </button>
        </div>
      )}

      {/* Body */}
      <div className="p-6 sm:p-8">
        <h1 className="text-2xl font-black tracking-tight text-gray-900 mb-1">{stepTitle(currentId)}</h1>
        {currentId === 'whatsapp' && (
          <p className="text-sm text-gray-500 mb-5 flex items-center gap-1.5">
            <MessageCircle className="w-4 h-4 text-teal-500" />
            {tr(language, 'Customers message you to book.', 'Les clients vous écrivent pour réserver.', 'Kastoma i mesej yu blong bukim.')}
          </p>
        )}
        {currentId !== 'whatsapp' && <div className="mb-5" />}

        {renderStepBody()}

        {/* Footer nav */}
        <div className="mt-8 flex items-center gap-3">
          {step > 0 && (
            <Button type="button" variant="outline" onClick={goBack} className="h-12 px-4 shrink-0 border-gray-200 text-gray-600">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}

          {isLast ? (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 h-12 text-base bg-gradient-to-r from-emerald-600 to-teal-700 hover:opacity-95"
            >
              {submitting ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" />{tr(language, 'Saving…', 'Enregistrement…', 'Sevem…')}</>
              ) : (
                <><Check className="w-5 h-5 mr-2" />{tr(language, 'Save profile', 'Enregistrer', 'Sevem profail')}</>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={goNext}
              className="flex-1 h-12 text-base bg-gradient-to-r from-emerald-600 to-teal-700 hover:opacity-95"
            >
              {isOptionalStep
                ? tr(language, 'Continue', 'Continuer', 'Go hed')
                : tr(language, 'Next', 'Suivant', 'Nekis')}
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          )}
        </div>

        {isOptionalStep && (
          <button
            type="button"
            onClick={goNext}
            className="mt-3 w-full text-center text-sm font-medium text-gray-400 hover:text-gray-600"
          >
            {tr(language, 'Skip for now', 'Ignorer', 'Skipim')}
          </button>
        )}
      </div>
    </PageShell>
  );
};

export default CompleteBusinessProfile;
