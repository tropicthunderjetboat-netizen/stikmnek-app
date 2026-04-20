import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Store, Loader2, AlertCircle, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { categories, type Category } from '@/data/businesses';
import PhotoUploader, { type UploadedPhoto } from '@/components/PhotoUploader';
import LocationMapPicker from '@/components/LocationMapPicker';
import WebsiteUrlInput from '@/components/WebsiteUrlInput';
import { parseLatLngFromMapUrl, normalizeWebsiteForStorage } from '@/lib/urlHelpers';

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
    businessOnboardingResume,
  } = useAppContext();

  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [category, setCategory] = useState<Category>('dining');
  const [address, setAddress] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [website, setWebsite] = useState('');
  const [logoPhotos, setLogoPhotos] = useState<UploadedPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

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
    setBusinessName((userProfile.business_name || '').trim());
    const cat = userProfile.business_category as Category | undefined;
    if (cat && categories.some((c) => c.key === cat)) setCategory(cat);
    setAddress((userProfile.business_location || '').trim());
  }, [userProfile, user]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!businessName.trim()) e.businessName = 'Required';
    if (!ownerName.trim()) e.ownerName = 'Required';
    if (!businessEmail.trim() || !businessEmail.includes('@')) e.businessEmail = 'Valid email required';
    if (!businessPhone.trim()) e.businessPhone = 'Required';
    if (!whatsappNumber.trim()) e.whatsappNumber = 'Required';
    if (!address.trim()) e.address = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!user?.id) return;
    if (!validate()) {
      toast.error(
        language === 'en' ? 'Please fix the errors below.' : language === 'fr' ? 'Corrigez les erreurs ci-dessous.' : 'Fiksem ol erro',
      );
      return;
    }

    setSubmitting(true);
    try {
      const parsed = mapUrl.trim() ? parseLatLngFromMapUrl(mapUrl.trim()) : null;
      const logoUrl = logoPhotos[0]?.url?.trim() || '';
      const insertRow: Record<string, unknown> = {
        name: businessName.trim(),
        category,
        description: '',
        description_fr: '',
        description_bi: '',
        image: logoUrl,
        discount: '',
        original_price: 0,
        deal_price: 0,
        location: address.trim(),
        hours: '',
        phone: businessPhone.trim(),
        email: businessEmail.trim(),
        whatsapp_number: whatsappNumber.trim(),
        owner_id: user.id,
        tags: [category],
        active: false,
        map_url: mapUrl.trim() || null,
        website: normalizeWebsiteForStorage(website) ?? null,
      };
      if (parsed) {
        insertRow.lat = parsed.lat;
        insertRow.lng = parsed.lng;
      }

      const { data: inserted, error: insertErr } = await supabase
        .from('businesses')
        .insert(insertRow as never)
        .select('id')
        .single();

      if (insertErr) throw insertErr;

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
          whatsapp_number: whatsappNumber.trim(),
          onboarding_complete: true,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (profileErr) {
        console.warn('[CompleteBusinessProfile] Profile update warning:', profileErr);
        toast.warning(
          language === 'en'
            ? 'Business saved; profile sync may finish shortly.'
            : language === 'fr'
              ? 'Entreprise enregistrée ; synchronisation du profil en cours.'
              : 'Bisnis i sevem',
        );
      }

      await refreshUserProfile();
      await refreshBusinesses();
      await refreshBusinessOwnerRowStatus();

      toast.success(
        language === 'en'
          ? 'Business profile saved! Opening your dashboard to add listings.'
          : language === 'fr'
            ? 'Profil enregistré ! Ouverture du tableau de bord.'
            : 'Bisnis profail i sevem!',
      );

      setCurrentView('business-dashboard');
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('switch-dashboard-tab', { detail: { tab: 'submit' } }));
      }, 150);
    } catch (err: any) {
      console.error('[CompleteBusinessProfile]', err);
      toast.error(err?.message || 'Failed to save business profile');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user?.id) return null;

  const copy = businessOnboardingResume
    ? {
        title:
          language === 'en'
            ? 'Resume business profile setup'
            : language === 'fr'
              ? 'Reprendre la configuration'
              : 'Go hed long setapem bisnis',
        subtitle:
          language === 'en'
            ? 'Continue setting up — if you submitted a listing for approval, you still need a business profile row to use the dashboard.'
            : language === 'fr'
              ? 'Poursuivez la configuration — même avec une annonce en attente, ce profil est nécessaire pour le tableau de bord.'
              : 'Go hed — sapos yu bin soema listing, yu mas komplitim profil ia blong yusum dashboard.',
      }
    : {
        title:
          language === 'en'
            ? 'Set up your business'
            : language === 'fr'
              ? 'Configurez votre entreprise'
              : 'Setapem bisnis blong yu',
        subtitle:
          language === 'en'
            ? 'Tell us who you are, how to reach you, and (optionally) drop a map pin and logo. When you save, we open your Business Hub on “Submit a listing” so you can add each deal with the same form as the public site — your details copy across automatically.'
            : language === 'fr'
              ? 'Indiquez comment vous joindre, et en option une carte et un logo. Après enregistrement, nous ouvrons votre tableau de bord sur « Soumettre une annonce ».'
              : 'Telemom ol samting, mo optional map mo logo. Afta save bae i openem Business Hub long Submit listing.',
      };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-emerald-50/40 pt-20 pb-16">
      <div className="max-w-xl mx-auto px-4">
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-lg overflow-hidden">
          <div className="p-6 sm:p-8 bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-3">
              <Store className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-extrabold">{copy.title}</h1>
            <p className="text-white/80 text-sm mt-1">{copy.subtitle}</p>
          </div>

          {userProfileLoadError && (
            <div
              role="alert"
              className="mx-6 sm:mx-8 mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
                <p>{userProfileLoadError}</p>
              </div>
              <button
                type="button"
                onClick={() => void retryUserProfileFetch()}
                className="shrink-0 px-4 py-2 rounded-lg bg-red-700 text-white font-semibold hover:bg-red-800"
              >
                {language === 'en' ? 'Try again' : language === 'fr' ? 'Réessayer' : 'Traem gen'}
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4">
            <div>
              <Label htmlFor="cbp-business-name">
                {language === 'en' ? 'Business name' : language === 'fr' ? "Nom de l'entreprise" : 'Nem blong bisnis'}
              </Label>
              <Input
                id="cbp-business-name"
                value={businessName}
                onChange={(e) => {
                  setBusinessName(e.target.value);
                  setErrors((p) => ({ ...p, businessName: '' }));
                }}
                className="mt-1.5"
                placeholder="Island Adventures Co."
              />
              {errors.businessName && <p className="text-xs text-red-500 mt-1">{errors.businessName}</p>}
            </div>

            <div>
              <Label htmlFor="cbp-owner-name">
                {language === 'en' ? "Owner's name" : language === 'fr' ? 'Nom du gérant' : 'Nem blong ona'}
              </Label>
              <Input
                id="cbp-owner-name"
                value={ownerName}
                onChange={(e) => {
                  setOwnerName(e.target.value);
                  setErrors((p) => ({ ...p, ownerName: '' }));
                }}
                className="mt-1.5"
              />
              {errors.ownerName && <p className="text-xs text-red-500 mt-1">{errors.ownerName}</p>}
            </div>

            <div>
              <Label htmlFor="cbp-email">
                {language === 'en' ? 'Business contact email' : language === 'fr' ? 'Email de contact' : 'Email blong bisnis'}
              </Label>
              <Input
                id="cbp-email"
                type="email"
                value={businessEmail}
                onChange={(e) => {
                  setBusinessEmail(e.target.value);
                  setErrors((p) => ({ ...p, businessEmail: '' }));
                }}
                className="mt-1.5"
              />
              {errors.businessEmail && <p className="text-xs text-red-500 mt-1">{errors.businessEmail}</p>}
            </div>

            <div>
              <Label htmlFor="cbp-phone">
                {language === 'en' ? 'Business phone' : language === 'fr' ? 'Téléphone' : 'Fon blong bisnis'}
              </Label>
              <Input
                id="cbp-phone"
                type="tel"
                value={businessPhone}
                onChange={(e) => {
                  setBusinessPhone(e.target.value);
                  setErrors((p) => ({ ...p, businessPhone: '' }));
                }}
                className="mt-1.5"
                placeholder="+678 …"
              />
              {errors.businessPhone && <p className="text-xs text-red-500 mt-1">{errors.businessPhone}</p>}
            </div>

            <div>
              <Label htmlFor="cbp-wa">
                {language === 'en' ? 'Business WhatsApp' : language === 'fr' ? 'WhatsApp' : 'WhatsApp'}
              </Label>
              <Input
                id="cbp-wa"
                type="tel"
                value={whatsappNumber}
                onChange={(e) => {
                  setWhatsappNumber(e.target.value);
                  setErrors((p) => ({ ...p, whatsappNumber: '' }));
                }}
                className="mt-1.5"
                placeholder="+678 …"
              />
              {errors.whatsappNumber && <p className="text-xs text-red-500 mt-1">{errors.whatsappNumber}</p>}
            </div>

            <div>
              <Label htmlFor="cbp-category">
                {language === 'en' ? 'Category' : language === 'fr' ? 'Catégorie' : 'Kategori'}
              </Label>
              <select
                id="cbp-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {language === 'fr' ? c.labelFr : language === 'bi' ? c.labelBi : c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="cbp-address">
                {language === 'en' ? 'Business address' : language === 'fr' ? 'Adresse' : 'Adres'}
              </Label>
              <Input
                id="cbp-address"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setErrors((p) => ({ ...p, address: '' }));
                }}
                className="mt-1.5"
                placeholder="Port Vila, Vanuatu"
              />
              {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address}</p>}
            </div>

            {user?.id && (
              <div className="space-y-4 rounded-xl border border-violet-100 bg-violet-50/50 p-4">
                <div className="flex items-center gap-2 text-violet-900 font-semibold text-sm">
                  <Globe className="w-4 h-4 shrink-0" aria-hidden />
                  {language === 'en'
                    ? 'Logo & map (recommended)'
                    : language === 'fr'
                      ? 'Logo et carte (recommandé)'
                      : 'Logo mo map'}
                </div>
                <p className="text-xs text-violet-800/90">
                  {language === 'en'
                    ? 'Tourists see your logo on the map and in search. Tap the map to set GPS (we store a Google Maps link).'
                    : 'Les touristes voient votre logo sur la carte. Touchez la carte pour déposer une épingle.'}
                </p>
                <PhotoUploader
                  photos={logoPhotos}
                  onPhotosChange={setLogoPhotos}
                  maxPhotos={1}
                  userId={user.id}
                  label={language === 'en' ? 'Business logo' : language === 'fr' ? 'Logo' : 'Logo'}
                  sublabel={
                    language === 'en'
                      ? 'Optional — square PNG or JPG, up to 5MB.'
                      : 'Optionnel — carré, PNG ou JPG.'
                  }
                />
                <LocationMapPicker mapUrl={mapUrl} onMapUrlChange={setMapUrl} language={language} />
                <div>
                  <Label htmlFor="cbp-website">{language === 'en' ? 'Website' : language === 'fr' ? 'Site web' : 'Website'}</Label>
                  <div className="mt-1.5">
                    <WebsiteUrlInput
                      id="cbp-website"
                      website={website}
                      onWebsiteChange={setWebsite}
                      language={language}
                    />
                  </div>
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-700 hover:opacity-95"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {language === 'en' ? 'Saving…' : language === 'fr' ? 'Enregistrement…' : 'Sevem…'}
                </>
              ) : language === 'en' ? (
                'Save & continue'
              ) : language === 'fr' ? (
                'Enregistrer et continuer'
              ) : (
                'Sevem mo go'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CompleteBusinessProfile;
