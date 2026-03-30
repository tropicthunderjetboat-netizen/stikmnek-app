import React from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const VALID_SLUGS = new Set([
  'privacy',
  'terms',
  'gdpr',
  'cookies',
  'data-protection',
]);

type Lang = 'en' | 'fr' | 'bi';

const TITLES: Record<string, Record<Lang, string>> = {
  privacy: {
    en: 'Privacy Policy',
    fr: 'Politique de confidentialité',
    bi: 'Praevet Polisi',
  },
  terms: {
    en: 'Terms of Service',
    fr: 'Conditions d’utilisation',
    bi: 'Taem blong Yusim',
  },
  gdpr: {
    en: 'GDPR Compliance',
    fr: 'Conformité RGPD',
    bi: 'GDPR Komplaens',
  },
  cookies: {
    en: 'Cookie Policy',
    fr: 'Politique de cookies',
    bi: 'Kuki Polisi',
  },
  'data-protection': {
    en: 'Data Protection',
    fr: 'Protection des données',
    bi: 'Data Proteksen',
  },
};

function bodyFor(slug: string, lang: Lang): React.ReactNode {
  const p = (chunks: Record<Lang, string[]>) =>
    chunks[lang].map((para, i) => (
      <p key={i} className="text-gray-600 leading-relaxed mb-4">
        {para}
      </p>
    ));

  switch (slug) {
    case 'privacy':
      return p({
        en: [
          'StikmNek (“we”, “us”) respects your privacy. This policy describes how we collect, use, and protect personal information when you use our website and services in Vanuatu.',
          'We collect information you provide (such as account details, pass purchases, and support requests) and technical data needed to operate the platform securely. We use this data to provide deals, passes, redemptions, and customer support.',
          'We do not sell your personal data. We may share data with payment processors and hosting providers only as needed to run the service, subject to appropriate safeguards.',
          'You may request access to or correction of your personal data by contacting us at stikmnek@gmail.com. We retain data only as long as needed for the purposes above or as required by law.',
        ],
        fr: [
          'StikmNek (« nous ») respecte votre vie privée. Cette politique décrit comment nous collectons, utilisons et protégeons les données personnelles lorsque vous utilisez notre site et nos services au Vanuatu.',
          'Nous collectons les informations que vous fournissez (compte, achats de pass, demandes d’assistance) et des données techniques nécessaires au bon fonctionnement et à la sécurité de la plateforme.',
          'Nous ne vendons pas vos données personnelles. Nous pouvons les partager avec des prestataires de paiement ou d’hébergement uniquement dans la mesure nécessaire au service.',
          'Vous pouvez demander l’accès ou la rectification de vos données en écrivant à stikmnek@gmail.com. Nous conservons les données le temps nécessaire à ces finalités ou selon la loi.',
        ],
        bi: [
          'StikmNek i rispekem praevet blong yu. Polisi ia i eksplenem hao mifala kolektem, yusum mo protektem infomesen blong yu taem yu yusum websaet mo savis blong mifala long Vanuatu.',
          'Mifala kolektem infomesen yu givim (akaont, bae pas, help) mo teknoloji data we i nid blong sefti mo wok blong platform.',
          'Mifala i no salim data blong yu. Mifala save serem wetem pei pei mo hosting olsem we i nid blong runem savis.',
          'Yu save askem long luk o stretem data blong yu long stikmnek@gmail.com.',
        ],
      });
    case 'terms':
      return p({
        en: [
          'By using StikmNek you agree to these Terms of Service. StikmNek provides a platform for discovering deals and purchasing tourist passes in Vanuatu; individual businesses are responsible for their offers and in-venue service.',
          'Passes and Super Star purchases are subject to the conditions shown at checkout. Misuse of the platform, fraud, or abusive behaviour may result in suspension of your account.',
          'The platform is provided “as is”. To the extent permitted by law, we limit liability for indirect losses. Disputes should first be raised with our support team at stikmnek@gmail.com.',
        ],
        fr: [
          'En utilisant StikmNek, vous acceptez ces conditions d’utilisation. StikmNek propose une plateforme pour découvrir des offres et acheter des pass touristiques au Vanuatu ; chaque établissement reste responsable de ses offres et de son service sur place.',
          'Les pass et achats Super Star sont soumis aux conditions affichées au paiement. Fraude ou abus peut entraîner la suspension du compte.',
          'La plateforme est fournie « en l’état ». Dans les limites légales, notre responsabilité pour les pertes indirectes est limitée. Contact : stikmnek@gmail.com.',
        ],
        bi: [
          'Taem yu yusum StikmNek yu agri long ol taem ia. StikmNek i givim platform blong faenem dils mo bae pas long Vanuatu. Evri bisinis i stap ansa blong ol ofa blong olgeta.',
          'Pas mo Super Star i aninit long kondisen long taem yu pei. Rong yus o abius i save lisim akaont blong yu.',
          'Platform i kam «olsem hemi stap». Lus we i nid, mifala i limitim liability. Help: stikmnek@gmail.com.',
        ],
      });
    case 'gdpr':
      return p({
        en: [
          'Where EU data protection law applies, we process personal data on lawful bases such as contract performance and legitimate interests in operating a secure discount platform.',
          'You may have rights to access, rectification, erasure, restriction, portability, and objection, and to lodge a complaint with a supervisory authority. Contact stikmnek@gmail.com to exercise these rights.',
        ],
        fr: [
          'Lorsque le droit européen sur la protection des données s’applique, nous traitons les données sur des bases légales telles que l’exécution du contrat et l’intérêt légitime à exploiter une plateforme sécurisée.',
          'Vous pouvez disposer de droits d’accès, de rectification, d’effacement, de limitation, de portabilité et d’opposition, et introduire une réclamation auprès d’une autorité de contrôle. Écrivez à stikmnek@gmail.com.',
        ],
        bi: [
          'Sapos EU law i aplae, mifala wok wetem data long legal basis olsem kontrak mo sefti blong platform.',
          'Yu gat raet blong akses, stretim, dilet, limit, mo komplen. Kontak: stikmnek@gmail.com.',
        ],
      });
    case 'cookies':
      return p({
        en: [
          'We use cookies and similar technologies where necessary for authentication, preferences, analytics, and security. You can control cookies through your browser settings; disabling some cookies may limit certain features.',
          'For questions about cookies, contact stikmnek@gmail.com.',
        ],
        fr: [
          'Nous utilisons des cookies et technologies similaires lorsque nécessaire pour l’authentification, les préférences, l’analyse et la sécurité. Vous pouvez les gérer dans les paramètres du navigateur.',
          'Questions : stikmnek@gmail.com.',
        ],
        bi: [
          'Mifala yusum kuki blong login, seting, analytics, mo sefti. Yu save kontrol long browser.',
          'Kuesten: stikmnek@gmail.com.',
        ],
      });
    case 'data-protection':
      return p({
        en: [
          'We implement appropriate technical and organisational measures to protect personal data against unauthorised access, loss, or alteration. Staff and processors with access to data are bound to confidentiality where applicable.',
          'Data breaches will be handled in line with applicable law. Notifications to users or authorities will be made when required.',
          'Contact stikmnek@gmail.com for data protection enquiries.',
        ],
        fr: [
          'Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger les données personnelles contre l’accès non autorisé, la perte ou l’altération.',
          'Les violations de données seront traitées conformément à la loi. Contact : stikmnek@gmail.com.',
        ],
        bi: [
          'Mifala yusum gud wok blong protektem data blong yu.',
          'Sapos i gat brek, mifala bae folem loa. Kontak: stikmnek@gmail.com.',
        ],
      });
    default:
      return null;
  }
}

interface LegalDocumentPageProps {
  slug: string;
}

const LegalDocumentPage: React.FC<LegalDocumentPageProps> = ({ slug }) => {
  const { language } = useAppContext();
  const lang: Lang = language === 'fr' ? 'fr' : language === 'bi' ? 'bi' : 'en';

  if (!VALID_SLUGS.has(slug)) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <p className="text-gray-600">
          {lang === 'en'
            ? 'This legal document was not found.'
            : lang === 'fr'
              ? 'Ce document juridique est introuvable.'
              : 'Dokumen legal ia i no faen.'}
        </p>
        <Link
          to="/"
          className="mt-4 inline-block text-teal-600 font-semibold hover:underline"
        >
          ← Home
        </Link>
      </div>
    );
  }

  const title = TITLES[slug]?.[lang] ?? slug;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-teal-600 font-semibold hover:underline mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        {lang === 'en' ? 'Back to home' : lang === 'fr' ? 'Retour à l’accueil' : 'Go bak hom'}
      </Link>
      <article className="prose prose-gray max-w-none">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">{title}</h1>
        <div className="text-sm">{bodyFor(slug, lang)}</div>
        <p className="text-xs text-gray-400 mt-10">
          {lang === 'en'
            ? 'Last updated March 2026. This page is for information; seek legal advice for your situation.'
            : lang === 'fr'
              ? 'Dernière mise à jour : mars 2026. Ceci est informatif ; consultez un professionnel pour votre situation.'
              : 'Las apdeit March 2026.'}
        </p>
      </article>
    </div>
  );
};

export default LegalDocumentPage;
