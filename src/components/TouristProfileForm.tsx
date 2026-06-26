import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, Users, Building2, Phone, Mail, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Language } from '@/data/translations';
import type { UserProfile } from '@/contexts/AppContext';

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
  /** Auth email fallback when profile row has no email yet */
  accountEmail?: string | null;
  /** Auth/display name fallback when profile row has no name yet */
  accountName?: string | null;
  /** Seeds party counts, contact prefs, resort, and contact detail fields */
  userProfile?: UserProfile | null;
}

const TouristProfileForm: React.FC<TouristProfileFormProps> = ({
  userId,
  language,
  onSuccess,
  onSkip,
  embedded,
  hideTitle,
  accountEmail,
  accountName,
  userProfile,
}) => {
  const [fullName, setFullName] = useState('');
  const [numAdults, setNumAdults] = useState(1);
  const [numChildren, setNumChildren] = useState(0);
  const [numInfants, setNumInfants] = useState(0);
  const [preferredContact, setPreferredContact] = useState<PreferredContact>('email');
  const [resortName, setResortName] = useState('');
  const [expectedArrivalDate, setExpectedArrivalDate] = useState('');
  const [expectedDepartureDate, setExpectedDepartureDate] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactWhatsapp, setContactWhatsapp] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const p = userProfile;
    if (!p) {
      setFullName((accountName || '').trim());
      setContactEmail((accountEmail || '').trim());
      setContactWhatsapp('');
      setContactPhone('');
      setExpectedArrivalDate('');
      setExpectedDepartureDate('');
      return;
    }
    setFullName((p.full_name || p.name || p.display_name || accountName || '').trim());
    setNumAdults(p.num_adults ?? 1);
    setNumChildren(p.num_children ?? 0);
    setNumInfants(p.num_infants ?? 0);
    const method = (p.preferred_contact_method || 'email') as PreferredContact;
    setPreferredContact(['email', 'whatsapp', 'phone'].includes(method) ? method : 'email');
    setResortName((p.resort_name || '').trim());
    setExpectedArrivalDate(p.expected_arrival_date ? String(p.expected_arrival_date).slice(0, 10) : '');
    setExpectedDepartureDate(p.expected_departure_date ? String(p.expected_departure_date).slice(0, 10) : '');
    setContactEmail((p.email || accountEmail || '').trim());
    setContactWhatsapp((p.whatsapp_number || '').trim() || (p.phone || '').trim());
    setContactPhone((p.phone || '').trim());
  }, [userProfile, accountEmail, accountName]);

  const t = {
    title:
      language === 'en'
        ? 'Complete your traveller profile'
        : language === 'fr'
          ? 'Complétez votre profil voyageur'
          : 'Namba blong ol man (13 yia mo antap)',
    subtitle:
      language === 'en'
        ? 'Help us tailor deals and reach you the way you prefer.'
        : language === 'fr'
          ? 'Aidez-nous à personnaliser les offres et à vous joindre comme vous préférez.'
          : 'Namba blong pikinini (5–12)',
    adults:
      language === 'en'
        ? 'Number of adults (13 yrs and above)'
        : language === 'fr'
          ? 'Nombre d’adultes (13 ans et plus)'
          : 'Namba blong smol pikinini (0–4)',
    children:
      language === 'en'
        ? 'Number of children (5–12 years)'
        : language === 'fr'
          ? 'Nombre d’enfants (5–12 ans)'
          : 'Wei blong kontakt',
    infants:
      language === 'en'
        ? 'Number of infants (0–4 years)'
        : language === 'fr'
          ? 'Nombre de bébés (0–4 ans)'
          : 'Putum detels blong we yu laikem blong oli save kontaktem u long hem.',
    contact:
      language === 'en'
        ? 'Preferred contact method'
        : language === 'fr'
          ? 'Moyen de contact préféré'
          : 'Imel blong yu',
    contactHint:
      language === 'en'
        ? 'Enter the details for how you prefer to be reached.'
        : language === 'fr'
          ? 'Saisissez les coordonnées pour votre moyen de contact choisi.'
          : 'Namba WhatsApp blong yu',
    emailLabel:
      language === 'en' ? 'Your email' : language === 'fr' ? 'Votre e-mail' : 'Fon namba blong yu',
    waLabel:
      language === 'en' ? 'Your WhatsApp number' : language === 'fr' ? 'Votre numéro WhatsApp' : 'Wea yu stap? (Nem blong resot)',
    phoneLabel:
      language === 'en' ? 'Your phone number' : language === 'fr' ? 'Votre numéro de téléphone' : 'Ful nem',
    resort:
      language === 'en'
        ? 'Where are you staying? (Resort name)'
        : language === 'fr'
          ? 'Où séjournez-vous ? (nom de l’hôtel/résidence)'
          : 'Dei blong kam',
    fullName:
      language === 'en'
        ? 'Full name'
        : language === 'fr'
          ? 'Nom complet'
          : 'Dei blong lego ples ia',
    arrival:
      language === 'en'
        ? 'Expected arrival date'
        : language === 'fr'
          ? 'Date d’arrivée prévue'
          : 'Sevem profael',
    departure:
      language === 'en'
        ? 'Expected departure date'
        : language === 'fr'
          ? 'Date de départ prévue'
          : 'Biaen',
    submit:
      language === 'en' ? 'Save profile' : language === 'fr' ? 'Enregistrer' : 'Plis putum ful nem.',
    skip: language === 'en' ? 'Later' : language === 'fr' ? 'Plus tard' : 'Plis selektem dei blong kam.',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const emailTrim = contactEmail.trim();
      const waTrim = contactWhatsapp.trim();
      const phoneTrim = contactPhone.trim();
      const nameTrim = fullName.trim();

      if (!nameTrim) {
        toast.error(language === 'en' ? 'Please enter your full name.' : language === 'fr' ? 'Entrez votre nom.' : 'Plis selektem dei blong aot');
        return;
      }
      if (preferredContact === 'email' && !emailTrim) {
        toast.error(language === 'en' ? 'Please enter your email.' : 'Entrez votre e-mail.');
        return;
      }
      if (preferredContact === 'whatsapp' && !waTrim) {
        toast.error(
          language === 'en' ? 'Please enter your WhatsApp number.' : 'Entrez votre numéro WhatsApp.',
        );
        return;
      }
      if (preferredContact === 'phone' && !phoneTrim) {
        toast.error(language === 'en' ? 'Please enter your phone number.' : 'Entrez votre numéro.');
        return;
      }

      if (!expectedArrivalDate) {
        toast.error(language === 'en' ? 'Please select your arrival date.' : language === 'fr' ? 'Sélectionnez votre date d’arrivée.' : 'Dei blong aot i mas biaen o semak long dei blong kam.');
        return;
      }
      if (!expectedDepartureDate) {
        toast.error(language === 'en' ? 'Please select your departure date.' : language === 'fr' ? 'Sélectionnez votre date de départ.' : 'Profil i sev!');
        return;
      }
      if (expectedDepartureDate < expectedArrivalDate) {
        toast.error(
          language === 'en'
            ? 'Departure date must be on or after your arrival date.'
            : language === 'fr'
              ? 'La date de départ doit être après la date d’arrivée.'
              : 'Websaet',
        );
        return;
      }

      const { error } = await supabase
        .from('user_profiles')
        .update({
          name: nameTrim,
          full_name: nameTrim,
          display_name: nameTrim,
          num_adults: Math.max(0, numAdults),
          num_children: Math.max(0, numChildren),
          num_infants: Math.max(0, numInfants),
          preferred_contact_method: preferredContact,
          resort_name: resortName.trim() || null,
          expected_arrival_date: expectedArrivalDate || null,
          expected_departure_date: expectedDepartureDate || null,
          onboarding_complete: true,
          post_pass_profile_completed: true,
          updated_at: new Date().toISOString(),
          email: emailTrim || null,
          whatsapp_number: waTrim || null,
          phone: phoneTrim || '',
        })
        .eq('user_id', userId);

      if (error) throw error;
      toast.success(language === 'en' ? 'Profile saved!' : language === 'fr' ? 'Profil enregistré !' : 'Website blong yu — no nid taep https');
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const contactFields = (
    <div className="grid gap-2 rounded-lg border border-gray-100 bg-gray-50/80 p-3">
      <p className="text-xs text-gray-600">{t.contactHint}</p>
      {preferredContact === 'email' && (
        <div className="grid gap-2">
          <Label htmlFor="tp-email">{t.emailLabel}</Label>
          <Input
            id="tp-email"
            type="email"
            autoComplete="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder={language === 'en' ? 'you@example.com' : ''}
          />
        </div>
      )}
      {preferredContact === 'whatsapp' && (
        <div className="grid gap-2">
          <Label htmlFor="tp-wa">{t.waLabel}</Label>
          <Input
            id="tp-wa"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={contactWhatsapp}
            onChange={(e) => setContactWhatsapp(e.target.value)}
            placeholder={language === 'en' ? 'e.g. +678 12345' : ''}
          />
        </div>
      )}
      {preferredContact === 'phone' && (
        <div className="grid gap-2">
          <Label htmlFor="tp-phone">{t.phoneLabel}</Label>
          <Input
            id="tp-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder={language === 'en' ? 'e.g. +678 12345' : ''}
          />
        </div>
      )}
    </div>
  );

  const inner = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="tp-full-name">{t.fullName}</Label>
        <Input
          id="tp-full-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={language === 'en' ? 'e.g. Jane Smith' : ''}
          autoComplete="name"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="tp-adults">{t.adults}</Label>
        <Input
          id="tp-adults"
          type="number"
          min={1}
          max={99}
          value={numAdults}
          onChange={(e) => setNumAdults(Math.max(1, parseInt(e.target.value, 10) || 1))}
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

      {contactFields}

      <div className="grid gap-2">
        <Label htmlFor="tp-resort">{t.resort}</Label>
        <Input
          id="tp-resort"
          value={resortName}
          onChange={(e) => setResortName(e.target.value)}
          placeholder={language === 'en' ? 'e.g. Iririki Island Resort' : ''}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="tp-arrival">{t.arrival}</Label>
          <Input
            id="tp-arrival"
            type="date"
            value={expectedArrivalDate}
            onChange={(e) => setExpectedArrivalDate(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tp-departure">{t.departure}</Label>
          <Input
            id="tp-departure"
            type="date"
            value={expectedDepartureDate}
            onChange={(e) => setExpectedDepartureDate(e.target.value)}
          />
        </div>
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
