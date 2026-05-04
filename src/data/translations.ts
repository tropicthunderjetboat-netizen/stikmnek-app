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
  'pass.title': { en: 'Build your Pass', fr: 'Construisez votre pass', bi: 'Mekem Pasem' },
  'pass.subtitle': {
    en: 'Customize your adventure with flexible pricing',
    fr: 'Personnalisez votre aventure avec une tarification flexible',
    bi: 'Kostomem yor travel long fleksibel pricing',
  },
  'passSelection.title': { en: 'Build your Pass', fr: 'Construisez votre pass', bi: 'Mekem Pasem' },
  'passSelection.subtitle': {
    en: 'Customize your adventure with flexible pricing',
    fr: 'Personnalisez votre aventure avec une tarification flexible',
    bi: 'Kostomem yor travel long fleksibel pricing',
  },
  'pass.build_how_desc': {
    en: 'On Passes, pricing starts at A$15 for the first guest plus A$5 per additional guest (ages 6+), up to 6 per pass. Pick a 24-hour or 7-day holiday plan and checkout — your total updates instantly.',
    fr: 'Dans Passes, les prix commencent à 15 $ AUD pour la 1re personne + 5 $ par invité supplémentaire (6 ans et +), jusqu’à 6 par pass. Choisissez 24 h ou 7 jours, puis payez — le total se met à jour instantanément.',
    bi: 'Long Pas, praes i stat long A$15 long fes man + A$5 long evri narafala (6+), kasem 6 long wan pas. Jusum 24 owa o 7 dei, mo pei — total i apdet stretwe.',
  },

  // Checkout (pricing summary + conversion)
  'checkout.breakdown_title': { en: 'Price breakdown', fr: 'Détail du prix', bi: 'Prais brekdaon' },
  'checkout.base_pass_row': {
    en: 'Base pass (1st person ages 6+)',
    fr: 'Pass de base (1re personne, 6 ans et +)',
    bi: 'Bes pas (fes man 6+)',
  },
  'checkout.extra_guests_row': {
    en: 'Additional guests (__COUNT__ × A$__FEE__)',
    fr: 'Invités supplémentaires (__COUNT__ × __FEE__ $ AUD)',
    bi: 'Narafala man (__COUNT__ × A$__FEE__)',
  },
  'checkout.extension_row': {
    en: 'Whole-trip option (+A$10)',
    fr: 'Option « tout le séjour » (+10 $ AUD)',
    bi: 'Opsen long ful trip (+A$10)',
  },
  'checkout.total_row': { en: 'Total', fr: 'Total', bi: 'Total' },
  'checkout.potential_savings': {
    en: '💰 Potential savings: about A$__AMOUNT__+ on meals & tours — this pass can pay for itself.',
    fr: '💰 Économies potentielles : environ __AMOUNT__ $ AUD+ sur repas et visites — ce pass peut se rentabiliser.',
    bi: '💰 Saving we i save: kasem A$__AMOUNT__+ long kakae mo tua — dis pas i save pei bake.',
  },
  'checkout.savings_before_one': {
    en: 'With 1 person, you could save over ',
    fr: 'Avec 1 personne, vous pourriez économiser plus de ',
    bi: 'Wet wan man, yu save kasem ',
  },
  'checkout.savings_before_many': {
    en: 'With __COUNT__ people, you could save over ',
    fr: 'Avec __COUNT__ personnes, vous pourriez économiser plus de ',
    bi: 'Wet __COUNT__ man, yu save kasem ',
  },
  'checkout.savings_after_amount': {
    en: ' on a single meal or tour',
    fr: ' sur un repas ou une visite',
    bi: ' long wan kakae o wan tua',
  },
  'checkout.savings_subline': {
    en: 'This pass pays for itself immediately!',
    fr: 'Ce pass se rentabilise immédiatement !',
    bi: 'Dis pas i pei bake stret!',
  },
  'checkout.profile_party_title': { en: 'From your registration', fr: 'D’après votre inscription', bi: 'Long rejistresen' },
  'checkout.profile_party_line': {
    en: '__ADULTS__ adults, __CHILDREN__ children (6+), __INFANTS__ under 6 / infants (free). Paying party for this pass: __PARTY__.',
    fr: '__ADULTS__ adultes, __CHILDREN__ enfants (6+), __INFANTS__ moins de 6 ans / bébés (gratuit). Groupe payant pour ce pass : __PARTY__.',
    bi: '__ADULTS__ bigman, __CHILDREN__ pikinini (6+), __INFANTS__ under 6 / infen (fri). Grup blong pem: __PARTY__.',
  },
  'checkout.option_day_title': { en: '1-day discounts', fr: 'Réductions 1 jour', bi: 'Diskaun wan dei' },
  'checkout.option_day_desc': {
    en: 'Short visit — discounts on one calendar day you choose.',
    fr: 'Courte visite — réductions sur un jour calendaire au choix.',
    bi: 'Sot visit — diskount long wan kalenda dei yu josem.',
  },
  'checkout.option_extended_title': { en: 'Whole trip (+A$10)', fr: 'Tout le séjour (+10 $ AUD)', bi: 'Ful trip (+A$10)' },
  'checkout.option_extended_desc': {
    en: 'Covers longer visits — __CAL__ calendar days of deal access from your start date.',
    fr: 'Pour les séjours plus longs — __CAL__ jours calendaires d’accès aux offres à partir de la date de début.',
    bi: 'Long visit we i long — __CAL__ kalenda dei blong akses long ol dils long det blong stat.',
  },
  'checkout.option_extended_badge': {
    en: 'Recommended for your __NIGHTS__-night stay',
    fr: 'Recommandé pour un séjour de __NIGHTS__ nuits',
    bi: 'Rekomendem blong __NIGHTS__ naet yu stap',
  },
  'checkout.option_total': { en: 'Total', fr: 'Total', bi: 'Total' },
  'checkout.how_it_works_compact': {
    en: 'Pick who is covered (ages 6+), choose a 24-hour day pass or 7-day holiday pass, then your start date. Under-6 children travel free with your group.',
    fr: 'Choisissez qui est couvert (6 ans +), pass 24 h ou pass vacances 7 jours, puis la date de début. Les moins de 6 ans voyagent gratuitement.',
    bi: 'Jusum hu i kava (6+), wan dei pas o 7 dei holiday pas, mo det blong stat. Pikinini under 6 i fri wetem grup.',
  },
  'checkout.party_summary_label': { en: 'Your pass', fr: 'Votre pass', bi: 'Pas blong yu' },
  'checkout.party_summary_line': {
    en: 'Pass for __N__ people (ages 6+)',
    fr: 'Pass pour __N__ personnes (6 ans et +)',
    bi: 'Pas blong __N__ man (6+)',
  },
  'checkout.party_edit': { en: 'Edit', fr: 'Modifier', bi: 'Senis' },
  'checkout.party_done': { en: 'Done', fr: 'Terminé', bi: 'Finis' },
  'checkout.plan_pick_title': { en: 'Choose plan', fr: 'Choisir le forfait', bi: 'Jusum plan' },
  'checkout.plan_day_title': { en: '24-Hour Day Pass', fr: 'Pass 24 heures', bi: 'Pas 24 Awa' },
  'checkout.plan_day_sub': {
    en: 'Great for cruise ships and short stops.',
    fr: 'Idéal pour les croisières et les escales courtes.',
    bi: 'Bes blong kruz sip mo sot stop.',
  },
  'checkout.plan_holiday_title': { en: '7-Day Holiday Pass', fr: 'Pass vacances 7 jours', bi: 'Holiday Pas 7 Dei' },
  'checkout.plan_holiday_sub': {
    en: 'Best for stayover visitors — 7 calendar days of deal access (+A$10). Share the app after purchase for 7 extra days free (14 days of deals total).',
    fr: 'Idéal pour les séjours — 7 jours calendaires d’accès (+10 $ AUD). Partagez l’app après achat pour 7 jours supplémentaires gratuits (14 jours d’offres au total).',
    bi: 'Bes blong taem yu stap — 7 kalenda dei akses (+A$10). Serem app afta bai blong 7 dei moa blong free (14 dei long total).',
  },
  'checkout.share_second_week_unlock': {
    en: 'Share this app and get 7 extra days FREE!!',
    fr: 'Partagez l’application et obtenez 7 jours supplémentaires GRATUITS !!',
    bi: 'Sherem olgeta ap ia mo kasem 7 dei moa BLONG FREE!!',
  },

  // Share bonus (7+7 Holiday Pass) — keep wording aligned across Pass card, checkout, receipts, dashboard
  'share.holiday_banner_days': {
    en: 'Share this app and get 7 extra days FREE!!',
    fr: 'Partagez l’application et obtenez 7 jours supplémentaires GRATUITS !!',
    bi: 'Sherem olgeta ap ia mo kasem 7 dei moa BLONG FREE!!',
  },
  'share.holiday_banner_days_n': {
    en: 'Share this app and get __N__ extra days FREE!!',
    fr: 'Partagez l’application et obtenez __N__ jours supplémentaires GRATUITS !!',
    bi: 'Sherem olgeta ap ia mo kasem __N__ dei moa BLONG FREE!!',
  },
  'share.holiday_banner_combo': {
    en: 'Share this app — +__PEOPLE__ people FREE & 7 extra days FREE!!',
    fr: 'Partagez l’app — +__PEOPLE__ personnes gratuites et 7 jours supplémentaires GRATUITS !!',
    bi: 'Sherem ap — +__PEOPLE__ man fri mo 7 dei moa BLONG FREE!!',
  },
  'share.holiday_banner_people_only': {
    en: 'Share this app and unlock +__PEOPLE__ extra guests FREE!',
    fr: 'Partagez l’app et débloquez +__PEOPLE__ invités supplémentaires GRATUITS !',
    bi: 'Sherem ap mo anlokem +__PEOPLE__ narafala man fri!',
  },
  'share.holiday_pill_days': {
    en: '7 extra days free',
    fr: '7 jours gratuits',
    bi: '7 dei blong free',
  },
  'share.extra_days_pill_n': {
    en: '__N__ extra days free',
    fr: '__N__ jours gratuits',
    bi: '__N__ dei blong free',
  },
  'share.holiday_card_subtext': {
    en: 'Unlock your bonus week! Share with friends to get 7 extra days free on your Holiday Pass.',
    fr: 'Débloquez votre semaine bonus ! Partagez avec des amis pour obtenir 7 jours supplémentaires gratuits sur votre pass vacances.',
    bi: 'Anlokem bonus wik! Sherem wetem ol frend blong kasem 7 dei moa blong free long Holiday Pas blong yu.',
  },
  'share.holiday_cta_header_sub': {
    en: '7+7 Holiday Pass — share the app for 7 extra days FREE!',
    fr: 'Pass vacances 7+7 — partagez l’app pour 7 jours supplémentaires GRATUITS !',
    bi: 'Holiday pas 7+7 — sherem ap blong 7 dei moa BLONG FREE!',
  },
  'share.holiday_navigator_body': {
    en: 'Share this app and get 7 extra days FREE!!',
    fr: 'Partagez l’application et obtenez 7 jours supplémentaires GRATUITS !!',
    bi: 'Sherem olgeta ap ia mo kasem 7 dei moa BLONG FREE!!',
  },
  'share.qr_holiday_prompt': {
    en: 'You’ve got 7 days of deals — share this app for 7 extra days FREE on your Holiday Pass!',
    fr: 'Vous avez 7 jours d’offres — partagez l’app pour 7 jours supplémentaires GRATUITS sur votre pass vacances !',
    bi: 'Yu gat 7 dei blong dils — sherem ap ia blong 7 dei moa BLONG FREE long Holiday Pas!',
  },
  'share.dashboard_unlock_button': {
    en: 'Share app — 7 extra days FREE',
    fr: 'Partager l’app — 7 jours gratuits',
    bi: 'Sherem ap — 7 dei blong free',
  },
  'share.dashboard_coverage_pill': {
    en: '7 days included · share for 7 extra days free (14 days total)',
    fr: '7 jours inclus · partagez pour 7 jours gratuits en plus (14 j. au total)',
    bi: '7 dei i stap insaed · sherem blong 7 dei moa blong free (14 dei)',
  },
  'share.dashboard_week1_validity': {
    en: 'First week shown (7 days). Share this app for 7 extra days free!',
    fr: '1re semaine affichée (7 j.). Partagez l’app pour 7 jours gratuits en plus !',
    bi: 'Fes wik 7 dei i soem. Sherem ap ia blong 7 dei moa blong free!',
  },
  'share.qr_unlock_button': {
    en: 'Share app — 7 extra days FREE',
    fr: 'Partager l’app — 7 jours gratuits',
    bi: 'Sherem ap — 7 dei blong free',
  },
  'share.qr_period_bonus_hint': {
    en: ' · Share app for 7 extra days free (14 days total)',
    fr: ' · Partagez l’app pour 7 jours gratuits en plus (14 j. au total)',
    bi: ' · Sherem ap blong 7 dei moa blong free (14 dei)',
  },
  'share.receipt_holiday_subline_pending': {
    en: 'Your purchase includes a week of deal access. Share below for 7 extra days free (14 days of deals total).',
    fr: 'Votre achat inclut une semaine d’accès aux offres. Partagez ci-dessous pour 7 jours supplémentaires gratuits (14 jours d’offres au total).',
    bi: 'Bai blong yu i gat wan wik blong dils. Sherem daun blong 7 dei moa blong free (14 dei long total).',
  },
  'share.receipt_header_holiday_pending': {
    en: '7-day deal access · share for 7 extra days free (14 days total)',
    fr: '7 jours d’offres · partagez pour 7 jours gratuits en plus (14 j. au total)',
    bi: '7 dei dils · sherem blong 7 dei moa blong free (14 dei)',
  },
  'checkout.savings_anchor_v2': {
    en: 'With __COUNT__ people, you\'ll save more than the cost of this pass (A$__PASS__) on your very first meal or tour!',
    fr: 'Avec __COUNT__ personnes, vous économiserez plus que le prix de ce pass (__PASS__ $ AUD) dès votre premier repas ou tour !',
    bi: 'Wet __COUNT__ man, bae yu save moa long kost blong dis pas (A$__PASS__) long fes kakae o tua!',
  },
  'checkout.period_badge_one_day': { en: '1 day', fr: '1 jour', bi: 'wan dei' },
  'checkout.period_badge_trip_nights': {
    en: 'Your trip: __NIGHTS__ nights',
    fr: 'Votre séjour : __NIGHTS__ nuits',
    bi: 'Trip blong yu: __NIGHTS__ naet',
  },
  'checkout.period_badge_extended_generic': {
    en: 'Whole-trip coverage',
    fr: 'Couverture « tout le séjour »',
    bi: 'Kava long ful trip',
  },
  'checkout.period_legal_extended': {
    en: '__CAL__ calendar days of deal access (inclusive).',
    fr: '__CAL__ jours calendaires d’accès aux offres (inclus).',
    bi: '__CAL__ kalenda dei blong akses long dils (i kaont olgeta).',
  },
  'checkout.end_date_helper_short': {
    en: 'Same calendar day — discounts on the start date you choose.',
    fr: 'Même jour calendaire — réductions le jour de début choisi.',
    bi: 'Sem wan kalenda dei — diskount long det blong stat.',
  },
  'checkout.end_date_helper_extended': {
    en: 'Through this end date (inclusive). Deal access lasts __CAL__ calendar days from your start.',
    fr: 'Jusqu’à cette date de fin (inclus). L’accès aux offres dure __CAL__ jours calendaires à partir du début.',
    bi: 'Kasem det blong finis (i kaont). Akses long dils i last __CAL__ kalenda dei long stat.',
  },
  'checkout.section_pass_group': { en: 'Pass & group', fr: 'Pass et groupe', bi: 'Pas mo grup' },
  'checkout.section_dates': { en: 'When discounts apply', fr: 'Quand les réductions s’appliquent', bi: 'Taem diskount i ap' },
  'checkout.order_summary_deals_short': {
    en: 'Unlimited deal redemptions for your chosen coverage window.',
    fr: 'Offres illimitées pendant la période choisie.',
    bi: 'Ol dils we i no lim long taem yu josem.',
  },
  'checkout.order_summary_deals_extended': {
    en: 'Deal access runs __CAL__ calendar days from your start date (inclusive).',
    fr: 'L’accès aux offres court __CAL__ jours calendaires à partir de la date de début (inclus).',
    bi: 'Akses long dils i ran __CAL__ kalenda dei long det blong stat (i kaont olgeta).',
  },
  'checkout.summary_duration_label': { en: 'Your stay', fr: 'Votre séjour', bi: 'Taem yu stap' },
  'checkout.summary_calendar_note': {
    en: '__CAL__ calendar days of access',
    fr: '__CAL__ jours calendaires d’accès',
    bi: '__CAL__ kalenda dei blong akses',
  },
  'pass.buy': { en: 'Buy Now', fr: 'Acheter', bi: 'Baem Nao' },
  'pass.feature1': { en: 'Access all deals', fr: 'Accès à toutes les offres', bi: 'Akses olgeta dils' },
  'pass.feature2': { en: 'QR code coupons', fr: 'Coupons QR code', bi: 'QR kod kupons' },
  'pass.feature3': { en: 'Map navigation', fr: 'Navigation carte', bi: 'Map navigesen' },

  'pass.know_before_title': { en: 'Know before you buy', fr: 'À savoir avant d’acheter', bi: 'Save bifo yu bai' },
  'pass.know_trip_line': {
    en: 'From your profile: {days} days · {party} people toward pass limits (adults & children only; infants not counted).',
    fr: 'D’après votre profil : {days} j · {party} personnes pour les limites du pass (adultes et enfants ; bébés non comptés).',
    bi: 'Long profil: {days} dei · {party} man long pas (bigman mo pikinini taswe; bebi i no kaont).',
  },
  'pass.know_bullet_1': {
    en: 'Share Bonus — unlocks extra people and/or discount days after you purchase (via Share the app).',
    fr: 'Bonus de partage — débloque des places et/ou des jours de réduction après l’achat (via Partager l’app).',
    bi: 'Bonus afta serem — i adem moa pipol mo/oba moa dei diskount afta yu bai (serem app).',
  },
  'pass.know_bullet_2': {
    en: 'Each pass card shows its base limits — compare them to your trip length and group size.',
    fr: 'Chaque carte indique ses limites de base — comparez-les à la durée du séjour et à la taille du groupe.',
    bi: 'Evri kaed i soem base lim — kompem wetem len blong trip mo grup.',
  },
  'pass.know_bullet_3': {
    en: 'After buying, use Share the app on your pass screen to apply Share Bonus.',
    fr: 'Après l’achat, utilisez Partager l’app sur l’écran du pass pour activer le bonus.',
    bi: 'Afta bai, yusum Serem app long skrin pas blong bonus.',
  },
  'pass.know_bullet_4': {
    en: 'You choose which days to use discounts; the pass expires on its end date, not when you leave the island.',
    fr: 'Vous choisissez les jours d’utilisation ; le pass expire à sa date de fin, pas à votre départ.',
    bi: 'Yu josem dei blong yusum diskount; pas i finis long det blong hem, no taem yu liv aelan.',
  },
  'pass.know_support': {
    en: 'For very large groups or long stays, one pass may not be enough — contact support or consider multiple passes.',
    fr: 'Pour les très grands groupes ou longs séjours, un pass peut ne pas suffire — contactez le support ou plusieurs pass.',
    bi: 'Long bigfala grup o lon taem, wan pas i no save stret — askem support o tingbaot moa pas.',
  },
  'passFlow.checkout_preview': {
    en: 'Checkout will use {party} guests (ages 6+) · {duration} — starting at A$15 + A$5 per extra guest (edit before paying).',
    fr: 'Le paiement utilisera {party} voyageurs (6 ans et +) · {duration} — à partir de 15 $ + 5 $ par invité supplémentaire (modifiable avant paiement).',
    bi: 'Checkout bae yusum {party} man (6+) · {duration} — stat long A$15 + A$5 long narafala (yu ken senis bifo pem).',
  },
  'passFlow.duration_short': { en: '1-day', fr: '1 jour', bi: 'wan-dei' },
  'passFlow.duration_extended': { en: 'whole-trip', fr: 'tout le séjour', bi: 'ful-trip' },
  'passFlow.redirecting': {
    en: 'Taking you to checkout…',
    fr: 'Redirection vers le paiement…',
    bi: 'Go long checkout…',
  },
  'passFlow.home_skip_title': { en: 'Your pass', fr: 'Votre pass', bi: 'Pas blong yu' },
  'passFlow.home_skip_desc': {
    en: 'Continue to secure checkout. Party size and pass length use your profile — change them anytime before you pay.',
    fr: 'Poursuivre vers le paiement sécurisé. Taille du groupe et durée d’après votre profil — modifiables avant paiement.',
    bi: 'Go long sef checkout. Grup mo taem i blong profil blong yu — yu ken senis eni taem bifo pem.',
  },
  'passFlow.home_skip_cta': { en: 'Continue to checkout', fr: 'Aller au paiement', bi: 'Go long checkout' },
  'passFlow.home_passes_info_link': {
    en: 'Full pass details & pricing',
    fr: 'Détails et tarifs du pass',
    bi: 'Ful infomesen mo praes',
  },

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
  'dash.pass_prefs_title': { en: 'Pass checkout defaults', fr: 'Préférences d’achat du pass', bi: 'Pas checkout difolt' },
  'dash.pass_prefs_sub': {
    en: 'Used when you open checkout (you can still change before paying).',
    fr: 'Utilisées à l’ouverture du paiement (modifiable avant de payer).',
    bi: 'Yu savem taem yu openem checkout (yu ken senis bifo pem).',
  },
  'passPrefs.group_label': { en: 'Typical group size', fr: 'Taille du groupe habituel', bi: 'Grup saes' },
  'passPrefs.group_hint_none': {
    en: 'No saved default — checkout uses your travel party or 1 guest.',
    fr: 'Aucune valeur enregistrée — le paiement utilise votre groupe voyage ou 1 personne.',
    bi: 'No gat difolt — checkout i yusum grup blong trabel o 1 gest.',
  },
  'passPrefs.group_hint_saved': {
    en: 'Next checkout will start with this group size.',
    fr: 'Le prochain paiement commencera avec cette taille de groupe.',
    bi: 'Nekis checkout bae stat wetem grup saes ia.',
  },
  'passPrefs.just_me': { en: 'Just me (clear saved size)', fr: 'Moi seul (effacer la taille)', bi: 'Mi wan (klearim saes)' },
  'passPrefs.people_n': { en: '{n} people', fr: '{n} personnes', bi: '{n} pipol' },
  'passPrefs.duration_label': { en: 'Preferred pass length', fr: 'Durée du pass préférée', bi: 'Taem blong pas' },
  'passPrefs.duration_short': { en: '24 hours (1 day)', fr: '24 heures (1 jour)', bi: '24 ao (wan dei)' },
  'passPrefs.duration_extended': { en: '7 days (+ share → 14)', fr: '7 jours (+ partage → 14)', bi: '7 dei (+ serem → 14)' },
  'passPrefs.save': { en: 'Save preferences', fr: 'Enregistrer', bi: 'Sevem preference' },
  'passPrefs.saving': { en: 'Saving…', fr: 'Enregistrement…', bi: 'Sevem…' },
  'passPrefs.saved': { en: 'Preferences saved', fr: 'Préférences enregistrées', bi: 'Preference i sevem' },
  'passPrefs.save_failed': { en: 'Could not save preferences', fr: 'Impossible d’enregistrer', bi: 'No save preference' },
  'passPrefs.post_title': { en: 'Remember this pass setup?', fr: 'Mémoriser cette configuration ?', bi: 'Memorisaem pas setup?' },
  'passPrefs.post_desc': {
    en: 'Save the group size and pass length you just bought as your defaults for next time.',
    fr: 'Enregistrer la taille du groupe et la durée achetées comme valeurs par défaut.',
    bi: 'Sevem grup mo taem blong pas yu bao olsem difolt blong nekis taem.',
  },
  'passPrefs.post_remember': { en: 'Save as my defaults', fr: 'Enregistrer comme défauts', bi: 'Sevem olsem difolt' },
  'passPrefs.post_save': { en: 'Save', fr: 'Enregistrer', bi: 'Sevem' },
  'passPrefs.post_skip': { en: 'Not now', fr: 'Pas maintenant', bi: 'No nau' },
  
  // Footer
  'footer.about': { en: 'About StikmNek', fr: 'À propos de StikmNek', bi: 'Abaotem StikmNek' },
  'footer.abouttext': { en: 'StikmNek connects tourists with the best local businesses across Vanuatu. Save money while experiencing authentic island culture.', fr: 'StikmNek connecte les touristes avec les meilleures entreprises locales à travers le Vanuatu. Économisez tout en vivant la culture insulaire authentique.', bi: 'StikmNek i konetim turis wetem beswan lokal bisnis long Vanuatu. Sevem mani taem yu eksperiens tru aelan kalsa.' },
  'footer.links': { en: 'Quick Links', fr: 'Liens rapides', bi: 'Kwik Link' },
  'footer.support': { en: 'Support', fr: 'Support', bi: 'Sapot' },
  'footer.legal': { en: 'Legal', fr: 'Légal', bi: 'Ligo' },
  'footer.privacy': { en: 'Privacy Policy', fr: 'Politique de confidentialité', bi: 'Praevesi Polisi' },
  'footer.terms': { en: 'Terms of Service', fr: 'Conditions d\'utilisation', bi: 'Tems blong Sevis' },
  'footer.business_partner': {
    en: 'Business partner & listing terms',
    fr: 'Partenaires & conditions d’inscription',
    bi: 'Bisnis patna mo listem taem',
  },
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
