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
              : 'No faenem bisnis profail.',
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
      setWhatsappNumber(String(row.whatsapp_number ?? '').trim());
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
    } catch (err: unknown) {
      console.error('[BusinessProfileSettings] load', err);
      toast.error(
        language === 'en'
          ? 'Could not load business profile.'
          : language === 'fr'
            ? 'Impossible de charger le profil.'
            : 'No loadem profail.',
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
            : 'Fiksem ol erro.',
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
        whatsapp_number: whatsappNumber.trim() || null,
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
          whatsapp_number: whatsappNumber.trim() || null,
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
            ? 'Profil mis à jour. Les nouvelles annonces utiliseront ces coordonnées.'
            : 'Profail i apdeit.',
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
        : 'Bisnis profail';

  const subtitle =
    language === 'en'
      ? 'Update phone, email, address, and office hours for your whole business. Each tour or deal can still have its own schedule under Edit listing.'
      : language === 'fr'
        ? 'Mettez à jour le téléphone, l’e-mail, l’adresse et les horaires du commerce. Chaque annonce garde son propre horaire dans Modifier l’annonce.'
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
              {language === 'en' ? 'Primary category' : language === 'fr' ? 'Catégorie principale' : 'Kategori'}
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
                {language === 'en' ? 'Phone' : 'Téléphone'}
              </Label>
              <Input
                type="tel"
                value={businessPhone}
                onChange={(e) => setBusinessPhone(e.target.value)}
                placeholder="+678 …"
                className={errors.businessPhone ? 'border-red-300' : ''}
              />
              {errors.businessPhone && <p className="text-xs text-red-600 mt-1">{errors.businessPhone}</p>}
            </div>
            <div>
              <Label className="flex items-center gap-1.5 mb-1.5">WhatsApp</Label>
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
          </div>

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
                  : 'Taem wok blong bisnis'}
            </Label>
            <Input
              value={businessHours}
              onChange={(e) => setBusinessHours(e.target.value)}
              placeholder={
                language === 'en' ? 'e.g. Mon–Fri 8:00 AM – 4:00 PM' : 'ex. lun–ven 8h–16h'
              }
            />
            <p className="text-[11px] text-gray-400 mt-1">
              {language === 'en'
                ? 'Used as a fallback and for your company contact. Set tour-specific times on each listing under Edit listing.'
                : language === 'fr'
                  ? 'Utilisé pour le contact général. Les horaires de chaque tour se définissent dans Modifier l’annonce.'
                  : 'Blong kontak blong bisnis. Taem blong wan tour — long Edit listing.'}
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
            <PhotoUploader photos={logoPhotos} onPhotosChange={setLogoPhotos} maxPhotos={1} userId={user!.id} />
            <p className="text-xs text-gray-500 mt-2">
              {language === 'en'
                ? 'Tip: wide (landscape) logos display best on listing pages. PNG with a transparent background works well.'
                : language === 'fr'
                  ? 'Astuce : les logos horizontaux s’affichent mieux sur les annonces. PNG fond transparent recommandé.'
                  : 'Tip: landscape logo i luk gud long listing. PNG transparent i gud.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" disabled={saving} className="bg-teal-600 hover:bg-teal-700 gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {language === 'en' ? 'Save profile' : language === 'fr' ? 'Enregistrer' : 'Sevem profail'}
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
