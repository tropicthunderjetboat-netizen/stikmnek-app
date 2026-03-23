import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, Users, Building2, Phone, Mail, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Language } from '@/data/translations';

export type PreferredContact = 'email' | 'whatsapp' | 'phone';

export interface TouristProfileFormProps {
  userId: string;
  language: Language;
  onSuccess: () => void;
  onSkip?: () => void;
  /** When true, render without outer card (caller uses inside Dialog) */
  embedded?: boolean;
  /** Hide the built-in title block (e.g. when Dialog supplies the title) */
  hideTitle?: boolean;
}

const TouristProfileForm: React.FC<TouristProfileFormProps> = ({
  userId,
  language,
  onSuccess,
  onSkip,
  embedded,
  hideTitle,
}) => {
  const [numAdults, setNumAdults] = useState(1);
  const [numChildren, setNumChildren] = useState(0);
  const [numInfants, setNumInfants] = useState(0);
  const [preferredContact, setPreferredContact] = useState<PreferredContact>('email');
  const [resortName, setResortName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const t = {
    title:
      language === 'en'
        ? 'Complete your traveller profile'
        : language === 'fr'
          ? 'Complétez votre profil voyageur'
          : 'Komplitim profil blong yu',
    subtitle:
      language === 'en'
        ? 'Help us tailor deals and reach you the way you prefer.'
        : language === 'fr'
          ? 'Aidez-nous à personnaliser les offres et à vous joindre comme vous préférez.'
          : 'Helpem mifala blong givim dils mo kontakt yu long we yu laik.',
    adults:
      language === 'en'
        ? 'Number of adults (13 yrs and above)'
        : language === 'fr'
          ? 'Nombre d’adultes (13 ans et plus)'
          : 'Namba blong ol man (13 yia mo antap)',
    children:
      language === 'en'
        ? 'Number of children (5–12 years)'
        : language === 'fr'
          ? 'Nombre d’enfants (5–12 ans)'
          : 'Namba blong pikinini (5–12)',
    infants:
      language === 'en'
        ? 'Number of infants (0–4 years)'
        : language === 'fr'
          ? 'Nombre de bébés (0–4 ans)'
          : 'Namba blong smol pikinini (0–4)',
    contact:
      language === 'en'
        ? 'Preferred contact method'
        : language === 'fr'
          ? 'Moyen de contact préféré'
          : 'We blong kontakt',
    resort:
      language === 'en'
        ? 'Where are you staying? (Resort name)'
        : language === 'fr'
          ? 'Où séjournez-vous ? (nom de l’hôtel/résidence)'
          : 'We yu stap? (Nem blong resot)',
    submit:
      language === 'en' ? 'Save profile' : language === 'fr' ? 'Enregistrer' : 'Sevem profil',
    skip: language === 'en' ? 'Later' : language === 'fr' ? 'Plus tard' : 'Bihain',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          num_adults: Math.max(0, numAdults),
          num_children: Math.max(0, numChildren),
          num_infants: Math.max(0, numInfants),
          preferred_contact_method: preferredContact,
          resort_name: resortName.trim() || null,
          post_pass_profile_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) throw error;
      toast.success(language === 'en' ? 'Profile saved!' : language === 'fr' ? 'Profil enregistré !' : 'Profil i sevem!');
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const inner = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="tp-adults">{t.adults}</Label>
        <Input
          id="tp-adults"
          type="number"
          min={0}
          max={99}
          value={numAdults}
          onChange={(e) => setNumAdults(Math.max(0, parseInt(e.target.value, 10) || 0))}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="tp-children">{t.children}</Label>
          <Input
            id="tp-children"
            type="number"
            min={0}
            max={99}
            value={numChildren}
            onChange={(e) => setNumChildren(Math.max(0, parseInt(e.target.value, 10) || 0))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tp-infants">{t.infants}</Label>
          <Input
            id="tp-infants"
            type="number"
            min={0}
            max={99}
            value={numInfants}
            onChange={(e) => setNumInfants(Math.max(0, parseInt(e.target.value, 10) || 0))}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-medium text-gray-900">{t.contact}</span>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: 'email' as const, icon: Mail, label: 'Email' },
              { key: 'whatsapp' as const, icon: MessageCircle, label: 'WhatsApp' },
              { key: 'phone' as const, icon: Phone, label: 'Phone' },
            ]
          ).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setPreferredContact(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                preferredContact === key
                  ? 'border-teal-600 bg-teal-50 text-teal-800'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="tp-resort">{t.resort}</Label>
        <Input
          id="tp-resort"
          value={resortName}
          onChange={(e) => setResortName(e.target.value)}
          placeholder={language === 'en' ? 'e.g. Iririki Island Resort' : ''}
        />
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <Button type="submit" disabled={submitting} className="w-full bg-teal-600 hover:bg-teal-700">
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              …
            </>
          ) : (
            t.submit
          )}
        </Button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            {t.skip}
          </button>
        )}
      </div>
    </form>
  );

  if (embedded) {
    return (
      <div className="space-y-4">
        {!hideTitle && (
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-teal-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{t.title}</h3>
              <p className="text-sm text-gray-600 mt-0.5">{t.subtitle}</p>
            </div>
          </div>
        )}
        {inner}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-6 shadow-sm">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center">
          <Building2 className="w-6 h-6 text-teal-700" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">{t.title}</h3>
          <p className="text-sm text-gray-600 mt-1">{t.subtitle}</p>
        </div>
      </div>
      {inner}
    </div>
  );
};

export default TouristProfileForm;
