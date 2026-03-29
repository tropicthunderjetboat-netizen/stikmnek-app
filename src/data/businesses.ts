export type Category = 'dining' | 'activities' | 'tours' | 'shopping' | 'spa' | 'accommodation';

export interface Business {
  id: string;
  /**
   * Master `businesses` row when this listing row comes from `business_offerings`.
   * Use for favorites, reviews, `business_photos`, and redemption APIs (still keyed by profile id).
   */
  profileBusinessId?: string;
  /** Trading / venue name from profile (optional subtitle vs offer `title`). */
  profileName?: string;
  name: string;
  category: Category;
  description: string;
  descriptionFr: string;
  descriptionBi: string;
  image: string;
  rating: number;
  reviewCount: number;
  discount: string;
  originalPrice: number;
  dealPrice: number;
  location: string;
  lat: number;
  lng: number;
  /** Google Maps share / pin URL from listing (DB `map_url`). */
  mapUrl?: string | null;
  map_url?: string | null;
  website?: string | null;
  hours: string;
  phone: string;
  /** Public contact email from listing (if column exists in DB). */
  contactEmail?: string | null;
  whatsappNumber?: string | null;
  /** Same as DB `whatsapp_number` when row is passed through without mapping. */
  whatsapp_number?: string | null;
  tags: string[];
  featured: boolean;
  ownerId?: string | null;
  superStarCount?: number;
  /** Tiered pricing JSON from `pricing_tiers` (Tours / Activities). */
  pricingTiers?: unknown;
  /** From DB `active`; false = hidden from public listings (e.g. onboarding stub). */
  active?: boolean;
}

/** Tourist-facing lists: hide `active === false` DB rows; keep local fallback when DB empty or only stubs. */
export function publicListingBusinesses(db: Business[], local: Business[]): Business[] {
  if (db.length === 0) return local;
  const pub = db.filter((b) => b.active !== false);
  return pub.length > 0 ? pub : local;
}




export interface Review {
  id: string;
  businessId: string;
  userName: string;
  rating: number;
  comment: string;
  date: string;
  avatar: string;
}

export const categories: { key: Category; label: string; labelFr: string; labelBi: string; icon: string }[] = [
  { key: 'dining', label: 'Dining', labelFr: 'Restauration', labelBi: 'Kakae', icon: 'utensils' },
  { key: 'activities', label: 'Activities', labelFr: 'Activités', labelBi: 'Aktiviti', icon: 'waves' },
  { key: 'tours', label: 'Tours', labelFr: 'Visites', labelBi: 'Tua', icon: 'compass' },
  { key: 'shopping', label: 'Shopping', labelFr: 'Shopping', labelBi: 'Soping', icon: 'shopping-bag' },
  { key: 'spa', label: 'Spa & Wellness', labelFr: 'Spa & Bien-être', labelBi: 'Spa & Helt', icon: 'heart' },
  { key: 'accommodation', label: 'Accommodation', labelFr: 'Hébergement', labelBi: 'Ples blong slip', icon: 'home' },
];

// Fallback data used when DB hasn't loaded yet
// Prices are in Vanuatu Vatu (VT)
export const businesses: Business[] = [
  { id: 'b1', name: 'Waterfront Bar & Grill', category: 'dining', description: 'Enjoy fresh seafood with stunning harbour views. Our signature coconut crab is a must-try!', descriptionFr: 'Savourez des fruits de mer frais avec une vue imprenable sur le port.', descriptionBi: 'Enjoem fres sifud wetem nambawan viu blong haba.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856900792_67ead30b.jpg', rating: 4.8, reviewCount: 124, discount: '25% OFF', originalPrice: 5500, dealPrice: 4125, location: 'Seafront, Port Vila', lat: -17.7416, lng: 168.3120, hours: '11:00 AM - 10:00 PM', phone: '+678 22345', tags: ['seafood', 'waterfront', 'dinner'], featured: true },
  { id: 'b2', name: 'Nambawan Café', category: 'dining', description: 'Authentic Melanesian cuisine meets modern flavors.', descriptionFr: 'La cuisine mélanésienne authentique rencontre les saveurs modernes.', descriptionBi: 'Tru Melanesian kakae i mitim modern flavas.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856911430_8432056a.png', rating: 4.6, reviewCount: 89, discount: '20% OFF', originalPrice: 3500, dealPrice: 2800, location: 'Main Street, Port Vila', lat: -17.7390, lng: 168.3110, hours: '7:00 AM - 9:00 PM', phone: '+678 23456', tags: ['local cuisine', 'breakfast', 'lunch'], featured: true },
  { id: 'b3', name: 'Tropical Breeze Restaurant', category: 'dining', description: 'Fine dining with a tropical twist.', descriptionFr: 'Gastronomie avec une touche tropicale.', descriptionBi: 'Nambawan kakae wetem tropikal tanis.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856910655_1d6c7b2d.png', rating: 4.9, reviewCount: 201, discount: '30% OFF', originalPrice: 8500, dealPrice: 5950, location: 'Iririki Island Resort', lat: -17.7450, lng: 168.3050, hours: '6:00 PM - 11:00 PM', phone: '+678 24567', tags: ['fine dining', 'fusion', 'romantic'], featured: true },
  { id: 'b4', name: 'Vila Sunset Lounge', category: 'dining', description: 'Cocktails and tapas with the best sunset views.', descriptionFr: 'Cocktails et tapas avec les meilleures vues du coucher de soleil.', descriptionBi: 'Koktels mo tapas wetem beswan sunset viu.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856918924_80900148.png', rating: 4.5, reviewCount: 67, discount: '15% OFF', originalPrice: 4500, dealPrice: 3825, location: 'Erakor Lagoon', lat: -17.7520, lng: 168.3200, hours: '4:00 PM - 12:00 AM', phone: '+678 25678', tags: ['cocktails', 'sunset', 'live music'], featured: false },
  { id: 'b5', name: 'Blue Lagoon Snorkeling', category: 'activities', description: 'Explore vibrant coral reefs and swim with tropical fish.', descriptionFr: 'Explorez des récifs coralliens vibrants.', descriptionBi: 'Eksploarem nambawan korel rif.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856938935_27ebc816.png', rating: 4.9, reviewCount: 312, discount: '35% OFF', originalPrice: 10000, dealPrice: 6500, location: 'Blue Lagoon, Efate', lat: -17.6800, lng: 168.3500, hours: '8:00 AM - 4:00 PM', phone: '+678 26789', tags: ['snorkeling', 'marine life', 'adventure'], featured: true },
  { id: 'b6', name: 'Vanuatu Kayak Adventures', category: 'activities', description: 'Paddle through mangroves and hidden coves.', descriptionFr: 'Pagayez à travers les mangroves.', descriptionBi: 'Padol tru mangrov mo haed kof.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856947762_e1259494.png', rating: 4.7, reviewCount: 156, discount: '20% OFF', originalPrice: 7000, dealPrice: 5600, location: 'Mele Bay', lat: -17.7100, lng: 168.2800, hours: '7:00 AM - 6:00 PM', phone: '+678 27890', tags: ['kayaking', 'nature', 'sunset'], featured: false },
  { id: 'b7', name: 'Hideaway Island Diving', category: 'activities', description: 'Discover the underwater post office and marine sanctuary.', descriptionFr: 'Découvrez le bureau de poste sous-marin.', descriptionBi: 'Faenem andawota pos ofis.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856935987_2414e599.jpg', rating: 4.8, reviewCount: 245, discount: '25% OFF', originalPrice: 15000, dealPrice: 11250, location: 'Hideaway Island', lat: -17.7150, lng: 168.2650, hours: '8:00 AM - 5:00 PM', phone: '+678 28901', tags: ['diving', 'PADI', 'marine sanctuary'], featured: true },
  { id: 'b8', name: 'Cascade Waterfall Trek', category: 'activities', description: 'Guided jungle trek to the stunning Mele Cascades.', descriptionFr: 'Randonnée guidée dans la jungle.', descriptionBi: 'Gaeded jangol trek go long Mele Cascades.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856951990_2d695c38.png', rating: 4.6, reviewCount: 189, discount: '15% OFF', originalPrice: 5000, dealPrice: 4250, location: 'Mele Village', lat: -17.7000, lng: 168.2900, hours: '8:00 AM - 3:00 PM', phone: '+678 29012', tags: ['trekking', 'waterfall', 'nature'], featured: false },
  { id: 'b9', name: 'Ekasup Cultural Village', category: 'tours', description: 'Experience authentic Ni-Vanuatu culture.', descriptionFr: 'Vivez la culture authentique Ni-Vanuatu.', descriptionBi: 'Eksperiens tru Ni-Vanuatu kalsa.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856976443_5ee434da.png', rating: 4.9, reviewCount: 278, discount: '20% OFF', originalPrice: 6500, dealPrice: 5200, location: 'Ekasup Village', lat: -17.7350, lng: 168.2950, hours: '9:00 AM - 4:00 PM', phone: '+678 30123', tags: ['culture', 'traditional', 'kava'], featured: true },
  { id: 'b10', name: 'Port Vila Heritage Walk', category: 'tours', description: 'Discover the colonial history and vibrant markets.', descriptionFr: 'Découvrez l\'histoire coloniale et les marchés vibrants.', descriptionBi: 'Faenem kolonial histri mo nambawan maket.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856985705_805475fe.png', rating: 4.5, reviewCount: 134, discount: '10% OFF', originalPrice: 4500, dealPrice: 4050, location: 'Port Vila Town', lat: -17.7380, lng: 168.3140, hours: '8:00 AM - 12:00 PM', phone: '+678 31234', tags: ['history', 'walking tour', 'markets'], featured: false },
  { id: 'b11', name: 'Tanna Volcano Day Trip', category: 'tours', description: 'Fly to Tanna and witness Mount Yasur active volcano.', descriptionFr: 'Envolez-vous vers Tanna et admirez le volcan actif.', descriptionBi: 'Flae go long Tanna mo lukim Mount Yasur volkeno.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856973624_1b887f4a.jpg', rating: 4.9, reviewCount: 356, discount: '15% OFF', originalPrice: 45000, dealPrice: 38250, location: 'Tanna Island', lat: -19.5300, lng: 169.4400, hours: 'Departs 7:00 AM', phone: '+678 32345', tags: ['volcano', 'adventure', 'day trip'], featured: true },
  { id: 'b12', name: 'Chief Roi Mata Tour', category: 'tours', description: 'Visit the UNESCO World Heritage site.', descriptionFr: 'Visitez le site du patrimoine mondial de l\'UNESCO.', descriptionBi: 'Visitim UNESCO World Heritage saet.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856981439_d4c47fd2.png', rating: 4.7, reviewCount: 198, discount: '20% OFF', originalPrice: 9500, dealPrice: 7600, location: 'North Efate', lat: -17.6500, lng: 168.3800, hours: '9:00 AM - 3:00 PM', phone: '+678 33456', tags: ['UNESCO', 'heritage', 'history'], featured: false },
  { id: 'b13', name: 'Erakor Island Spa', category: 'spa', description: 'Luxury spa treatments using local volcanic mud and coconut oil.', descriptionFr: 'Soins spa de luxe utilisant de la boue volcanique locale.', descriptionBi: 'Lakseri spa tritmen wetem lokal volkenik mad.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770857000182_f55ad882.jpg', rating: 4.8, reviewCount: 167, discount: '30% OFF', originalPrice: 12000, dealPrice: 8400, location: 'Erakor Island', lat: -17.7550, lng: 168.3250, hours: '9:00 AM - 7:00 PM', phone: '+678 34567', tags: ['spa', 'massage', 'relaxation'], featured: true },
  { id: 'b14', name: 'Paradise Cove Resort', category: 'accommodation', description: 'Beachfront bungalows with private beach access.', descriptionFr: 'Bungalows en bord de mer avec accès privé.', descriptionBi: 'Bichfron bangalo wetem praevet bich akses.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856999889_357acdad.jpg', rating: 4.7, reviewCount: 223, discount: '25% OFF', originalPrice: 23000, dealPrice: 17250, location: 'North Shore, Efate', lat: -17.6700, lng: 168.3600, hours: 'Check-in: 2:00 PM', phone: '+678 35678', tags: ['resort', 'beachfront', 'luxury'], featured: true },
  { id: 'b15', name: 'Vanuatu Handicraft Market', category: 'shopping', description: 'Authentic handmade crafts, wood carvings, and traditional textiles.', descriptionFr: 'Artisanat authentique fait main.', descriptionBi: 'Tru handmade kraft, wud kavin.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770857002898_1909faf0.jpg', rating: 4.4, reviewCount: 98, discount: '15% OFF', originalPrice: 3000, dealPrice: 2550, location: 'Central Market, Port Vila', lat: -17.7400, lng: 168.3160, hours: '7:00 AM - 5:00 PM', phone: '+678 36789', tags: ['crafts', 'souvenirs', 'local art'], featured: false },
  { id: 'b16', name: 'Coconut Palms Wellness', category: 'spa', description: 'Traditional Melanesian healing combined with modern wellness.', descriptionFr: 'Guérison mélanésienne traditionnelle combinée au bien-être moderne.', descriptionBi: 'Tradisonal Melanesian hilin kombaenem wetem modern welnes.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770857004548_0b22487d.jpg', rating: 4.6, reviewCount: 112, discount: '20% OFF', originalPrice: 7500, dealPrice: 6000, location: 'Vila Bay', lat: -17.7480, lng: 168.3080, hours: '6:00 AM - 8:00 PM', phone: '+678 37890', tags: ['yoga', 'wellness', 'meditation'], featured: false },
];


export const sampleReviews: Review[] = [
  { id: 'r1', businessId: 'b1', userName: 'Sarah M.', rating: 5, comment: 'Absolutely incredible seafood! The coconut crab was the best I\'ve ever had.', date: '2026-02-01', avatar: 'SM' },
  { id: 'r2', businessId: 'b1', userName: 'Jean-Pierre L.', rating: 5, comment: 'Magnifique! Le poisson était parfaitement préparé.', date: '2026-01-28', avatar: 'JL' },
  { id: 'r3', businessId: 'b5', userName: 'Mike T.', rating: 5, comment: 'Best snorkeling experience of my life!', date: '2026-02-05', avatar: 'MT' },
  { id: 'r4', businessId: 'b9', userName: 'Emma W.', rating: 5, comment: 'Such an authentic cultural experience.', date: '2026-01-30', avatar: 'EW' },
  { id: 'r5', businessId: 'b11', userName: 'David K.', rating: 5, comment: 'Mount Yasur is absolutely breathtaking.', date: '2026-02-08', avatar: 'DK' },
  { id: 'r6', businessId: 'b13', userName: 'Lisa R.', rating: 4, comment: 'The volcanic mud treatment was amazing.', date: '2026-02-03', avatar: 'LR' },
  { id: 'r7', businessId: 'b3', userName: 'Tom H.', rating: 5, comment: 'Fine dining at its best.', date: '2026-01-25', avatar: 'TH' },
  { id: 'r8', businessId: 'b7', userName: 'Anna S.', rating: 5, comment: 'The underwater post office is so unique!', date: '2026-02-10', avatar: 'AS' },
];
