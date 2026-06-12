import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import {
  BASE_PRICE_AUD,
  EXTEND_FEE_AUD,
  GUEST_FEE_AUD,
  MAX_PARTY_SIZE,
  SEVENTH_GUEST_HEAD_CHARGE_AUD,
} from '@/data/pricing';
import { SUPPORT_EMAIL, supportMailtoUrl } from '@/data/contact';
import {
  HelpCircle, Book, Store, Shield, Users, ChevronDown, ChevronRight,
  Search, ArrowLeft, MapPin, CreditCard, QrCode, Star, Camera,
  BarChart3, Mail, Phone, MessageSquare, Ticket, Globe, Clock,
  CheckCircle, AlertCircle, Lightbulb, Zap, FileText, ExternalLink
} from 'lucide-react';

type HelpSection = 'overview' | 'tourist-faq' | 'business-guide' | 'admin-manual' | 'quick-start' | 'troubleshooting';

interface FAQItem {
  question: string;
  answer: string;
  icon?: React.ReactNode;
}

interface HelpCenterProps {
  initialSection?: HelpSection;
}

const HelpCenter: React.FC<HelpCenterProps> = ({ initialSection }) => {
  const { language, setCurrentView, user } = useAppContext();
  const [activeSection, setActiveSection] = useState<HelpSection>(initialSection ?? 'overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);

  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
      setExpandedFAQ(null);
    }
  }, [initialSection]);

  const passProductSummary = useMemo(
    () =>
      `StikmNek Pass (AUD): $${BASE_PRICE_AUD} first person (ages 6+), $${GUEST_FEE_AUD} each for guests 2–6, $${SEVENTH_GUEST_HEAD_CHARGE_AUD} for the 7th, then $${GUEST_FEE_AUD} each up to ${MAX_PARTY_SIZE} per pass; 24-hour day pass or 7-day holiday pass (+$${EXTEND_FEE_AUD} for the holiday period)`,
    [],
  );

  const helpLang = language === 'fr' ? 'fr' : language === 'bi' ? 'bi' : 'en';

  const howItWorksSteps = useMemo(() => {
    return [
      { step: '1', title: 'Create an Account', desc: 'Sign up as a tourist or business owner' },
      {
        step: '2',
        title: t('passSelection.title', helpLang),
        desc: `Open Passes, set your group (ages 6+, up to ${MAX_PARTY_SIZE} per pass), choose 24-hour or 7-day holiday access, pick a start date, and pay (tiered: $${BASE_PRICE_AUD} first, $${GUEST_FEE_AUD} for 2–6, $${SEVENTH_GUEST_HEAD_CHARGE_AUD} on 7th, then $${GUEST_FEE_AUD} each; +$${EXTEND_FEE_AUD} holiday period). PayPal or card where enabled.`,
      },
      { step: '3', title: 'Browse Deals', desc: 'Explore dining, tours, activities, transportation, spa, shopping, and accommodation on Deals and Map' },
      { step: '4', title: 'Show Your QR Code', desc: 'Present your pass QR code at a partner business; staff scan it in StikmNek' },
      { step: '5', title: 'Save Money', desc: 'Discounts follow each listing (deal price vs standard price)' },
    ];
  }, [helpLang]);

  const touristFAQ: FAQItem[] = useMemo(
    () => [
      {
        question: 'What is StikmNek?',
        answer: `StikmNek is a tourist discount platform for Vanuatu. You buy a digital pass (prices in Australian dollars), then show your pass QR code at partner restaurants, tours, activities, spas, and accommodation. Current pass types: ${passProductSummary}.`,
        icon: <HelpCircle className="w-4 h-4" />,
      },
      {
        question: 'How do I purchase a pass?',
        answer: `Open Passes in the top menu, set your group and 24-hour or 7-day holiday duration (${passProductSummary}), pick a start date, and complete payment (card or PayPal where enabled). Your pass coverage follows the dates shown at checkout. Prices are in AUD.`,
        icon: <CreditCard className="w-4 h-4" />,
      },
      {
        question: 'How do I redeem a deal?',
        answer:
          'Visit a partner business while your pass is valid, open your pass QR code in the app, and staff scan it with their StikmNek scanner. The savings shown for that listing are applied as part of the redemption.',
        icon: <QrCode className="w-4 h-4" />,
      },
      {
        question: 'Can I use my pass at multiple businesses?',
        answer:
          'Yes. You can visit different partner businesses while your pass is active, and you may return to the same venue more than once on the same day (for example breakfast and later happy hour) as long as your pass is valid and each redemption is recorded by staff when you use the deal.',
        icon: <Store className="w-4 h-4" />,
      },
      {
        question: 'What if a business is closed?',
        answer:
          'Check the hours on the deal card and business detail page. Use Map to browse by area; when you allow location, the map can help with distance.',
        icon: <Clock className="w-4 h-4" />,
      },
      {
        question: 'Can I get a refund?',
        answer:
          'Passes are non-refundable once activated or as set out in our terms. If something went wrong with payment or access, email support and we will help where we can.',
        icon: <CreditCard className="w-4 h-4" />,
      },
      {
        question: 'How do I leave a review?',
        answer:
          'Open the business from Deals or Map, go to the reviews section. You can submit a review within 30 days of a StikmNek redemption at that business (the app checks this). Rate 1–5 stars and add a short comment.',
        icon: <Star className="w-4 h-4" />,
      },
      {
        question: 'Is my payment secure?',
        answer:
          "Yes. Checkout runs through PayPal's secure flow. We do not store your card number on StikmNek servers.",
        icon: <Shield className="w-4 h-4" />,
      },
      {
        question: 'Can I use StikmNek offline?',
        answer:
          'You need the internet to buy a pass and browse deals. For redemption, keep your phone charged; a screenshot of your QR can help if signal is weak, but the latest pass screen in the app is best.',
        icon: <Globe className="w-4 h-4" />,
      },
      {
        question: 'How do I find deals near me?',
        answer:
          'Use Map and allow location if you want to centre the map on you and filter by distance. You can also browse Deals by category and favourites without turning location on.',
        icon: <MapPin className="w-4 h-4" />,
      },
    ],
    [passProductSummary],
  );

  const sections: { key: HelpSection; label: string; icon: React.ReactNode; description: string }[] = [
    { key: 'overview', label: 'Getting Started', icon: <Zap className="w-5 h-5" />, description: 'Learn the basics of StikmNek' },
    { key: 'tourist-faq', label: 'Tourist FAQ', icon: <Users className="w-5 h-5" />, description: 'Common questions from travelers' },
    { key: 'business-guide', label: 'Business Owner Guide', icon: <Store className="w-5 h-5" />, description: 'Complete guide for business owners' },
    { key: 'admin-manual', label: 'Admin Operations', icon: <Shield className="w-5 h-5" />, description: 'Admin panel operations manual' },
    { key: 'quick-start', label: 'Quick Start Guide', icon: <Lightbulb className="w-5 h-5" />, description: 'For new beta businesses' },
    { key: 'troubleshooting', label: 'Troubleshooting', icon: <AlertCircle className="w-5 h-5" />, description: 'Fix common issues' },
  ];

  const businessGuide: { title: string; content: string; steps?: string[] }[] = [
    {
      title: '1. Create your business account',
      content:
        'You need an account so StikmNek knows who owns your listing and so you can open your Business Hub.',
      steps: [
        'Tap or click Sign In at the top of the website.',
        'Choose Sign Up, then pick Business (not Tourist).',
        'Enter your name, email, and a password you can remember.',
        'Check your email and confirm your account if asked — otherwise you may not be able to sign in.',
        'Sign in again. As a business user you are taken to your Business Hub (you can also use My Business in the top menu anytime).',
        'On your phone, tap Save on the “Add to Home Screen” banner when it appears — this opens the scanner faster next time.',
      ],
    },
    {
      title: '2. Business Hub — where everything lives',
      content:
        'After you sign in, your Business Hub is the sidebar area titled “Business Hub”. The menu names below are the exact labels you will see.',
      steps: [
        'Overview — Summary, redemptions, quick actions, and open the QR scanner.',
        'Business Profile — Your business identity: name, category, map pin, logo, and contact details (complete this after your first listing is approved).',
        'My credentials — Optional insurance, permits, association docs, and first-aid certificates (see section 5).',
        'My Submissions — Listings waiting for approval or returned for changes.',
        'Edit Listing — Change description, prices, contact, WhatsApp, etc. (after that listing is approved).',
        'Analytics, Reviews, Photos, Emails — Tabs for those tasks.',
        'New Listing — Submit another business or deal.',
        'If you have more than one live deal, use the listing picker at the top of Edit Listing, Analytics, Reviews, or Photos.',
      ],
    },
    {
      title: '3. Submit a listing and follow approval',
      content:
        'New listings are checked by the StikmNek team before tourists see them. All prices are in Vanuatu vatu (VT).',
      steps: [
        'Open New Listing in the sidebar.',
        'Fill in name, category, description, discount wording, location, phone, hours, and optional WhatsApp.',
        'Enter original price (normal walk-in) and StikmNek deal price in VT — the deal price must be lower than the original.',
        'Choose how long your discount runs (start date and listing duration).',
        'Tours and activities: use tiered pricing — Adults, Children, optional Infants, and optional Private charter rows. Each tier has a standard VT price and a lower StikmNek VT price.',
        'Upload clear photos (good light, show what you sell).',
        'Submit for approval.',
        'Watch My Submissions for status (pending / approved / needs changes). When approved, your deal can appear on the map and deals list.',
      ],
    },
    {
      title: '4. Business Profile (after approval)',
      content:
        'Once a listing is approved, complete your Business Profile so tourists trust you on the map.',
      steps: [
        'Open Business Profile in the sidebar.',
        'Set your business name, category, phone, email, and hours.',
        'Tap the map to drop your pin — tourists use this to find you.',
        'Upload your logo if you have one.',
        'Save. This profile applies to your whole business, not just one deal row.',
      ],
    },
    {
      title: '5. My credentials (optional trust badges)',
      content:
        'Credentials are optional but help tourists see you are professional. Verified items can improve your rank on the StikmNek leaderboard. Tourists see verified badges on your listing — not your private documents.',
      steps: [
        'Open My credentials in the sidebar (available after your business profile exists).',
        'Upload any that apply: Tourism permit, Public liability insurance, Association credentials, First aid certificate (guides/drivers — include completion date).',
        'Accepted formats: PDF or image (JPEG, PNG, WebP).',
        'Tap Save credentials. The StikmNek team reviews uploads and marks them verified.',
        'If you replace a document, it must be verified again.',
        'Markets and small shops without insurance can skip this section — it is not required to list.',
      ],
    },
    {
      title: '6. QR Scanner — verify a pass and charge the right amount',
      content:
        'When someone wants your StikmNek discount, they show a QR code from their pass. You scan inside StikmNek — no separate scanner app. The screen shows how much to charge in VT (the StikmNek deal total), with tourist savings shown smaller underneath.',
      steps: [
        'In the Business Hub, open Overview or tap the floating Scan button.',
        'Allow camera access when the browser asks.',
        'Ask the guest to brighten their screen and hold the QR steady.',
        'The app shows whether the pass is valid and how many people (ages 6+) the pass covers.',
        'If you have several listings, pick the correct deal when asked.',
        'Tours and activities: enter how many adults, children (6+), and infants (under 6, usually free) are on this visit.',
        'Shops and retail (per-item deals): enter the number of items in this purchase — separate from people on the pass.',
        'Check Amount to charge (VT) — that is what the tourist pays you. Tourist saves (VT) is shown smaller for reference.',
        'Tap Confirm redemption. The visit is recorded with the correct tiered or flat pricing.',
        'If scanning fails: brighter screen, wipe the lens, or use manual code entry on the scanner screen.',
      ],
    },
    {
      title: '7. After approval — listing on/off and daily use',
      content:
        'Once a listing is approved, you control whether tourists still see it on the map and deals list.',
      steps: [
        'Use Overview for a snapshot: redemptions, summaries, and shortcuts.',
        'Active / Inactive (under Edit Listing) hides or shows your listing to tourists immediately — no need to wait for admin.',
        'Changes to text, prices, photos, and tiered pricing in Edit Listing (except that on/off switch) usually go through admin review before they appear publicly.',
      ],
    },
    {
      title: '8. Edit Listing (what changes and what waits for review)',
      content:
        'Keeping information accurate helps tourists trust your business.',
      steps: [
        'Open Edit Listing. Use the tabs: Basic Info, Pricing, Contact, Preview.',
        'Update description, tags, location, discount label, flat or tiered VT prices, phone, hours, and WhatsApp as needed.',
        'Submit changes for review. You may see a pending edit notice until an admin approves.',
        'Use Discard all or Reset section if you change your mind before submitting.',
      ],
    },
    {
      title: '9. Photos, reviews, emails, and analytics',
      content:
        'These tabs help you look professional and stay informed.',
      steps: [
        'Photos — Add gallery images; follow any moderation rules shown in the hub.',
        'Reviews — Read tourist feedback and reply politely. Tourists can review within 30 days of a redemption at your business.',
        'Emails — See messages StikmNek sent you (e.g. listing live, reminders).',
        'Analytics — Redemptions and trends over time (for approved listings).',
      ],
    },
    {
      title: '10. Need help?',
      content:
        `If something is confusing or broken, email ${SUPPORT_EMAIL} with your business name and a screenshot if possible. We aim to reply within one business day.`,
    },
  ];

  const adminManual: { title: string; content: string; steps?: string[] }[] = [
    {
      title: 'Accessing the Admin Panel',
      content: 'The admin panel is accessible to users with admin privileges. Navigate to the Admin section from the main navigation.',
    },
    {
      title: 'Reviewing Business Submissions',
      content: 'New business submissions appear in the Pending tab.',
      steps: [
        'Review the business details, photos, and discount offer',
        'Check for completeness and accuracy of information',
        'Approve listings that meet quality standards',
        'Reject with clear notes explaining what needs improvement',
        'Approved businesses go live immediately on the platform',
      ],
    },
    {
      title: 'Managing Edit Requests',
      content: 'Business owners can submit edit requests for their listings.',
      steps: [
        'Review pending edits in the Edits tab',
        'Compare proposed changes with current listing data',
        'Approve changes that are accurate and appropriate',
        'Reject with notes if changes need revision',
      ],
    },
    {
      title: 'Photo Moderation',
      content: 'Review uploaded photos for quality and appropriateness.',
      steps: [
        'Check the Photos tab for pending photo reviews',
        'Ensure photos are high quality and relevant to the business',
        'Remove any inappropriate or low-quality images',
        'Set featured photos for highlighted listings',
      ],
    },
    {
      title: 'Monitoring System Health',
      content: 'Keep the platform running smoothly.',
      steps: [
        'Check error logs regularly for recurring issues',
        `Respond to support email (${SUPPORT_EMAIL}) promptly`,
        'Track email delivery rates and fix any failures',
      ],
    },
  ];

  const troubleshooting: FAQItem[] = [
    {
      question: 'I am a business: the scanner will not open or the camera is blocked',
      answer:
        'Use Chrome or Safari on your phone, open StikmNek, go to My Business (Business Hub), then Overview or the Scan button. When the browser asks for camera permission, tap Allow. If you denied it earlier, open the site settings for StikmNek and turn the camera back on. Good lighting on the guest’s phone helps.',
      icon: <QrCode className="w-4 h-4" />,
    },
    {
      question: 'I am a business: my listing edits are not showing on the public site',
      answer:
        'Most changes in Edit Listing are sent for admin review first — check for a “pending edit” message in the hub. Turning the listing Active or Inactive is different: that updates immediately. If you only just submitted changes, wait for approval.',
      icon: <Store className="w-4 h-4" />,
    },
    {
      question: 'I am a business: I cannot find Edit Listing or Analytics',
      answer:
        'Those tabs are available after your listing is approved. Until then, use My Submissions and New Listing. Pick your approved listing under “Your Businesses” in the sidebar if you have more than one.',
      icon: <AlertCircle className="w-4 h-4" />,
    },
    {
      question: 'It says I already redeemed at this business today',
      answer:
        'Older versions of the app blocked a second scan at the same venue on the same day. That limit has been removed so you can use your pass again the same day (each visit still needs a fresh scan). Update the app or ask staff to try again. If the message persists, contact support with your account email.',
      icon: <AlertCircle className="w-4 h-4" />,
    },
    { question: 'My QR code is not scanning', answer: 'Ensure your screen brightness is at maximum. Try zooming in on the QR code. If the issue persists, take a screenshot and show it to the business. You can also try refreshing the page to regenerate the QR code.' },
    { question: 'Payment failed or was declined', answer: 'Check your PayPal account has sufficient funds. Ensure your PayPal account is verified. Try a different payment method within PayPal. If the issue persists, contact PayPal support or try again later.' },
    { question: 'I cannot see my purchased pass', answer: 'Go to your Dashboard and check the "My Pass" section. If your pass does not appear, try signing out and signing back in. Ensure the pass start date has arrived - passes activate on the selected date.' },
    { question: 'Business listing not appearing after approval', answer: 'It may take a few minutes for the listing to appear. Try refreshing the page. If it still does not show, check the Business Dashboard to confirm the approval status.' },
    { question: 'Cannot upload photos', answer: 'Ensure your photos are in PNG or JPG format and under 5MB each. Check your internet connection. Try a different browser if the issue persists.' },
    { question: 'Location services not working', answer: 'Enable location permissions in your browser settings. On mobile, ensure GPS is turned on. Try refreshing the page after enabling location services.' },
    { question: 'Email notifications not arriving', answer: 'Check your spam/junk folder. Ensure your email address is correct in your profile. Check your email preferences in the dashboard to ensure notifications are enabled.' },
    { question: 'Page is loading slowly', answer: 'Check your internet connection. Try clearing your browser cache. Disable browser extensions that might interfere. Try using a different browser.' },
  ];

  const filteredTouristFAQ = touristFAQ.filter(item =>
    !searchQuery || item.question.toLowerCase().includes(searchQuery.toLowerCase()) || item.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTroubleshooting = troubleshooting.filter(item =>
    !searchQuery || item.question.toLowerCase().includes(searchQuery.toLowerCase()) || item.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderFAQList = (items: FAQItem[]) => (
    <div className="space-y-3">
      {items.map((item, idx) => {
        const key = `${activeSection}-${idx}`;
        const isExpanded = expandedFAQ === key;
        return (
          <div key={key} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-teal-200 transition-colors">
            <button
              onClick={() => setExpandedFAQ(isExpanded ? null : key)}
              className="w-full flex items-center gap-3 p-4 text-left"
              aria-expanded={isExpanded}
            >
              {item.icon && <span className="text-teal-500 flex-shrink-0">{item.icon}</span>}
              <span className="flex-1 text-sm font-semibold text-gray-900">{item.question}</span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
            {isExpanded && (
              <div className="px-4 pb-4 pt-0">
                <div className="pl-7 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                  {item.answer}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {items.length === 0 && (
        <div className="text-center py-12">
          <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No results found for "{searchQuery}"</p>
        </div>
      )}
    </div>
  );

  const renderGuide = (items: { title: string; content: string; steps?: string[] }[]) => (
    <div className="space-y-6">
      {items.map((item, idx) => (
        <div key={idx} className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-bold text-gray-900 mb-2">{item.title}</h3>
          <p className="text-sm text-gray-600 mb-4">{item.content}</p>
          {item.steps && (
            <ol className="space-y-2.5">
              {item.steps.map((step, sIdx) => (
                <li key={sIdx} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-50 text-teal-700 text-xs font-bold flex items-center justify-center mt-0.5">
                    {sIdx + 1}
                  </span>
                  <span className="text-sm text-gray-700 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      {/* Header */}
      <div className="bg-gradient-to-br from-teal-600 via-emerald-600 to-teal-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <button
            onClick={() => setCurrentView('home')}
            className="flex items-center gap-2 text-white/70 hover:text-white text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </button>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Book className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Help Center</h1>
              <p className="text-white/70 text-sm">Everything you need to know about StikmNek</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative max-w-xl mt-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search help articles..."
              className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 text-white placeholder-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
            />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <div className="lg:w-64 flex-shrink-0">
            <nav className="space-y-1 lg:sticky lg:top-24">
              {sections.map(section => (
                <button
                  key={section.key}
                  onClick={() => { setActiveSection(section.key); setExpandedFAQ(null); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                    activeSection === section.key
                      ? 'bg-teal-50 text-teal-700 font-semibold border border-teal-200'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span className={activeSection === section.key ? 'text-teal-600' : 'text-gray-400'}>{section.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{section.label}</p>
                  </div>
                </button>
              ))}
            </nav>

            {/* Contact Card */}
            <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="text-sm font-bold text-gray-900 mb-3">Need More Help?</h4>
              <div className="space-y-2.5 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-teal-500" />
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-teal-600 hover:underline">
                    {SUPPORT_EMAIL}
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-teal-500" />
                  <a href="tel:+6787766107" className="text-teal-600 hover:underline">
                    +678 7766107
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-teal-500" />
                  <span>Email us — we typically reply within one business day</span>
                </div>
              </div>
              <a
                href={supportMailtoUrl('StikmNek support')}
                className="block w-full mt-4 py-2.5 rounded-xl bg-teal-50 text-teal-700 text-sm font-semibold hover:bg-teal-100 transition-colors text-center"
              >
                Email support
              </a>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Overview */}
            {activeSection === 'overview' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Welcome to StikmNek</h2>
                  <p className="text-gray-600 text-sm leading-relaxed mb-6">
                    StikmNek is Vanuatu's premier tourist discount platform. Whether you're a traveler looking for the best deals
                    or a business owner wanting to attract more customers, we've got you covered.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { icon: <Ticket className="w-6 h-6" />, title: 'For Tourists', desc: 'Buy a pass (AUD) and unlock member deals across partner businesses', color: 'bg-blue-50 text-blue-600' },
                      { icon: <Store className="w-6 h-6" />, title: 'For Businesses', desc: 'List your business and reach thousands of tourists', color: 'bg-emerald-50 text-emerald-600' },
                      { icon: <Shield className="w-6 h-6" />, title: 'For Admins', desc: 'Manage listings, reviews, and platform operations', color: 'bg-purple-50 text-purple-600' },
                    ].map((card, i) => (
                      <div key={i} className="p-5 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
                        <div className={`w-12 h-12 rounded-xl ${card.color} flex items-center justify-center mb-3`}>
                          {card.icon}
                        </div>
                        <h3 className="text-sm font-bold text-gray-900 mb-1">{card.title}</h3>
                        <p className="text-xs text-gray-500">{card.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">How It Works</h3>
                  <div className="space-y-4">
                    {howItWorksSteps.map((item, i) => (
                      <div key={i} className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {item.step}
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">{item.title}</h4>
                          <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tourist FAQ */}
            {activeSection === 'tourist-faq' && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Tourist FAQ</h2>
                <p className="text-sm text-gray-500 mb-6">Frequently asked questions from travelers visiting Vanuatu</p>
                {renderFAQList(filteredTouristFAQ)}
              </div>
            )}

            {/* Business Guide */}
            {activeSection === 'business-guide' && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Business Owner Guide</h2>
                <p className="text-sm text-gray-500 mb-2">
                  Plain-language steps for signing up, listing your deal, completing your profile and credentials, and scanning tourist passes. Menu names match what you see after you sign in.
                </p>
                <p className="text-sm mb-4">
                  <a
                    href="/business-owner-guide-print.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-medium text-teal-600 hover:text-teal-700 hover:underline"
                  >
                    <ExternalLink className="w-4 h-4 flex-shrink-0" />
                    Open printable version (save as PDF or print)
                  </a>
                </p>
                <div className="mb-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50/80 p-5 sm:p-6">
                  <h3 className="text-sm font-bold text-emerald-900 mb-2 flex items-center gap-2">
                    <Store className="w-4 h-4 text-emerald-600" />
                    In simple terms
                  </h3>
                  <p className="text-sm text-emerald-900/90 leading-relaxed">
                    You sign up as a business, submit your deal in VT, and wait for approval. Complete your Business Profile and optionally upload credentials for verified trust badges. When tourists visit, they show a QR code — you scan it in your Business Hub, see the amount to charge in VT, confirm the visit, and give the StikmNek discount. Turning your listing off or on is immediate; most other edits wait for a quick admin check.
                  </p>
                </div>
                {renderGuide(businessGuide)}
              </div>
            )}

            {/* Admin Manual */}
            {activeSection === 'admin-manual' && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Admin Operations Manual</h2>
                <p className="text-sm text-gray-500 mb-6">Guide for platform administrators</p>
                {renderGuide(adminManual)}
              </div>
            )}

            {/* Quick Start */}
            {activeSection === 'quick-start' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-teal-50 to-emerald-50 rounded-2xl border border-teal-200 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Zap className="w-6 h-6 text-teal-600" />
                    <h2 className="text-xl font-bold text-gray-900">Quick Start Guide for Beta Businesses</h2>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Welcome to the StikmNek beta program! Follow these steps to get your business listed and start attracting tourists.
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Step-by-Step Setup (15 minutes)</h3>
                  <div className="space-y-6">
                    {[
                      {
                        step: 1,
                        title: 'Sign up for a business account',
                        time: '2 min',
                        details:
                          'Open StikmNek in your browser, tap Sign In, then Sign Up. Choose Business (not Tourist). Use an email you check often. Confirm your email if the system sends a link.',
                      },
                      {
                        step: 2,
                        title: 'Prepare your business information',
                        time: '3 min',
                        details:
                          'Gather: business name, category (dining, tours, activities, transportation, shopping, spa, accommodation), a short clear description, discount wording (e.g. 20% OFF), standard and StikmNek prices, address, phone, hours, and optional WhatsApp. Tours/activities use tiered per-person prices; transportation uses per trip/day pricing.',
                      },
                      {
                        step: 3,
                        title: 'Take great photos',
                        time: '5 min',
                        details:
                          'Take 3–5 clear, well-lit photos: outside, inside, and what you sell. Keep files under the size limit shown in the form (typically a few MB each).',
                      },
                      {
                        step: 4,
                        title: 'Submit your listing',
                        time: '3 min',
                        details:
                          'Sign in, open My Business in the top menu to enter the Business Hub, then New Listing in the sidebar. Complete the form, upload photos, and submit for approval. Track progress under My Submissions.',
                      },
                      {
                        step: 5,
                        title: 'Use the QR scanner when you are approved',
                        time: '2 min',
                        details:
                          'After approval, open the Business Hub → Overview (or the floating Scan button). Allow camera access. When a guest shows their pass QR code on their phone, scan it in StikmNek, choose the right listing if asked, and confirm redemption. No separate scanner app is required.',
                      },
                    ].map((item) => (
                      <div key={item.step} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                            {item.step}
                          </div>
                          {item.step < 5 && <div className="w-0.5 flex-1 bg-teal-200 mt-2" />}
                        </div>
                        <div className="pb-6">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-bold text-gray-900">{item.title}</h4>
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium">{item.time}</span>
                          </div>
                          <p className="text-sm text-gray-600 leading-relaxed">{item.details}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Tips for Success</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { title: 'Compelling Discount', desc: 'Offer at least 15-20% off to attract tourists. Higher discounts get more visibility.' },
                      { title: 'Great Photos', desc: 'Listings with 3+ photos get 2x more views. Show your best side!' },
                      { title: 'Respond to Reviews', desc: 'Businesses that respond to reviews see 30% more redemptions.' },
                      { title: 'Keep Info Updated', desc: 'Update your hours and offers regularly to maintain accuracy.' },
                    ].map((tip, i) => (
                      <div key={i} className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                        <h4 className="text-sm font-bold text-amber-800 mb-1">{tip.title}</h4>
                        <p className="text-xs text-amber-700">{tip.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Troubleshooting */}
            {activeSection === 'troubleshooting' && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Troubleshooting</h2>
                <p className="text-sm text-gray-500 mb-6">Solutions to common issues</p>
                {renderFAQList(filteredTroubleshooting)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpCenter;
