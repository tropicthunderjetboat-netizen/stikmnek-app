export type Category = 'dining' | 'activities' | 'tours' | 'shopping' | 'spa' | 'accommodation';

export interface Business {
  id: string;
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
  hours: string;
  phone: string;
  whatsappNumber?: string | null;
  tags: string[];
  featured: boolean;
  ownerId?: string | null;
  superStarCount?: number;
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
  { key: 'spa', label: 'Spa & Wellness', labelFr: 'Bien-être', labelBi: 'Spaa', icon: 'sparkles' },
  { key: 'accommodation', label: 'Stay', labelFr: 'Hébergement', labelBi: 'Stae', icon: 'bed' }
];

// Ensure this array is exported cleanly with no external logic dependencies
export const businesses: Business[] = [
  // ... (Keep your existing business data here exactly as it was)
];

export const sampleReviews: Review[] = [
  // ... (Keep your existing review data here)
];
