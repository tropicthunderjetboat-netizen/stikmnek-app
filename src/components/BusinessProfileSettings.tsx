import React, { useCallback, useEffect, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { categories, type Category } from '@/data/businesses';
import { getEdgeAuthHeaders, supabase } from '@/lib/supabase';
import { businessHoursFromProfileRow } from '@/lib/businessOfferingMap';
import { validateBusinessProfileOnboarding } from '@/lib/businessOnboardingValidation';
import LocationMapPicker from '@/components/LocationMapPicker';
import WebsiteUrlInput from '@/components/WebsiteUrlInput';
import PhotoUploader, { type UploadedPhoto } from '@/components/PhotoUploader';
import BusinessCredentialsSettings from '@/components/BusinessCredentialsSettings';
import { parseLatLngFromMapUrl, normalizeWebsiteForStorage } from '@/lib/urlHelpers';
import { toast } from 'sonner';
import { Building2, Clock, Loader2, Mail, MapPin, Phone, Save, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type BusinessProfileSettingsProps = {
  profileBusinessId: string;
  /** Company trading name from profile row (read-only hint). */
  profileDisplayName?: string;
};

const BusinessProfileSettings: React.FC<BusinessProfileSettingsProps> = ({
  profileBusinessId,
  profileDisplayName,
}) => {
  const { user, userProfile, language, refreshUserProfile, refreshBusinesses } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [noWhatsApp, setNoWhatsApp] = useState(false);
  const [whatsappMarketingOptIn, setWhatsappMarketingOptIn] = useState(false);
  const [category, setCategory] = useState<Category>('dining');
  const [address, setAddress] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [website, setWebsite] = useState('');
  const [businessHours, setBusinessHours] = useState('');
  const [logoPhotos, setLogoPhotos] = useState<UploadedPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loadProfile = useCallback(async () => {
    if (!profileBusinessId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select(
          'id, name, category, location, lat, lng, hours, opening_hours, phone, email, contact_email, business_email, whatsapp_number, map_url, website, logo_url, image',
        )
        .eq('id', profileBusinessId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast.error(
          language === 'en'
            ? 'Business profile not found.'
            : language === 'fr'
              ? 'Profil introuvable.'
              : 'No faenem bisnis profael.',
        );
        return;
      }

      const row = data as Record<string, unknown>;
      setBusinessName(String(row.name ?? '').trim());
      const cat = String(row.category ?? '').trim().toLowerCase();
      if (categories.some((c) => c.key === cat)) setCategory(cat as Category);
      setAddress(String(row.location ?? '').trim());
      setBusinessPhone(String(row.phone ?? '').trim());
      setBusinessEmail(
        String(row.contact_email ?? row.email ?? row.business_email ?? '').trim(),
      );
      const wa = String(row.whatsapp_number ?? '').trim();
      setWhatsappNumber(wa);
      setNoWhatsApp(!wa);
      setMapUrl(String(row.map_url ?? '').trim());
      setWebsite(String(row.website ?? '').trim());
      setBusinessHours(
        businessHoursFromProfileRow({
          hours: row.hours,
          opening_hours: row.opening_hours,
        }),
      );

      const logo = String(row.logo_url ?? row.image ?? '').trim();
      setLogoPhotos(logo ? [{ url: logo, filePath: logo }] : []);

      setOwnerName(
        (
          userProfile?.full_name ||
          userProfile?.name ||
          userProfile?.display_name ||
          user?.name ||
          ''
        ).trim(),
      );
      if (!String(row.email ?? '').trim() && userProfile?.business_email) {
        setBusinessEmail(String(userProfile.business_email).trim());
      }
      setWhatsappMarketingOptIn(
        Boolean(userProfile?.whatsapp_marketing_opt_in) && Boolean(wa),
      );
    } catch (err: unknown) {
      console.error('[BusinessProfileSettings] load', err);
      toast.error(
        language === 'en'
          ? 'Could not load business profile.'
          : language === 'fr'
            ? 'Impossible de charger le profil.'
            : 'No save lodem profael.',
      );
    } finally {
      setLoading(false);
    }
  }, [profileBusinessId, language, user, userProfile]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const validate = (): boolean => {
    const { valid, errors: validationErrors } = validateBusinessProfileOnboarding({
      businessName,
      ownerName,
      email: businessEmail,
      phone: businessPhone,
      whatsapp: whatsappNumber,
      noWhatsApp,
      address,
    });
    if (!valid) {
      const next: Record<string, string> = {};
      const map: Record<string, string> = {
        businessName: 'businessName',
        ownerName: 'ownerName',
        email: 'businessEmail',
        phone: 'businessPhone',
        whatsapp: 'whatsappNumber',
        address: 'address',
      };
      for (const [k, msg] of Object.entries(validationErrors)) {
        const formKey = map[k];
        if (formKey && msg) next[formKey] = msg;
      }
      setErrors(next);
      return false;
    }
    setErrors({});
    return true;
  };

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!user?.id || !profileBusinessId) return;
    if (!validate()) {
      toast.error(
        language === 'en'
          ? 'Please fix the errors below.'
          : language === 'fr'
            ? 'Corrigez les erreurs ci-dessous.'
            : 'Fiksim ol erra.',
      );
      return;
    }

    setSaving(true);
    try {
      const parsed = mapUrl.trim() ? parseLatLngFromMapUrl(mapUrl.trim()) : null;
      const logoUrl = logoPhotos[0]?.url?.trim() || '';
      const updates: Record<string, unknown> = {
        name: businessName.trim(),
        category,
        location: address.trim(),
        phone: businessPhone.trim(),
        email: businessEmail.trim(),
        contact_email: businessEmail.trim(),
        business_email: businessEmail.trim(),
        whatsapp_number: noWhatsApp ? null : whatsappNumber.trim() || null,
        hours: businessHours.trim(),
        map_url: mapUrl.trim() || null,
        website: normalizeWebsiteForStorage(website) ?? null,
        updated_at: new Date().toISOString(),
      };
      if (logoUrl) {
        updates.logo_url = logoUrl;
      }
      if (parsed) {
        updates.lat = parsed.lat;
        updates.lng = parsed.lng;
      }

      const { data, error } = await supabase.functions.invoke('manage-business', {
        headers: await getEdgeAuthHeaders(),
        body: {
          action: 'update_business',
          userId: user.id,
          businessId: profileBusinessId,
          updates,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

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
            !noWhatsApp && whatsappMarketingOptIn
              ? userProfile?.whatsapp_marketing_opt_in_at || new Date().toISOString()
              : null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (profileErr) {
        console.warn('[BusinessProfileSettings] user_profiles sync', profileErr);
      }

      await refreshUserProfile();
      await refreshBusinesses();
      toast.success(
        language === 'en'
          ? 'Business profile updated. New listings will use these contact details.'
          : language === 'fr'
            ? 'Profil mis � jour. Les nouvelles annonces utiliseront ces coordonn�es.'
            : 'Profael i apdeit.',
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  const title =
    language === 'en'
      ? 'Business profile'
      : language === 'fr'
        ? 'Profil entreprise'
        : 'Bisnis profael';

  const subtitle =
    language === 'en'
      ? 'Update phone, email, address, and office hours for your whole business. Each tour or deal can still have its own schedule under Edit listing.'
      : language === 'fr'
        ? 'Mettez � jour le t�l�phone, l�e-mail, l�adresse et les horaires du commerce. Chaque annonce garde son propre horaire dans Modifier l�annonce.'
        : 'Apdeit fon, email, adres mo taem blong olgeta bisnis. Evri listing i save gat diffren taem long Edit listing.';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
            {profileDisplayName && profileDisplayName !== businessName && (
              <p className="text-xs text-gray-400 mt-2">
                {language === 'en' ? 'Profile' : 'Profil'}: {profileDisplayName}
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-1.5 mb-1.5">
                <Building2 className="w-3.5 h-3.5 text-gray-400" />
                {language === 'en' ? 'Business name' : language === 'fr' ? 'Nom du commerce' : 'Nem blong bisnis'}
              </Label>
              <Input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className={errors.businessName ? 'border-red-300' : ''}
              />
              {errors.businessName && <p className="text-xs text-red-600 mt-1">{errors.businessName}</p>}
            </div>
            <div>
              <Label className="flex items-center gap-1.5 mb-1.5">
                <User className="w-3.5 h-3.5 text-gray-400" />
                {language === 'en' ? 'Contact person' : language === 'fr' ? 'Personne de contact' : 'Man blong kontak'}
              </Label>
              <Input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className={errors.ownerName ? 'border-red-300' : ''}
              />
              {errors.ownerName && <p className="text-xs text-red-600 mt-1">{errors.ownerName}</p>}
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">
              {language === 'en' ? 'Primary category' : language === 'fr' ? 'Cat�gorie principale' : 'Kategori'}
            </Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-1.5 mb-1.5">
                <Phone className="w-3.5 h-3.5 text-gray-400" />
                {language === 'en' ? 'Phone' : 'T�l�phone'}
              </Label>
              <Input
                type="tel"
                value={businessPhone}
                onChange={(e) => setBusinessPhone(e.target.value)}
                placeholder="+678 �"
                className={errors.businessPhone ? 'border-red-300' : ''}
              />
              {errors.businessPhone && <p className="text-xs text-red-600 mt-1">{errors.businessPhone}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={noWhatsApp}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setNoWhatsApp(checked);
                    if (checked) {
                      setWhatsappNumber('');
                      setWhatsappMarketingOptIn(false);
                    }
                    setErrors((p) => ({ ...p, whatsappNumber: '' }));
                  }}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700 leading-relaxed">
                  {language === 'en'
                    ? "I don't use WhatsApp — contact me by phone or email instead."
                    : language === 'fr'
                      ? "Je n'utilise pas WhatsApp — contactez-moi par telephone ou e-mail."
                      : 'Mi no yusum WhatsApp — kontaktem mi long fon o email.'}
                </span>
              </label>
            </div>

            {!noWhatsApp && (
              <div className="sm:col-span-2">
                <Label className="flex items-center gap-1.5 mb-1.5">
                  {language === 'en' ? 'WhatsApp' : language === 'fr' ? 'WhatsApp' : 'WhatsApp'}
                </Label>
                <p className="text-xs text-gray-500 mb-1.5">
                  {language === 'en'
                    ? 'Recommended for guest contact and StikmNek setup tips. Include country code (e.g. +678).'
                    : language === 'fr'
                      ? 'Recommande pour les clients et conseils StikmNek. Indicatif pays (ex. +678).'
                      : 'Recomentem blong guest mo tips. Inklutum kaotri cod (ex. +678).'}
                </p>
                <Input
                  type="tel"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="+678 …"
                  className={errors.whatsappNumber ? 'border-red-300' : ''}
                />
                {errors.whatsappNumber && (
                  <p className="text-xs text-red-600 mt-1">{errors.whatsappNumber}</p>
                )}
              </div>
            )}
          </div>

          {!noWhatsApp && (
            <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={whatsappMarketingOptIn}
                  onChange={(e) => setWhatsappMarketingOptIn(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700 leading-relaxed">
                  {language === 'en'
                    ? 'Send me WhatsApp tips from StikmNek (listing help, photo uploads, getting bookings).'
                    : language === 'fr'
                      ? 'Envoyez-moi des conseils WhatsApp de StikmNek (aide annonce, photos, reservations).'
                      : 'Sendem WhatsApp tips blong StikmNek (help long listing, foto, booking).'}
                </span>
              </label>
            </div>
          )}

          {noWhatsApp && (
            <p className="text-xs text-gray-500 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
              {language === 'en'
                ? "We'll use your phone and email for listing help. You won't be on our WhatsApp outreach list."
                : language === 'fr'
                  ? 'Nous utiliserons votre telephone et e-mail. Pas de liste WhatsApp.'
                  : 'Mifala bae yusum fon mo email long taem blong listing elp. No long WhatsApp list.'}
            </p>
          )}

          <div>
            <Label className="flex items-center gap-1.5 mb-1.5">
                            <Mail className="w-3.5 h-3.5 text-gray-400" />
              Email
            </Label>
            <Input
              type="email"
              value={businessEmail}
              onChange={(e) => setBusinessEmail(e.target.value)}
              className={errors.businessEmail ? 'border-red-300' : ''}
            />
            {errors.businessEmail && <p className="text-xs text-red-600 mt-1">{errors.businessEmail}</p>}
          </div>

          <div>
            <Label className="flex items-center gap-1.5 mb-1.5">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              {language === 'en'
                ? 'Business hours (office / base)'
                : language === 'fr'
                  ? 'Heures du commerce (bureau)'
                  : 'Ol binis aoa'}
            </Label>
            <Input
              value={businessHours}
              onChange={(e) => setBusinessHours(e.target.value)}
              placeholder={
                language === 'en' ? 'e.g. Mon�Fri 8:00 AM � 4:00 PM' : 'ex. lun�ven 8h�16h'
              }
            />
            <p className="text-[11px] text-gray-400 mt-1">
              {language === 'en'
                ? 'Used as a fallback and for your company contact. Set tour-specific times on each listing under Edit listing.'
                : language === 'fr'
                  ? 'Utilis� pour le contact g�n�ral. Les horaires de chaque tour se d�finissent dans Modifier l�annonce.'
                  : 'Blong kontak blong bisnis. Taem blong wan tour — long jesem listing.'}
            </p>
          </div>

          <div>
            <Label className="flex items-center gap-1.5 mb-1.5">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              {language === 'en' ? 'Address' : 'Adresse'}
            </Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={errors.address ? 'border-red-300' : ''}
            />
            {errors.address && <p className="text-xs text-red-600 mt-1">{errors.address}</p>}
          </div>

          <LocationMapPicker mapUrl={mapUrl} onMapUrlChange={setMapUrl} language={language} />
          <WebsiteUrlInput website={website} onWebsiteChange={setWebsite} language={language} />

          <div>
            <Label className="mb-2 block">
              {language === 'en' ? 'Logo (optional)' : language === 'fr' ? 'Logo (optionnel)' : 'Logo'}
            </Label>
            <PhotoUploader
              photos={logoPhotos}
              onPhotosChange={setLogoPhotos}
              maxPhotos={1}
              userId={user!.id}
              logoCrop
              sublabel={
                language === 'en'
                  ? 'Upload then drag and zoom to fit the square � same idea as a profile photo.'
                  : language === 'fr'
                    ? 'T�l�versez, puis glissez et zoomez pour remplir le carr�.'
                    : 'aplotem, trak mo zoom blong save fitim square. Sem aedia long profael foto'
              }
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" disabled={saving} className="bg-teal-600 hover:bg-teal-700 gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {language === 'en' ? 'Save profile' : language === 'fr' ? 'Enregistrer' : 'Sevem profael'}
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => void loadProfile()}>
              {language === 'en' ? 'Discard changes' : language === 'fr' ? 'Annuler' : 'Discard'}
            </Button>
          </div>
        </form>
      </div>

      {user?.id && (
        <BusinessCredentialsSettings profileBusinessId={profileBusinessId} />
      )}
    </div>
  );
};

export default BusinessProfileSettings;
