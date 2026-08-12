export type Language = 'en' | 'fr';

export const translations: Record<string, Record<Language, string>> = {
  // Navigation
  'nav.home': { en: 'Home', fr: 'Accueil' },
  'nav.deals': { en: 'Deals', fr: 'Offres' },
  'nav.map': { en: 'Map', fr: 'Carte' },
  'nav.passes': { en: 'Passes', fr: 'Pass' },
  'nav.dashboard': { en: 'Dashboard', fr: 'Tableau de bord' },
  'nav.admin': { en: 'Admin', fr: 'Admin' },
  'nav.signin': { en: 'Sign In', fr: 'Connexion' },
  'nav.signout': { en: 'Sign Out', fr: 'Déconnexion' },
  
  // Hero
  'hero.title': { en: 'Discover Vanuatu. Support Local.', fr: 'Découvrez le Vanuatu. Soutenez le local.' },
  'hero.subtitle': {
    en: 'Free trip planner. Tap ❤️ to save places. Get a Holiday Pass and save up to 35% for 7 days.',
    fr: 'Planificateur de voyage gratuit. Touchez ❤️ pour sauver des lieux. Prenez un Holiday Pass et économisez jusqu\'à 35 % pendant 7 jours.',
  },
  'hero.ctaTourist': { en: 'Browse Local Spots', fr: 'Voir les lieux locaux' },
  'hero.ctaBusiness': { en: 'List Your Business (Free)', fr: 'Inscrivez votre entreprise (gratuit)' },
  'hero.businessOwnersHint': { en: 'Own a business?', fr: 'Vous avez un commerce ?' },
  'hero.cta': { en: 'Get Your Pass', fr: 'Obtenez votre pass' },
  'hero.explore': { en: 'Browse Local Spots', fr: 'Voir les lieux locaux' },
  'hero.browseDeals': { en: 'Browse Local Spots', fr: 'Voir les lieux locaux' },
  'hero.welcomeBack': {
    en: 'Free trip planner. Tap ❤️ to save places. Get a Holiday Pass and save up to 35% for 7 days.',
    fr: 'Planificateur de voyage gratuit. Touchez ❤️ pour sauver des lieux. Prenez un Holiday Pass et économisez jusqu\'à 35 % pendant 7 jours.',
  },
  'hero.businesses': { en: 'Local Spots', fr: 'Lieux locaux' },
  'hero.savings': { en: 'Average Savings', fr: 'Économies moyennes' },
  'hero.tourists': { en: 'Happy Tourists', fr: 'Touristes satisfaits' },
  'hero.browseSpots': {
    en: 'Browse __COUNT__ Local Spots',
    fr: 'Voir __COUNT__ lieux locaux',
  },
  'hero.footerMeta': {
    en: '__COUNT__ spots · Free to use · Holiday Pass A$30',
    fr: '__COUNT__ lieux · Gratuit · Holiday Pass 30 $ AUD',
  },
  
  // Categories
  'cat.all': { en: 'All', fr: 'Tout' },
  'cat.dining': { en: 'Dining', fr: 'Restauration' },
  'cat.activities': { en: 'Activities', fr: 'Activités' },
  'cat.tours': { en: 'Tours', fr: 'Visites' },
  'cat.transportation': { en: 'Transportation', fr: 'Transport' },
  'cat.shopping': { en: 'Shopping', fr: 'Shopping' },
  'cat.spa': { en: 'Spa & Wellness', fr: 'Spa & Bien-être' },
  'cat.accommodation': { en: 'Accommodation', fr: 'Hébergement' },
  
  // Passes
  'pass.title': { en: 'Build your Pass', fr: 'Construisez votre pass' },
  'pass.subtitle': {
    en: 'Customize your adventure with flexible pricing',
    fr: 'Personnalisez votre aventure avec une tarification flexible',
  },
  'passSelection.title': { en: 'Build your Pass', fr: 'Construisez votre pass' },
  'passSelection.subtitle': {
    en: 'Customize your adventure with flexible pricing',
    fr: 'Personnalisez votre aventure avec une tarification flexible',
  },
  'pass.build_how_desc': {
    en: 'Sign up, add how many people are travelling, your travel dates, pay with a credit card, and start saving.',
    fr: 'Inscrivez-vous, indiquez le nombre de participants, vos dates de voyage, payez par carte de crédit, et commencez à économiser.',
  },

  // Pass pricing card (package UI)
  'passPricing.page_title': {
    en: 'Get your Holiday Pass',
    fr: 'Obtenez votre Holiday Pass',
  },
  'passPricing.page_subtitle': {
    en: 'Solo A$30 / Couple A$40 for 7 days',
    fr: 'Solo 30 $ AUD / Couple 40 $ AUD pour 7 jours',
  },
  'passPricing.pricing_micro': {
    en: 'A$__BASE__ 1st guest + A$__GUEST__/extra (6+) · Under 6 free · max __MAX__/pass',
    fr: '__BASE__ $ 1re pers. + __GUEST__ $/supp. (6+) · -6 ans gratuits · max __MAX__/pass',
  },
  'passPricing.card_1d_title': { en: '1 day', fr: '1 jour' },
  'passPricing.card_1d_hint': { en: '24h access', fr: 'Accès 24 h' },
  'passPricing.card_7d_title': { en: '7 days', fr: '7 jours' },
  'passPricing.card_7d_hint': { en: 'Holiday pass', fr: 'Pass vacances' },
  'passPricing.badge_best_value': { en: 'Best value', fr: 'Meilleur rapport' },
  'passPricing.chip_35': { en: '35% off', fr: '-35 %' },
  'passPricing.chip_map': { en: 'Maps', fr: 'Cartes' },
  'passPricing.chip_qr': { en: 'Pass', fr: 'Pass' },
  'passPricing.chip_row_35': { en: '35% Off', fr: '-35 %' },
  'passPricing.chip_row_map': { en: 'Live Map', fr: 'Carte live' },
  'passPricing.chip_row_qr': { en: 'Visual Pass', fr: 'Pass visuel' },
  'passPricing.holiday_ribbon_prefix': {
    en: 'Buy 1 week, get ',
    fr: 'Achetez 1 semaine, ',
  },
  'passPricing.holiday_ribbon_emphasis': {
    en: '1 WEEK FREE',
    fr: 'LA 2E SEMAINE GRATUITE',
  },
  'passPricing.holiday_ribbon_title': {
    en: '7-Day Holiday Pass',
    fr: 'Pass vacances 7 jours',
  },
  'passPricing.simple_header': {
    en: 'A$__BASE__ first guest (ages 6+), then A$__GUEST__ each additional guest up to __MAX__ per pass. Children under 6 are free.',
    fr: '__BASE__ $ 1re pers. (6 ans et +), puis __GUEST__ $ par invité supplémentaire jusqu’à __MAX__ / pass. Enfants de moins de 6 ans gratuits.',
  },
  'passPricing.people_label': {
    en: 'People (ages 6+)',
    fr: 'Personnes (6 ans et +)',
  },
  'passPricing.coverage_label': { en: 'Coverage', fr: 'Couverture' },
  'passPricing.max_per_pass': {
    en: 'Max __N__ per pass',
    fr: 'Max __N__ par pass',
  },
  'passPricing.duration_1d': { en: '1 day', fr: '1 jour' },
  'passPricing.duration_7d': { en: '7 days', fr: '7 jours' },
  'passPricing.total_label': { en: 'Total', fr: 'Total' },
  'passPricing.savings_anchor': {
    en: 'With __COUNT__ people, you could save A$__SAVE__ on your first day alone!',
    fr: 'Avec __COUNT__ personnes, vous pourriez économiser __SAVE__ $ AUD rien que le premier jour !',
  },
  'passPricing.holiday_headline': {
    en: 'Buy 1 week, get 1 week FREE',
    fr: 'Achetez 1 semaine, la 2e semaine est GRATUITE',
  },
  'passPricing.holiday_sub': {
    en: '1st guest A$15, +A$10 each extra. Add 7 days? Already included. Share trip to get 14 days total.',
    fr: '1re personne 15 $ AUD, +10 $ AUD par personne. Les 7 jours sont inclus. Partagez pour 14 jours au total.',
  },
  'passPricing.included_meals': {
    en: 'Up to 35% off meals & tours',
    fr: 'Jusqu’à 35 % sur repas & visites',
  },
  'passPricing.included_map': {
    en: 'Interactive map & savings tracker',
    fr: 'Carte interactive & suivi des économies',
  },
  'passPricing.included_qr': {
    en: 'Show your visual Pass',
    fr: 'Montrez votre Pass visuel',
  },
  'passPricing.purchase': { en: 'Get Holiday Pass', fr: 'Obtenir le Holiday Pass' },
  'passPricing.purchase_locked': { en: 'Active pass', fr: 'Pass actif' },
  'passPricing.holiday_addon_micro': {
    en: '+A$15 · 7 days included',
    fr: '+15 $ AUD · 7 jours inclus',
  },
  'passPricing.aria_decrease_party': {
    en: 'Decrease party size',
    fr: 'Réduire le nombre de personnes',
  },
  'passPricing.aria_increase_party': {
    en: 'Increase party size',
    fr: 'Augmenter le nombre de personnes',
  },
  'passPricing.value_2nd_week_headline': {
    en: 'Solo A$30 · Couple A$40',
    fr: 'Solo 30 $ · Couple 40 $',
  },
  'passPricing.cta_secure_line': {
    en: 'Secure payment',
    fr: 'Paiement sécurisé',
  },
  'passPricing.card_header_holiday': {
    en: '7-Day Holiday Pass',
    fr: 'Pass vacances 7 jours',
  },
  'passPricing.coverage_helper_7d': {
    en: 'Our signature pass for longer stays — best value.',
    fr: 'Notre pass signature pour les longs séjours — le meilleur rapport.',
  },
  'passPricing.coverage_nudge_7d': {
    en: 'Staying a week or more? Choose 7 days — 2nd week free.',
    fr: 'Une semaine ou plus ? Choisissez 7 jours — 2e semaine offerte.',
  },
  'passPricing.port_stay_hint': {
    en: 'Solo 1-day A$15. Kids under 6 free. Max 20 guests.',
    fr: 'Solo 1 jour 15 $ AUD. Moins de 6 ans gratuits. Max 20 personnes.',
  },
  'passPricing.hero_1d_title': {
    en: '1-Day Pass · A$15',
    fr: 'Pass 1 jour · 15 $ AUD',
  },
  'passPricing.hero_1d_sub': {
    en: '1st guest A$15, +A$10 each extra.',
    fr: '1re personne 15 $ AUD, +10 $ AUD par personne.',
  },
  'passPricing.secure_pay_micro': {
    en: 'Secure checkout',
    fr: 'Paiement sécurisé',
  },

  // Checkout (pricing summary + conversion)
  'checkout.breakdown_title': { en: 'Price breakdown', fr: 'Détail du prix' },
  'checkout.base_pass_row': {
    en: 'Base pass (1st person ages 6+)',
    fr: 'Pass de base (1re personne, 6 ans et +)',
  },
  'checkout.extra_guests_row': {
    en: 'Additional guests (__COUNT__ × A$__FEE__)',
    fr: 'Invités supplémentaires (__COUNT__ × __FEE__ $ AUD)',
  },
  'checkout.extra_guests_2_6_row': {
    en: 'Guests 2–6 (__COUNT__ × A$__FEE__)',
    fr: 'Personnes 2 à 6 (__COUNT__ × __FEE__ $ AUD)',
  },
  'checkout.extra_guests_from_7_row': {
    en: 'From 7th guest (__COUNT__ people, slots 7–__P__)',
    fr: 'À partir de la 7e personne (__COUNT__ pers., places 7–__P__)',
  },
  'checkout.extension_row': {
    en: 'Whole-trip option (+A$15)',
    fr: 'Option « tout le séjour » (+15 $ AUD)',
  },
  'checkout.total_row': { en: 'Total', fr: 'Total' },
  'checkout.potential_savings': {
    en: '💰 Potential savings: about A$__AMOUNT__+ on meals & tours — this pass can pay for itself.',
    fr: '💰 Économies potentielles : environ __AMOUNT__ $ AUD+ sur repas et visites — ce pass peut se rentabiliser.',
  },
  'checkout.savings_before_one': {
    en: 'With 1 person, you could save over ',
    fr: 'Avec 1 personne, vous pourriez économiser plus de ',
  },
  'checkout.savings_before_many': {
    en: 'With __COUNT__ people, you could save over ',
    fr: 'Avec __COUNT__ personnes, vous pourriez économiser plus de ',
  },
  'checkout.savings_after_amount': {
    en: ' on a single meal or tour',
    fr: ' sur un repas ou une visite',
  },
  'checkout.savings_subline': {
    en: 'This pass pays for itself immediately!',
    fr: 'Ce pass se rentabilise immédiatement !',
  },
  'checkout.profile_party_title': { en: 'From your registration', fr: 'D’après votre inscription' },
  'checkout.profile_party_line': {
    en: '__ADULTS__ adults, __CHILDREN__ children (6+), __INFANTS__ under 6 / infants (free). Paying party for this pass: __PARTY__.',
    fr: '__ADULTS__ adultes, __CHILDREN__ enfants (6+), __INFANTS__ moins de 6 ans / bébés (gratuit). Groupe payant pour ce pass : __PARTY__.',
  },
  'checkout.option_day_title': { en: '1-day discounts', fr: 'Réductions 1 jour' },
  'checkout.option_day_desc': {
    en: 'Short visit — discounts on one calendar day you choose.',
    fr: 'Courte visite — réductions sur un jour calendaire au choix.',
  },
  'checkout.option_extended_title': { en: 'Whole trip (+A$15)', fr: 'Tout le séjour (+15 $ AUD)' },
  'checkout.option_extended_desc': {
    en: 'Covers longer visits — __CAL__ calendar days of deal access from your start date.',
    fr: 'Pour les séjours plus longs — __CAL__ jours calendaires d’accès aux offres à partir de la date de début.',
  },
  'checkout.option_extended_badge': {
    en: 'Recommended for your __NIGHTS__-night stay',
    fr: 'Recommandé pour un séjour de __NIGHTS__ nuits',
  },
  'checkout.option_total': { en: 'Total', fr: 'Total' },
  'checkout.how_it_works_compact': {
    en: 'Pick who is covered (ages 6+), choose a 24-hour day pass or 7-day holiday pass, then your start date. Under-6 children travel free with your group.',
    fr: 'Choisissez qui est couvert (6 ans +), pass 24 h ou pass vacances 7 jours, puis la date de début. Les moins de 6 ans voyagent gratuitement.',
  },
  'checkout.party_summary_label': { en: 'Your pass', fr: 'Votre pass' },
  'checkout.party_summary_line': {
    en: 'Pass for __N__ people (ages 6+)',
    fr: 'Pass pour __N__ personnes (6 ans et +)',
  },
  'checkout.party_edit': { en: 'Edit', fr: 'Modifier' },
  'checkout.party_done': { en: 'Done', fr: 'Terminé' },
  'checkout.plan_pick_title': { en: 'Choose plan', fr: 'Choisir le forfait' },
  'checkout.plan_day_title': { en: '24-Hour Day Pass', fr: 'Pass 24 heures' },
  'checkout.plan_day_sub': {
    en: 'Great for cruise ships and short stops.',
    fr: 'Idéal pour les croisières et les escales courtes.',
  },
  'checkout.plan_holiday_title': { en: '7-Day Holiday Pass', fr: 'Pass vacances 7 jours' },
  'checkout.plan_holiday_sub': {
    en: 'Best for stayover visitors — 7 calendar days of deal access (+A$15). Share the app after purchase for 7 extra days free (14 days of deals total).',
    fr: 'Idéal pour les séjours — 7 jours calendaires d’accès (+15 $ AUD). Partagez l’app après achat pour 7 jours supplémentaires gratuits (14 jours d’offres au total).',
  },
  'checkout.share_second_week_unlock': {
    en: 'Share this app and get 7 extra days FREE!!',
    fr: 'Partagez l’application et obtenez 7 jours supplémentaires GRATUITS !!',
  },

  // Share bonus (7+7 Holiday Pass) — keep wording aligned across Pass card, checkout, receipts, dashboard
  'share.holiday_banner_days': {
    en: 'Share this app and get 7 extra days FREE!!',
    fr: 'Partagez l’application et obtenez 7 jours supplémentaires GRATUITS !!',
  },
  'share.holiday_banner_days_n': {
    en: 'Share this app and get __N__ extra days FREE!!',
    fr: 'Partagez l’application et obtenez __N__ jours supplémentaires GRATUITS !!',
  },
  'share.holiday_banner_combo': {
    en: 'Share this app — +__PEOPLE__ people FREE & 7 extra days FREE!!',
    fr: 'Partagez l’app — +__PEOPLE__ personnes gratuites et 7 jours supplémentaires GRATUITS !!',
  },
  'share.holiday_banner_people_only': {
    en: 'Share this app and unlock +__PEOPLE__ extra guests FREE!',
    fr: 'Partagez l’app et débloquez +__PEOPLE__ invités supplémentaires GRATUITS !',
  },
  'share.holiday_pill_days': {
    en: '7 extra days free',
    fr: '7 jours gratuits',
  },
  'share.extra_days_pill_n': {
    en: '__N__ extra days free',
    fr: '__N__ jours gratuits',
  },
  'share.holiday_card_subtext': {
    en: 'Unlock your bonus week! Share with friends to get 7 extra days free on your Holiday Pass.',
    fr: 'Débloquez votre semaine bonus ! Partagez avec des amis pour obtenir 7 jours supplémentaires gratuits sur votre pass vacances.',
  },
  'share.holiday_cta_header_sub': {
    en: '7+7 Holiday Pass — share the app for 7 extra days FREE!',
    fr: 'Pass vacances 7+7 — partagez l’app pour 7 jours supplémentaires GRATUITS !',
  },
  'share.holiday_navigator_body': {
    en: 'Share this app and get 7 extra days FREE!!',
    fr: 'Partagez l’application et obtenez 7 jours supplémentaires GRATUITS !!',
  },
  'share.qr_holiday_prompt': {
    en: 'You’ve got 7 days of deals — share this app for 7 extra days FREE on your Holiday Pass!',
    fr: 'Vous avez 7 jours d’offres — partagez l’app pour 7 jours supplémentaires GRATUITS sur votre pass vacances !',
  },
  'share.dashboard_unlock_button': {
    en: 'Share app — 7 extra days FREE',
    fr: 'Partager l’app — 7 jours gratuits',
  },
  'share.dashboard_coverage_pill': {
    en: '7 days included · share for 7 extra days free (14 days total)',
    fr: '7 jours inclus · partagez pour 7 jours gratuits en plus (14 j. au total)',
  },
  'share.dashboard_week1_validity': {
    en: 'First week shown (7 days). Share this app for 7 extra days free!',
    fr: '1re semaine affichée (7 j.). Partagez l’app pour 7 jours gratuits en plus !',
  },
  'share.qr_unlock_button': {
    en: 'Share app — 7 extra days FREE',
    fr: 'Partager l’app — 7 jours gratuits',
  },
  'share.qr_period_bonus_hint': {
    en: ' · Share app for 7 extra days free (14 days total)',
    fr: ' · Partagez l’app pour 7 jours gratuits en plus (14 j. au total)',
  },
  'share.receipt_holiday_subline_pending': {
    en: 'Your purchase includes a week of deal access. Share below for 7 extra days free (14 days of deals total).',
    fr: 'Votre achat inclut une semaine d’accès aux offres. Partagez ci-dessous pour 7 jours supplémentaires gratuits (14 jours d’offres au total).',
  },
  'share.receipt_header_holiday_pending': {
    en: '7-day deal access · share for 7 extra days free (14 days total)',
    fr: '7 jours d’offres · partagez pour 7 jours gratuits en plus (14 j. au total)',
  },
  'checkout.savings_anchor_v2': {
    en: 'With __COUNT__ people, you\'ll save more than the cost of this pass (A$__PASS__) on your very first meal or tour!',
    fr: 'Avec __COUNT__ personnes, vous économiserez plus que le prix de ce pass (__PASS__ $ AUD) dès votre premier repas ou tour !',
  },
  'checkout.period_badge_one_day': { en: '1 day', fr: '1 jour' },
  'checkout.period_badge_trip_nights': {
    en: 'Your trip: __NIGHTS__ nights',
    fr: 'Votre séjour : __NIGHTS__ nuits',
  },
  'checkout.period_badge_extended_generic': {
    en: 'Whole-trip coverage',
    fr: 'Couverture « tout le séjour »',
  },
  'checkout.period_legal_extended': {
    en: '__CAL__ calendar days of deal access (inclusive).',
    fr: '__CAL__ jours calendaires d’accès aux offres (inclus).',
  },
  'checkout.end_date_helper_short': {
    en: 'Same calendar day — discounts on the start date you choose.',
    fr: 'Même jour calendaire — réductions le jour de début choisi.',
  },
  'checkout.end_date_helper_extended': {
    en: 'Through this end date (inclusive). Deal access lasts __CAL__ calendar days from your start.',
    fr: 'Jusqu’à cette date de fin (inclus). L’accès aux offres dure __CAL__ jours calendaires à partir du début.',
  },
  'checkout.section_pass_group': { en: 'Pass & group', fr: 'Pass et groupe' },
  'checkout.section_dates': { en: 'When discounts apply', fr: 'Quand les réductions s’appliquent' },
  'checkout.section_dates_sub': {
    en: 'Pick when deal discounts turn on — the end date is set automatically from your pass type.',
    fr: 'Choisissez l’activation des réductions — la fin est calculée selon votre type de pass.',
  },
  'checkout.discount_window_card_title': {
    en: 'Your discount window',
    fr: 'Votre fenêtre de réductions',
  },
  'checkout.period_badge_pass_window': {
    en: '__CAL__-day deal access',
    fr: '__CAL__ j. d’accès aux offres',
  },
  'checkout.window_trip_hint': {
    en: 'Your trip is __NIGHTS__ nights — align your start date with when you want to use deals.',
    fr: 'Votre séjour : __NIGHTS__ nuits — alignez la date de début avec l’usage des offres.',
  },
  'checkout.window_label_start': { en: 'Start', fr: 'Début' },
  'checkout.window_label_end': { en: 'End', fr: 'Fin' },
  'checkout.order_summary_deals_short': {
    en: 'Unlimited deal redemptions for your chosen coverage window.',
    fr: 'Offres illimitées pendant la période choisie.',
  },
  'checkout.order_summary_deals_extended': {
    en: 'Deal access runs __CAL__ calendar days from your start date (inclusive).',
    fr: 'L’accès aux offres court __CAL__ jours calendaires à partir de la date de début (inclus).',
  },
  'checkout.summary_duration_label': { en: 'Your stay', fr: 'Votre séjour' },
  'checkout.summary_calendar_note': {
    en: '__CAL__ calendar days of access',
    fr: '__CAL__ jours calendaires d’accès',
  },
  'pass.buy': { en: 'Buy Now', fr: 'Acheter' },
  'pass.feature1': { en: 'Access all deals', fr: 'Accès à toutes les offres' },
  'pass.feature2': { en: 'Visual Pass card', fr: 'Carte Pass visuelle' },
  'pass.feature3': { en: 'Map navigation', fr: 'Navigation carte' },

  'pass.know_before_title': { en: 'Know before you buy', fr: 'À savoir avant d’acheter' },
  'pass.know_trip_line': {
    en: 'From your profile: {days} days · {party} people toward pass limits (adults & children only; infants not counted).',
    fr: 'D’après votre profil : {days} j · {party} personnes pour les limites du pass (adultes et enfants ; bébés non comptés).',
  },
  'pass.know_bullet_1': {
    en: 'Share Bonus — unlocks extra people and/or discount days after you purchase (via Share the app).',
    fr: 'Bonus de partage — débloque des places et/ou des jours de réduction après l’achat (via Partager l’app).',
  },
  'pass.know_bullet_2': {
    en: 'Each pass card shows its base limits — compare them to your trip length and group size.',
    fr: 'Chaque carte indique ses limites de base — comparez-les à la durée du séjour et à la taille du groupe.',
  },
  'pass.know_bullet_3': {
    en: 'After buying, use Share the app on your pass screen to apply Share Bonus.',
    fr: 'Après l’achat, utilisez Partager l’app sur l’écran du pass pour activer le bonus.',
  },
  'pass.know_bullet_4': {
    en: 'You choose which days to use discounts; the pass expires on its end date, not when you leave the island.',
    fr: 'Vous choisissez les jours d’utilisation ; le pass expire à sa date de fin, pas à votre départ.',
  },
  'pass.know_support': {
    en: 'For very large groups or long stays, one pass may not be enough — contact support or consider multiple passes.',
    fr: 'Pour les très grands groupes ou longs séjours, un pass peut ne pas suffire — contactez le support ou plusieurs pass.',
  },
  'passFlow.checkout_preview': {
    en: 'Checkout will use {party} guests (ages 6+) · {duration} — A$15 first, then A$10 each additional guest up to 20; +A$15 for whole-trip (edit before paying).',
    fr: 'Paiement : {party} voyageurs (6+) · {duration} — 15 $ 1re pers., puis 10 $ par invité supplémentaire jusqu’à 20 ; +15 $ séjour (modifiable avant paiement).',
  },
  'passFlow.duration_short': { en: '1-day', fr: '1 jour' },
  'passFlow.duration_extended': { en: 'whole-trip', fr: 'tout le séjour' },
  'passFlow.redirecting': {
    en: 'Taking you to checkout…',
    fr: 'Redirection vers le paiement…',
  },
  'passFlow.home_skip_title': { en: 'Your pass', fr: 'Votre pass' },
  'passFlow.home_skip_desc': {
    en: 'Continue to secure checkout. Party size and pass length use your profile — change them anytime before you pay.',
    fr: 'Poursuivre vers le paiement sécurisé. Taille du groupe et durée d’après votre profil — modifiables avant paiement.',
  },
  'passFlow.home_skip_cta': { en: 'Continue to checkout', fr: 'Aller au paiement' },
  'passFlow.home_passes_info_link': {
    en: 'Full pass details & pricing',
    fr: 'Détails et tarifs du pass',
  },

  // Business
  'biz.featured': { en: 'Featured Deals', fr: 'Offres en vedette' },
  'biz.all': { en: 'All Deals', fr: 'Toutes les offres' },
  'biz.viewdeal': { en: 'View Deal', fr: 'Voir l\'offre' },
  'biz.reviews': { en: 'reviews', fr: 'avis' },
  'biz.hours': { en: 'Hours', fr: 'Horaires' },
  'biz.phone': { en: 'Phone', fr: 'Téléphone' },
  'biz.location': { en: 'Location', fr: 'Emplacement' },
  'biz.save': { en: 'Save', fr: 'Sauvegarder' },
  
  // Map
  'map.title': { en: 'Explore Vanuatu', fr: 'Explorez le Vanuatu' },
  'map.subtitle': { en: 'Find deals near you on the interactive map', fr: 'Trouvez des offres près de vous sur la carte interactive' },
  
  // Reviews
  'review.title': { en: 'What Tourists Say', fr: 'Ce que disent les touristes' },
  'review.write': { en: 'Write a Review', fr: 'Écrire un avis' },
  'review.submit': { en: 'Submit Review', fr: 'Soumettre l\'avis' },
  
  // Dashboard
  'dash.title': { en: 'My Dashboard', fr: 'Mon tableau de bord' },
  'dash.passes': { en: 'My Passes', fr: 'Mes pass' },
  'dash.favorites': { en: 'Favorites', fr: 'Favoris' },
  'dash.favorites_list_heading': {
    en: 'Your saved places',
    fr: 'Vos adresses enregistrées',
  },
  'dash.favorites_list_empty': {
    en: 'Browse deals and tap the heart on a listing to save it here.',
    fr: 'Parcourez les offres et touchez le cœur sur une annonce pour l’enregistrer ici.',
  },
  'dash.favorites_back_dashboard': {
    en: 'Back to dashboard',
    fr: 'Retour au tableau de bord',
  },
  'dash.history': { en: 'Redemption History', fr: 'Historique d\'utilisation' },
  'dash.nopass': { en: 'No active pass. Get one to start saving!', fr: 'Pas de pass actif. Obtenez-en un pour commencer à économiser!' },
  'dash.pass_prefs_title': { en: 'Pass checkout defaults', fr: 'Préférences d’achat du pass' },
  'dash.pass_prefs_sub': {
    en: 'Used when you open checkout (you can still change before paying).',
    fr: 'Utilisées à l’ouverture du paiement (modifiable avant de payer).',
  },
  'passPrefs.group_label': { en: 'Typical group size', fr: 'Taille du groupe habituel' },
  'passPrefs.group_hint_none': {
    en: 'No saved default — checkout uses your travel party or 1 guest.',
    fr: 'Aucune valeur enregistrée — le paiement utilise votre groupe voyage ou 1 personne.',
  },
  'passPrefs.group_hint_saved': {
    en: 'Next checkout will start with this group size.',
    fr: 'Le prochain paiement commencera avec cette taille de groupe.',
  },
  'passPrefs.just_me': { en: 'Just me (clear saved size)', fr: 'Moi seul (effacer la taille)' },
  'passPrefs.people_n': { en: '{n} people', fr: '{n} personnes' },
  'passPrefs.duration_label': { en: 'Preferred pass length', fr: 'Durée du pass préférée' },
  'passPrefs.duration_short': { en: '24 hours (1 day)', fr: '24 heures (1 jour)' },
  'passPrefs.duration_extended': { en: '7 days (+ share → 14)', fr: '7 jours (+ partage → 14)' },
  'passPrefs.save': { en: 'Save preferences', fr: 'Enregistrer' },
  'passPrefs.saving': { en: 'Saving…', fr: 'Enregistrement…' },
  'passPrefs.saved': { en: 'Preferences saved', fr: 'Préférences enregistrées' },
  'passPrefs.save_failed': { en: 'Could not save preferences', fr: 'Impossible d’enregistrer' },
  'passPrefs.post_title': { en: 'Remember this pass setup?', fr: 'Mémoriser cette configuration ?' },
  'passPrefs.post_desc': {
    en: 'Save the group size and pass length you just bought as your defaults for next time.',
    fr: 'Enregistrer la taille du groupe et la durée achetées comme valeurs par défaut.',
  },
  'passPrefs.post_remember': { en: 'Save as my defaults', fr: 'Enregistrer comme défauts' },
  'passPrefs.post_save': { en: 'Save', fr: 'Enregistrer' },
  'passPrefs.post_skip': { en: 'Not now', fr: 'Pas maintenant' },
  
  // Footer
  'footer.about': { en: 'About StikmNek', fr: 'À propos de StikmNek' },
  'footer.abouttext': { en: 'StikmNek connects tourists with the best local businesses across Vanuatu. Save money while experiencing authentic island culture.', fr: 'StikmNek connecte les touristes avec les meilleures entreprises locales à travers le Vanuatu. Économisez tout en vivant la culture insulaire authentique.' },
  'footer.nameMeaningTitle': { en: 'What does “StikmNek” mean?', fr: 'Que signifie « StikmNek » ?' },
  'footer.nameMeaningBody': {
    en: 'It’s Bislama slang for approaching with confidence and charm to get someone interested — the Vanuatu way of friendly persuasion.',
    fr: 'C’est un terme d’argot en bichlamar : approcher avec confiance et charme pour susciter l’intérêt — une persuasion amicale à la manière du Vanuatu.',
  },
  'footer.whyBuiltTitle': { en: 'Why we built StikmNek', fr: 'Pourquoi nous avons créé StikmNek' },
  'footer.whyBuiltBody': {
    en: 'Local businesses wanted tourists but didn’t have websites. Tourists said Vanuatu feels expensive. StikmNek helps businesses get discovered and helps tourists unlock fair local deals — keeping more value with grassroots operators.',
    fr: 'Les entreprises locales voulaient plus de touristes sans avoir de site. Les voyageurs disaient que le Vanuatu est cher. StikmNek aide les entreprises à être trouvées et aide les touristes à accéder à des offres locales justes — en soutenant les opérateurs de proximité.',
  },
  'footer.local_badge': {
    en: '100% locally owned · Supporting grassroots businesses',
    fr: '100 % localement détenu · Soutien aux entreprises locales',
  },
  'footer.links': { en: 'Quick Links', fr: 'Liens rapides' },
  'footer.support': { en: 'Support', fr: 'Support' },
  'footer.legal': { en: 'Legal', fr: 'Légal' },
  'footer.privacy': { en: 'Privacy Policy', fr: 'Politique de confidentialité' },
  'footer.terms': { en: 'Terms of Service', fr: 'Conditions d\'utilisation' },
  'footer.business_partner': {
    en: 'Business partner & listing terms',
    fr: 'Partenaires & conditions d’inscription',
  },
  'footer.gdpr': { en: 'GDPR Compliance', fr: 'Conformité RGPD' },
  'footer.contact': { en: 'Contact Us', fr: 'Contactez-nous' },
  'footer.faq': { en: 'FAQ', fr: 'FAQ' },
  'footer.business': { en: 'List Your Business', fr: 'Inscrivez votre entreprise' },
  'footer.copyright': { en: '© 2026 StikmNek. All rights reserved.', fr: '© 2026 StikmNek. Tous droits réservés.' },
  
  // Auth
  'auth.signin': { en: 'Sign In', fr: 'Connexion' },
  'auth.signup': { en: 'Sign Up', fr: 'Inscription' },
  'auth.email': { en: 'Email', fr: 'Email' },
  'auth.password': { en: 'Password', fr: 'Mot de passe' },
  'auth.name': { en: 'Full Name', fr: 'Nom complet' },
  'auth.tourist': { en: 'Tourist', fr: 'Touriste' },
  'auth.business': { en: 'Business Owner', fr: 'Propriétaire d\'entreprise' },
  
  // General
  'general.search': { en: 'Search deals, businesses...', fr: 'Rechercher des offres, entreprises...' },
  'general.loading': { en: 'Loading...', fr: 'Chargement...' },
  'general.close': { en: 'Close', fr: 'Fermer' },
  'general.back': { en: 'Back', fr: 'Retour' },
  'general.save': { en: 'Save', fr: 'Sauvegarder' },
  'general.cancel': { en: 'Cancel', fr: 'Annuler' },
  'general.off': { en: 'OFF', fr: 'DE RÉDUCTION' },
  'general.per_person': { en: 'per person', fr: 'par personne' },
};

export function t(key: string, lang: Language): string {
  return translations[key]?.[lang] || translations[key]?.['en'] || key;
}
