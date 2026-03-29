import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Store, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { categories, type Category } from '@/data/businesses';

const CompleteBusinessProfile: React.FC = () => {
  const {
    user,
    userProfile,
    language,
    setCurrentView,
    refreshUserProfile,
    refreshBusinesses,
    refreshBusinessOwnerRowStatus,
  } = useAppContext();

  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [category, setCategory] = useState<Category>('dining');
  const [address, setAddress] = useState('');
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
      const { data: inserted, error: insertErr } = await supabase
        .from('businesses')
        .insert({
          name: businessName.trim(),
          category,
          description: '',
          description_fr: '',
          description_bi: '',
          image: '',
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
        })
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
          ? 'Business profile saved! You can add your listing details next.'
          : language === 'fr'
            ? 'Profil entreprise enregistré ! Vous pouvez compléter votre annonce.'
            : 'Bisnis profail i sevem!',
      );

      if (inserted?.id) {
        setTimeout(() => {
          document.getElementById('list-business')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }

      setCurrentView('home');
    } catch (err: any) {
      console.error('[CompleteBusinessProfile]', err);
      toast.error(err?.message || 'Failed to save business profile');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user?.id) return null;

  const copy = {
    title:
      language === 'en'
        ? 'Set up your business'
        : language === 'fr'
          ? 'Configurez votre entreprise'
          : 'Setapem bisnis blong yu',
    subtitle:
      language === 'en'
        ? 'We use this so tourists can reach you and your listings stay consistent.'
        : language === 'fr'
          ? 'Pour que les touristes puissent vous contacter et que vos annonces restent cohérentes.'
          : 'Blong turis i save kontakt yu mo listing i stret.',
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
