import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, ChevronRight, Expand, Image as ImageIcon, Loader2 } from 'lucide-react';
import { getPhotoDisplayUrl } from '@/lib/utils';
import { SUPABASE_URL } from '@/lib/supabase';
import {
  legacyUntaggedPhotoBelongsToOffering,
  supplementUntaggedPhotosForRecentNewestOffering,
} from '@/lib/offeringPhotoPartition';
import type { OfferingCreatedRow } from '@/lib/offeringPhotoPartition';
import PhotoLightbox from '@/components/PhotoLightbox';

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
        let { data, error } = await q
          .order('is_main', { ascending: false })
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Failed to load business photos:', error);
        } else if (data) {
          let approvedOnly = (data as BusinessPhoto[]).filter(
            (p) => String(p.status || '').toLowerCase() === 'approved',
          );
          // Legacy untagged rows (`offering_id` null) used to be shown for every listing — wrong when
          // one profile has multiple offerings (all photos pooled on each deal). Only merge that pool
          // when this business profile has a single offering (old one-deal setups).
          if (oid && approvedOnly.length === 0) {
            const { count, error: cntErr } = await supabase
              .from('business_offerings')
              .select('id', { count: 'exact', head: true })
              .eq('business_id', businessId)
              .eq('active', true);
            const offerCount = !cntErr && typeof count === 'number' ? count : 99;

            const legacy = await supabase
              .from('business_photos')
              .select('*')
              .eq('business_id', businessId)
              .eq('status', 'approved')
              .is('offering_id', null)
              .order('is_main', { ascending: false })
              .order('created_at', { ascending: true });

            if (!legacy.error && legacy.data?.length) {
              const list = (legacy.data as BusinessPhoto[]).filter(
                (p) => String(p.status || '').toLowerCase() === 'approved',
              );
              if (offerCount === 1) {
                approvedOnly = list;
              } else if (offerCount > 1) {
                const { data: rows, error: oErr } = await supabase
                  .from('business_offerings')
                  .select('id, created_at')
                  .eq('business_id', businessId)
                  .eq('active', true)
                  .order('created_at', { ascending: true });
                if (!oErr && rows?.length) {
                  const ordered = rows as OfferingCreatedRow[];
                  approvedOnly = list.filter((p) =>
                    legacyUntaggedPhotoBelongsToOffering(p.created_at, oid, ordered),
                  );
                  if (approvedOnly.length === 0) {
                    const extra = supplementUntaggedPhotosForRecentNewestOffering(
                      list,
                      oid,
                      ordered,
                    );
                    if (extra.length > 0) approvedOnly = extra;
                  }
                }
              } else {
                approvedOnly = [];
              }
            }
          }
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

            {/* Expand affordance — always visible on touch devices */}
            <div className="absolute top-3 right-3 z-20">
              <div className="w-9 h-9 rounded-lg bg-black/50 backdrop-blur-sm flex items-center justify-center text-white">
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

        {/* Thumbnail Strip — tap opens full screen */}
        {allPhotos.length > 1 && (
          <div className="px-4 py-3">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {allPhotos.map((photo, idx) => (
                <button
                  key={photo.id}
                  onClick={() => openLightbox(idx)}
                  className={`relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden transition-all ${
                    idx === activeIndex
                      ? 'ring-2 ring-teal-500 ring-offset-1 scale-105'
                      : 'opacity-60 hover:opacity-90 hover:scale-102'
                  }`}
                  aria-label={`Open photo ${idx + 1} full screen`}
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

      <PhotoLightbox
        open={lightboxOpen}
        photos={allPhotos.map((p) => p.url)}
        index={lightboxIndex}
        onIndexChange={(i) => {
          setLightboxIndex(i);
          setActiveIndex(i);
        }}
        onClose={closeLightbox}
        altPrefix={businessName}
      />
    </>
  );
};

export default PhotoGallery;
