import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, ChevronRight, X, Expand, Image as ImageIcon, Loader2 } from 'lucide-react';
import { getPhotoDisplayUrl } from '@/lib/utils';
import { SUPABASE_URL } from '@/lib/supabase';

interface BusinessPhoto {
  id: string;
  business_id: string;
  offering_id?: string | null;
  url: string;
  file_path: string;
  is_main: boolean;
  created_at: string;
  status: string;
}

interface PhotoGalleryProps {
  businessId: string;
  coverImage: string;
  businessName: string;
  /** When set, only photos tagged for this listing (`business_offerings.id`) are shown. */
  offeringId?: string | null;
}

const PhotoGallery: React.FC<PhotoGalleryProps> = ({
  businessId,
  coverImage,
  businessName,
  offeringId = null,
}) => {
  const [photos, setPhotos] = useState<BusinessPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Build the public gallery from approved DB photos.
  // If approved photos exist, use their main/first photo as the primary cover to avoid
  // showing a stale/rejected businesses.image value.
  const allPhotos = React.useMemo(() => {
    const gallery: { id: string; url: string; isMain: boolean }[] = [];
    const resolvedApproved = photos
      .map((p) => ({
        id: p.id,
        url: getPhotoDisplayUrl(p, SUPABASE_URL) || p.url,
        isMain: p.is_main,
      }))
      .filter((p) => !!p.url);

    if (resolvedApproved.length > 0) {
      // Approved main photo first (query is ordered by is_main DESC, created_at ASC).
      resolvedApproved.forEach((p) => gallery.push(p));
      return gallery;
    }

    // Fallback only when there are no approved gallery photos.
    if (coverImage) {
      gallery.push({ id: 'cover', url: coverImage, isMain: true });
    }

    return gallery;
  }, [photos, coverImage]);

  // Fetch photos from business_photos table
  useEffect(() => {
    const fetchPhotos = async () => {
      setLoading(true);
      try {
        let q = supabase
          .from('business_photos')
          .select('*')
          .eq('business_id', businessId)
          .eq('status', 'approved');
        const oid = offeringId && String(offeringId).trim() ? String(offeringId).trim() : '';
        if (oid) {
          q = q.eq('offering_id', oid);
        }
        const { data, error } = await q
          .order('is_main', { ascending: false })
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Failed to load business photos:', error);
        } else if (data) {
          const approvedOnly = (data as BusinessPhoto[]).filter(
            (p) => String(p.status || '').toLowerCase() === 'approved',
          );
          setPhotos(approvedOnly);
        }
      } catch (err) {
        console.error('Error fetching business photos:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPhotos();
  }, [businessId, offeringId]);

  const goToSlide = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  const goNext = useCallback(() => {
    setActiveIndex(prev => (prev + 1) % allPhotos.length);
  }, [allPhotos.length]);

  const goPrev = useCallback(() => {
    setActiveIndex(prev => (prev - 1 + allPhotos.length) % allPhotos.length);
  }, [allPhotos.length]);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  const lightboxNext = useCallback(() => {
    setLightboxIndex(prev => (prev + 1) % allPhotos.length);
  }, [allPhotos.length]);

  const lightboxPrev = useCallback(() => {
    setLightboxIndex(prev => (prev - 1 + allPhotos.length) % allPhotos.length);
  }, [allPhotos.length]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') lightboxNext();
      if (e.key === 'ArrowLeft') lightboxPrev();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxOpen, closeLightbox, lightboxNext, lightboxPrev]);

  // Don't render if only the cover image (no additional photos)
  if (!loading && allPhotos.length <= 1) {
    return null;
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 text-teal-500 animate-spin mr-2" />
        <span className="text-sm text-gray-400">Loading photos...</span>
      </div>
    );
  }

  return (
    <>
      {/* Gallery Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Section Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4.5 h-4.5 text-teal-600" />
            <h3 className="text-base font-bold text-gray-900">Photos</h3>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {allPhotos.length}
            </span>
          </div>
          {allPhotos.length > 1 && (
            <span className="text-xs text-gray-400">
              {activeIndex + 1} / {allPhotos.length}
            </span>
          )}
        </div>

        {/* Main Carousel */}
        <div className="relative group">
          <div
            className="relative w-full overflow-hidden cursor-pointer"
            style={{ aspectRatio: '16/9' }}
            onClick={() => openLightbox(activeIndex)}
          >
            {allPhotos.map((photo, idx) => (
              <div
                key={photo.id}
                className={`absolute inset-0 transition-opacity duration-500 ease-in-out ${
                  idx === activeIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
                }`}
              >
                <img
                  src={photo.url}
                  alt={`${businessName} photo ${idx + 1}`}
                  className="w-full h-full object-cover"
                  loading={idx === 0 ? 'eager' : 'lazy'}
                  onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                />
              </div>
            ))}

            {/* Expand icon overlay */}
            <div className="absolute top-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-9 h-9 rounded-lg bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors">
                <Expand className="w-4 h-4" />
              </div>
            </div>

            {/* Gradient overlay at bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/20 to-transparent z-10 pointer-events-none" />
          </div>

          {/* Navigation Arrows */}
          {allPhotos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
                className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center text-gray-700 hover:bg-white hover:scale-105 transition-all opacity-0 group-hover:opacity-100"
                aria-label="Previous photo"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); goNext(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center text-gray-700 hover:bg-white hover:scale-105 transition-all opacity-0 group-hover:opacity-100"
                aria-label="Next photo"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Dot Indicators */}
          {allPhotos.length > 1 && allPhotos.length <= 8 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5">
              {allPhotos.map((_, idx) => (
                <button
                  key={idx}
                  onClick={(e) => { e.stopPropagation(); goToSlide(idx); }}
                  className={`rounded-full transition-all ${
                    idx === activeIndex
                      ? 'w-6 h-2 bg-white shadow-md'
                      : 'w-2 h-2 bg-white/60 hover:bg-white/80'
                  }`}
                  aria-label={`Go to photo ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Thumbnail Strip */}
        {allPhotos.length > 1 && (
          <div className="px-4 py-3">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {allPhotos.map((photo, idx) => (
                <button
                  key={photo.id}
                  onClick={() => goToSlide(idx)}
                  className={`relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden transition-all ${
                    idx === activeIndex
                      ? 'ring-2 ring-teal-500 ring-offset-1 scale-105'
                      : 'opacity-60 hover:opacity-90 hover:scale-102'
                  }`}
                >
                  <img
                    src={photo.url}
                    alt={`Thumbnail ${idx + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                  />
                  {idx === activeIndex && (
                    <div className="absolute inset-0 border-2 border-teal-500 rounded-lg" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox / Fullscreen Modal */}
      {lightboxOpen && (
        <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center">
          {/* Close button */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            aria-label="Close lightbox"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Counter */}
          <div className="absolute top-5 left-1/2 -translate-x-1/2 z-50 text-white/70 text-sm font-medium">
            {lightboxIndex + 1} / {allPhotos.length}
          </div>

          {/* Main Image */}
          <div className="relative w-full h-full flex items-center justify-center p-4 sm:p-12">
            <img
              src={allPhotos[lightboxIndex]?.url || '/placeholder.svg'}
              alt={`${businessName} photo ${lightboxIndex + 1}`}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
            />
          </div>

          {/* Navigation Arrows */}
          {allPhotos.length > 1 && (
            <>
              <button
                onClick={lightboxPrev}
                className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-50 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                aria-label="Previous photo"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={lightboxNext}
                className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-50 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                aria-label="Next photo"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Bottom Thumbnail Strip */}
          {allPhotos.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex gap-2 max-w-[90vw] overflow-x-auto px-4 py-2">
              {allPhotos.map((photo, idx) => (
                <button
                  key={photo.id}
                  onClick={() => setLightboxIndex(idx)}
                  className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden transition-all ${
                    idx === lightboxIndex
                      ? 'ring-2 ring-white scale-110'
                      : 'opacity-40 hover:opacity-70'
                  }`}
                >
                  <img
                    src={photo.url}
                    alt={`Thumbnail ${idx + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default PhotoGallery;
