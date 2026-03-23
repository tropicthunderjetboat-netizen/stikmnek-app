import React, { useMemo, useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Business } from '@/data/businesses';
import type { User, UserProfile } from '@/contexts/AppContext';
import type { Language } from '@/data/translations';
import { formatVT } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Mail, Phone, Loader2 } from 'lucide-react';

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

/** Digits only for wa.me (international, no leading +). */
function digitsForWaMe(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Display business phone without hiding meaningful characters. */
function formatBusinessPhoneDisplay(phone: string): string {
  return phone.replace(/[^\d+\s()-]/g, '').trim() || phone.trim();
}

export interface BookingInquiryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  business: Business;
  user: User;
  userProfile: UserProfile | null;
  language: Language;
}

const BookingInquiryModal: React.FC<BookingInquiryModalProps> = ({
  open,
  onOpenChange,
  business: biz,
  user,
  userProfile,
  language,
}) => {
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const [visitDate, setVisitDate] = useState(today);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [contactName, setContactName] = useState(user.name || '');
  const [contactEmail, setContactEmail] = useState(user.email || '');
  const [contactWhatsapp, setContactWhatsapp] = useState(userProfile?.phone || '');
  const [message, setMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVisitDate(today);
    setAdults(1);
    setChildren(0);
    setContactName(user.name || '');
    setContactEmail(user.email || '');
    setContactWhatsapp(userProfile?.phone || '');
    setMessage('');
  }, [open, user.name, user.email, userProfile?.phone, today]);

  const totalPax = Math.max(0, adults) + Math.max(0, children);
  const original = Number(biz.originalPrice) || 0;
  const deal = Number(biz.dealPrice) || 0;
  const totalStandard = totalPax > 0 ? original * totalPax : 0;
  const totalDeal = totalPax > 0 ? deal * totalPax : 0;
  const savings = Math.max(0, totalStandard - totalDeal);

  /** Listing email fields (mapped to contactEmail) or claimed listing → edge function can deliver. */
  const hasListingOrOwnerEmailPath =
    Boolean(biz.ownerId) || Boolean(biz.contactEmail && String(biz.contactEmail).trim());

  /** WhatsApp: field present and enough digits for wa.me (min 5). */
  const businessWaDigits = useMemo(() => digitsForWaMe(biz.whatsappNumber || ''), [biz.whatsappNumber]);
  const showWhatsApp = businessWaDigits.length >= 5;

  const businessPhoneRaw = (biz.phone || '').trim();
  const businessPhoneDigits = businessPhoneRaw.replace(/[^\d+]/g, '');
  const showPhone = Boolean(businessPhoneRaw && businessPhoneDigits.length >= 3);
  const businessPhoneDisplay = formatBusinessPhoneDisplay(biz.phone || '');

  const showEmail = hasListingOrOwnerEmailPath;

  const whatsappBookingUrl = useMemo(() => {
    if (!showWhatsApp) return '';
    const userLabel = contactName.trim() || 'a guest';
    const dateLabel = visitDate || '—';
    const paxLabel = totalPax > 0 ? String(totalPax) : '—';
    const priceLabel = formatVT(totalDeal);
    const text = `Hi, I'm ${userLabel} from StikmNek. I'd like to book ${biz.name} for ${dateLabel} with ${paxLabel} people. My calculated StikmNek price is ${priceLabel}.`;
    return `https://wa.me/${businessWaDigits}?text=${encodeURIComponent(text)}`;
  }, [showWhatsApp, businessWaDigits, biz.name, contactName, visitDate, totalPax, totalDeal]);

  const telHref = useMemo(() => {
    if (!showPhone) return '';
    const cleaned = biz.phone!.replace(/[^\d+]/g, '');
    return cleaned ? `tel:${cleaned}` : '';
  }, [showPhone, biz.phone]);

  const copy = {
    titlePrefix:
      language === 'en'
        ? 'Booking inquiry for'
        : language === 'fr'
          ? 'Demande de réservation pour'
          : 'Bukin ask long',
    intro:
      language === 'en'
        ? 'Fill in your visit details and how the business can reach you. Then use the buttons below to contact this business using their own phone, WhatsApp, or listing email.'
        : language === 'fr'
          ? 'Indiquez votre visite et vos coordonnées pour que le commerce puisse vous répondre. Utilisez ensuite les boutons ci-dessous pour joindre ce commerce (téléphone, WhatsApp ou e-mail du commerce).'
          : 'Putum detaels blong visit mo kontakt blong yu. Bihain yusum baten ya blong kolem o WhatsApp o imel blong bisnis.',
    yourDetails:
      language === 'en'
        ? 'Your contact details'
        : language === 'fr'
          ? 'Vos coordonnées'
          : 'Kontakt blong yu',
    yourDetailsHint:
      language === 'en'
        ? 'The business will use these to reply to you.'
        : language === 'fr'
          ? 'Le commerce utilisera ces informations pour vous répondre.'
          : 'Bisnis bae yusum olgeta blong beken long yu.',
    reachBusiness:
      language === 'en'
        ? 'Contact this business'
        : language === 'fr'
          ? 'Contacter ce commerce'
          : 'Kontaktem bisnis',
    reachBusinessHint:
      language === 'en'
        ? 'Uses this listing’s phone, WhatsApp, or email — not your number above.'
        : language === 'fr'
          ? 'Utilise le téléphone, WhatsApp ou l’e-mail de cette fiche — pas vos coordonnées ci-dessus.'
          : 'Yusum fon o WhatsApp o imel blong lisiting — no long namba blong yu.',
    date: language === 'en' ? 'Visit date' : language === 'fr' ? 'Date de visite' : 'Dei blong visit',
    adults: language === 'en' ? 'Adults' : language === 'fr' ? 'Adultes' : 'Ol man',
    children: language === 'en' ? 'Children' : language === 'fr' ? 'Enfants' : 'Pikinini',
    standard: language === 'en' ? 'Total standard price' : language === 'fr' ? 'Prix standard total' : 'Stanad praes',
    stikmnek: language === 'en' ? 'Total StikmNek price' : language === 'fr' ? 'Prix StikmNek total' : 'StikmNek praes',
    save: language === 'en' ? 'Your savings' : language === 'fr' ? 'Vos économies' : 'Sevin blong yu',
    name: language === 'en' ? 'Your name' : language === 'fr' ? 'Votre nom' : 'Nem blong yu',
    email: language === 'en' ? 'Your email' : language === 'fr' ? 'Votre e-mail' : 'Imel blong yu',
    wa: language === 'en' ? 'Your WhatsApp (optional)' : language === 'fr' ? 'Votre WhatsApp (optionnel)' : 'WhatsApp blong yu',
    msg: language === 'en' ? 'Message to the business (optional)' : language === 'fr' ? 'Message au commerce (optionnel)' : 'Mesej long bisnis',
    emailBtn: language === 'en' ? 'Send request by email' : language === 'fr' ? 'Envoyer la demande par e-mail' : 'Send ask long imel',
    waBtn: language === 'en' ? 'Chat on business WhatsApp' : language === 'fr' ? 'WhatsApp du commerce' : 'WhatsApp blong bisnis',
    callBtn: language === 'en' ? 'Call' : language === 'fr' ? 'Appeler' : 'Kolem',
    noContact:
      language === 'en'
        ? 'This listing has no email, WhatsApp, or phone on file. Please try again later.'
        : language === 'fr'
          ? 'Aucun moyen de contact n’est renseigné pour cette fiche.'
          : 'No gat kontakt long lisiting ia.',
    paxHint:
      language === 'en'
        ? 'Enter at least 1 guest to see pricing.'
        : language === 'fr'
          ? 'Indiquez au moins 1 personne pour voir les prix.'
          : 'Putum kasem 1 man long lukim praes.',
  };

  const handleSendEmail = async () => {
    if (totalPax < 1) {
      toast.error(copy.paxHint);
      return;
    }
    if (!contactEmail.trim()) {
      toast.error(language === 'en' ? 'Please enter your email' : 'Entrez votre e-mail');
      return;
    }
    setSendingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          action: 'send_booking_inquiry',
          business_id: biz.id,
          visit_date: visitDate,
          adults,
          children,
          tourist_name: contactName.trim(),
          tourist_email: contactEmail.trim(),
          tourist_whatsapp: contactWhatsapp.trim() || null,
          message: message.trim() || null,
          total_standard_vt: totalStandard,
          total_deal_vt: totalDeal,
          savings_vt: savings,
        },
      });
      if (data && typeof data === 'object' && (data as { success?: boolean }).success) {
        toast.success(
          language === 'en'
            ? 'Request sent! The business will contact you shortly.'
            : language === 'fr'
              ? 'Demande envoyée ! Le commerce vous contactera bientôt.'
              : 'Rikwes i send! Bisnis bae kontakt yu.',
        );
        onOpenChange(false);
        return;
      }
      const failMsg =
        typeof (data as { error?: string } | null)?.error === 'string'
          ? (data as { error: string }).error
          : error?.message || 'Could not send email';
      toast.error(failMsg);
    } catch (e) {
      console.error(e);
      toast.error(language === 'en' ? 'Could not send email' : 'Échec de l’envoi');
    } finally {
      setSendingEmail(false);
    }
  };

  const hasAnyBusinessContact = showEmail || showWhatsApp || showPhone;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-left leading-snug">
            {copy.titlePrefix}{' '}
            <span className="text-teal-700">{biz.name}</span>
          </DialogTitle>
          <DialogDescription className="text-left text-sm">{copy.intro}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          <div className="grid gap-2">
            <Label htmlFor="visit-date">{copy.date}</Label>
            <Input
              id="visit-date"
              type="date"
              min={today}
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="adults">{copy.adults}</Label>
              <Input
                id="adults"
                type="number"
                min={0}
                value={adults}
                onChange={(e) => setAdults(Math.max(0, parseInt(e.target.value, 10) || 0))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="children">{copy.children}</Label>
              <Input
                id="children"
                type="number"
                min={0}
                value={children}
                onChange={(e) => setChildren(Math.max(0, parseInt(e.target.value, 10) || 0))}
              />
            </div>
          </div>

          {totalPax < 1 ? (
            <p className="text-sm text-amber-700">{copy.paxHint}</p>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-gray-600">{copy.standard}</span>
                <span className="font-semibold tabular-nums">{formatVT(totalStandard)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-600">{copy.stikmnek}</span>
                <span className="font-semibold tabular-nums text-teal-700">{formatVT(totalDeal)}</span>
              </div>
              <div className="flex justify-between gap-2 pt-1 border-t border-gray-200">
                <span className="text-gray-800 font-medium">{copy.save}</span>
                <span className="font-bold tabular-nums text-emerald-600">{formatVT(savings)}</span>
              </div>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">{copy.yourDetails}</p>
              <p className="text-xs text-gray-500 mt-0.5">{copy.yourDetailsHint}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="inquiry-name">{copy.name}</Label>
              <Input id="inquiry-name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inquiry-email">{copy.email}</Label>
              <Input
                id="inquiry-email"
                type="email"
                autoComplete="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inquiry-wa">{copy.wa}</Label>
              <Input
                id="inquiry-wa"
                type="tel"
                autoComplete="tel"
                placeholder={language === 'en' ? '+678 …' : '+678 …'}
                value={contactWhatsapp}
                onChange={(e) => setContactWhatsapp(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inquiry-msg">{copy.msg}</Label>
              <textarea
                id="inquiry-msg"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4 space-y-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">{copy.reachBusiness}</p>
              <p className="text-xs text-gray-500 mt-0.5">{copy.reachBusinessHint}</p>
            </div>

            {!hasAnyBusinessContact ? (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3">{copy.noContact}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {showEmail && (
                  <Button
                    type="button"
                    className="w-full justify-center gap-2 bg-teal-600 hover:bg-teal-700 h-auto min-h-10 py-2.5 px-3"
                    disabled={sendingEmail || totalPax < 1}
                    onClick={handleSendEmail}
                  >
                    {sendingEmail ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Mail className="h-4 w-4 shrink-0" />}
                    <span className="text-left leading-tight">{copy.emailBtn}</span>
                  </Button>
                )}
                {showWhatsApp && whatsappBookingUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-center gap-2 border-green-600 text-green-800 hover:bg-green-50 h-auto min-h-10 py-2.5 px-3"
                    asChild
                  >
                    <a href={whatsappBookingUrl} target="_blank" rel="noopener noreferrer">
                      <WhatsAppIcon className="h-4 w-4 shrink-0" />
                      <span className="text-left leading-tight">{copy.waBtn}</span>
                    </a>
                  </Button>
                )}
                {showPhone && telHref && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-center gap-2 h-auto min-h-10 py-2.5 px-3"
                    asChild
                  >
                    <a href={telHref}>
                      <Phone className="h-4 w-4 shrink-0" />
                      <span className="text-left leading-tight">
                        {copy.callBtn} <span className="font-semibold text-gray-900">{businessPhoneDisplay}</span>
                      </span>
                    </a>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BookingInquiryModal;
