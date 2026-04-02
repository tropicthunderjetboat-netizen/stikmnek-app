export type Language = 'en' | 'fr' | 'bi';

export const translations: Record<string, Record<Language, string>> = {
  // Navigation
  'nav.home': { en: 'Home', fr: 'Accueil', bi: 'Hom' },
  'nav.deals': { en: 'Deals', fr: 'Offres', bi: 'Dils' },
  'nav.map': { en: 'Map', fr: 'Carte', bi: 'Map' },
  'nav.passes': { en: 'Passes', fr: 'Pass', bi: 'Pas' },
  'nav.dashboard': { en: 'Dashboard', fr: 'Tableau de bord', bi: 'Dasbod' },
  'nav.admin': { en: 'Admin', fr: 'Admin', bi: 'Admin' },
  'nav.signin': { en: 'Sign In', fr: 'Connexion', bi: 'Saen In' },
  'nav.signout': { en: 'Sign Out', fr: 'Déconnexion', bi: 'Saen Aot' },
  
  // Hero
  'hero.title': { en: 'Discover Vanuatu\'s Best Deals', fr: 'Découvrez les meilleures offres du Vanuatu', bi: 'Faenem Beswan Dils blong Vanuatu' },
  'hero.subtitle': {
    en: 'Unlock exclusive discounts up to 35% on dining, tours, and activities. Join thousands of happy travelers and local businesses.',
    fr: 'Profitez de réductions exclusives jusqu\'à 35 % sur la restauration, les visites et les activités. Rejoignez des milliers de voyageurs et d\'entreprises locales satisfaits.',
    bi: 'Openem eksklusiv diskaon kasem 35% long kakae, tua, mo aktiviti. Joinem tausen blong hapi turis mo lokal bisnis.',
  },
  'hero.ctaTourist': { en: 'Sign Up & Get Deals', fr: 'Inscrivez-vous et profitez des offres', bi: 'Saen Ap & Karem Dils' },
  'hero.ctaBusiness': { en: 'List Your Business (Free)', fr: 'Inscrivez votre entreprise (gratuit)', bi: 'Listem Bisnis Blong Yu (Fri)' },
  'hero.cta': { en: 'Get Your Pass', fr: 'Obtenez votre pass', bi: 'Karem Pas Blong Yu' },
  'hero.explore': { en: 'Explore Deals', fr: 'Explorer les offres', bi: 'Eksploarem Dils' },
  'hero.businesses': { en: 'Local Businesses', fr: 'Entreprises locales', bi: 'Lokal Bisnis' },
  'hero.savings': { en: 'Average Savings', fr: 'Économies moyennes', bi: 'Averej Sevin' },
  'hero.tourists': { en: 'Happy Tourists', fr: 'Touristes satisfaits', bi: 'Hapi Turis' },
  
  // Categories
  'cat.all': { en: 'All', fr: 'Tout', bi: 'Olgeta' },
  'cat.dining': { en: 'Dining', fr: 'Restauration', bi: 'Kakae' },
  'cat.activities': { en: 'Activities', fr: 'Activités', bi: 'Aktiviti' },
  'cat.tours': { en: 'Tours', fr: 'Visites', bi: 'Tua' },
  'cat.shopping': { en: 'Shopping', fr: 'Shopping', bi: 'Soping' },
  'cat.spa': { en: 'Spa & Wellness', fr: 'Spa & Bien-être', bi: 'Spa & Helt' },
  'cat.accommodation': { en: 'Accommodation', fr: 'Hébergement', bi: 'Ples blong slip' },
  
  // Passes
  'pass.title': { en: 'Choose Your Pass', fr: 'Choisissez votre pass', bi: 'Jusem Pas Blong Yu' },
  'pass.subtitle': { en: 'Unlock exclusive deals across Vanuatu', fr: 'Débloquez des offres exclusives à travers le Vanuatu', bi: 'Openem ekslusiv dils long Vanuatu' },
  'pass.family_explorer': { en: 'Family Explorer Pass', fr: 'Pass Explorateur Familial', bi: 'Famili Eksplora Pas' },
  'pass.extended_group_adventure': { en: 'Extended Group Adventure Pass', fr: 'Pass Aventure Groupe Étendu', bi: 'Grup Advenija Pas' },
  'pass.ultimate_crew_experience': { en: 'Ultimate Crew Experience Pass', fr: 'Pass Expérience Ultime Équipe', bi: 'Ultimet Kru Eksperiens Pas' },
  'pass.mega_group_experience': { en: 'Mega Group Experience Pass', fr: 'Pass Expérience Méga Groupe', bi: 'Mega Grup Eksperiens Pas' },
  'pass.buy': { en: 'Buy Now', fr: 'Acheter', bi: 'Baem Nao' },
  'pass.feature1': { en: 'Access all deals', fr: 'Accès à toutes les offres', bi: 'Akses olgeta dils' },
  'pass.feature2': { en: 'QR code coupons', fr: 'Coupons QR code', bi: 'QR kod kupons' },
  'pass.feature3': { en: 'Map navigation', fr: 'Navigation carte', bi: 'Map navigesen' },

  // Business
  'biz.featured': { en: 'Featured Deals', fr: 'Offres en vedette', bi: 'Fitjad Dils' },
  'biz.all': { en: 'All Deals', fr: 'Toutes les offres', bi: 'Olgeta Dils' },
  'biz.viewdeal': { en: 'View Deal', fr: 'Voir l\'offre', bi: 'Lukim Dil' },
  'biz.reviews': { en: 'reviews', fr: 'avis', bi: 'rivius' },
  'biz.hours': { en: 'Hours', fr: 'Horaires', bi: 'Taem' },
  'biz.phone': { en: 'Phone', fr: 'Téléphone', bi: 'Fon' },
  'biz.location': { en: 'Location', fr: 'Emplacement', bi: 'Ples' },
  'biz.save': { en: 'Save', fr: 'Sauvegarder', bi: 'Sevem' },
  
  // Map
  'map.title': { en: 'Explore Vanuatu', fr: 'Explorez le Vanuatu', bi: 'Eksploarem Vanuatu' },
  'map.subtitle': { en: 'Find deals near you on the interactive map', fr: 'Trouvez des offres près de vous sur la carte interactive', bi: 'Faenem dils klosap long yu long intaraktiv map' },
  
  // Reviews
  'review.title': { en: 'What Tourists Say', fr: 'Ce que disent les touristes', bi: 'Wanem Turis i Talem' },
  'review.write': { en: 'Write a Review', fr: 'Écrire un avis', bi: 'Raetim Wan Riviu' },
  'review.submit': { en: 'Submit Review', fr: 'Soumettre l\'avis', bi: 'Sendim Riviu' },
  
  // Dashboard
  'dash.title': { en: 'My Dashboard', fr: 'Mon tableau de bord', bi: 'Dasbod Blong Mi' },
  'dash.passes': { en: 'My Passes', fr: 'Mes pass', bi: 'Pas Blong Mi' },
  'dash.favorites': { en: 'Favorites', fr: 'Favoris', bi: 'Favrit' },
  'dash.history': { en: 'Redemption History', fr: 'Historique d\'utilisation', bi: 'Histri blong Yusim' },
  'dash.nopass': { en: 'No active pass. Get one to start saving!', fr: 'Pas de pass actif. Obtenez-en un pour commencer à économiser!', bi: 'No gat aktiv pas. Karem wan blong stat sevem!' },
  
  // Footer
  'footer.about': { en: 'About StikmNek', fr: 'À propos de StikmNek', bi: 'Abaotem StikmNek' },
  'footer.abouttext': { en: 'StikmNek connects tourists with the best local businesses across Vanuatu. Save money while experiencing authentic island culture.', fr: 'StikmNek connecte les touristes avec les meilleures entreprises locales à travers le Vanuatu. Économisez tout en vivant la culture insulaire authentique.', bi: 'StikmNek i konetim turis wetem beswan lokal bisnis long Vanuatu. Sevem mani taem yu eksperiens tru aelan kalsa.' },
  'footer.links': { en: 'Quick Links', fr: 'Liens rapides', bi: 'Kwik Link' },
  'footer.support': { en: 'Support', fr: 'Support', bi: 'Sapot' },
  'footer.legal': { en: 'Legal', fr: 'Légal', bi: 'Ligo' },
  'footer.privacy': { en: 'Privacy Policy', fr: 'Politique de confidentialité', bi: 'Praevesi Polisi' },
  'footer.terms': { en: 'Terms of Service', fr: 'Conditions d\'utilisation', bi: 'Tems blong Sevis' },
  'footer.gdpr': { en: 'GDPR Compliance', fr: 'Conformité RGPD', bi: 'GDPR Komplaens' },
  'footer.contact': { en: 'Contact Us', fr: 'Contactez-nous', bi: 'Kontaktem Mifala' },
  'footer.faq': { en: 'FAQ', fr: 'FAQ', bi: 'FAQ' },
  'footer.business': { en: 'List Your Business', fr: 'Inscrivez votre entreprise', bi: 'Listem Bisnis Blong Yu' },
  'footer.copyright': { en: '© 2026 StikmNek. All rights reserved.', fr: '© 2026 StikmNek. Tous droits réservés.', bi: '© 2026 StikmNek. Olgeta raets i risevd.' },
  
  // Auth
  'auth.signin': { en: 'Sign In', fr: 'Connexion', bi: 'Saen In' },
  'auth.signup': { en: 'Sign Up', fr: 'Inscription', bi: 'Saen Ap' },
  'auth.email': { en: 'Email', fr: 'Email', bi: 'Imel' },
  'auth.password': { en: 'Password', fr: 'Mot de passe', bi: 'Paswod' },
  'auth.name': { en: 'Full Name', fr: 'Nom complet', bi: 'Ful Nem' },
  'auth.tourist': { en: 'Tourist', fr: 'Touriste', bi: 'Turis' },
  'auth.business': { en: 'Business Owner', fr: 'Propriétaire d\'entreprise', bi: 'Bisnis Ona' },
  
  // General
  'general.search': { en: 'Search deals, businesses...', fr: 'Rechercher des offres, entreprises...', bi: 'Sejem dils, bisnis...' },
  'general.loading': { en: 'Loading...', fr: 'Chargement...', bi: 'Lodim...' },
  'general.close': { en: 'Close', fr: 'Fermer', bi: 'Klosem' },
  'general.back': { en: 'Back', fr: 'Retour', bi: 'Bak' },
  'general.save': { en: 'Save', fr: 'Sauvegarder', bi: 'Sevem' },
  'general.cancel': { en: 'Cancel', fr: 'Annuler', bi: 'Kanselim' },
  'general.off': { en: 'OFF', fr: 'DE RÉDUCTION', bi: 'OF' },
  'general.per_person': { en: 'per person', fr: 'par personne', bi: 'wan man' },
};

export function t(key: string, lang: Language): string {
  return translations[key]?.[lang] || translations[key]?.['en'] || key;
}
