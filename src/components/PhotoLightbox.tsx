import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

type PhotoLightboxProps = {
  open: boolean;
  photos: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  altPrefix?: string;
};

/**
 * Full-screen photo viewer — swipe / arrows / keyboard.
 * Portaled to document.body so it sits above sheet chrome.
 */
const PhotoLightbox: React.FC<PhotoLightboxProps> = ({
  open,
  photos,
  index,
  onIndexChange,
  onClose,
  altPrefix = 'Photo',
}) => {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const count = photos.length;
  const safeIndex = count > 0 ? ((index % count) + count) % count : 0;
  const src = photos[safeIndex];

  const goNext = useCallback(() => {
    if (count < 2) return;
    onIndexChange((safeIndex + 1) % count);
  }, [count, onIndexChange, safeIndex]);

  const goPrev = useCallback(() => {
    if (count < 2) return;
    onIndexChange((safeIndex - 1 + count) % count);
  }, [count, onIndexChange, safeIndex]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, goNext, goPrev]);

  if (!open || count === 0 || !src) return null;

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const startX = touchStartX.current;
    const startY = touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (startX == null || startY == null) return;
    const endX = e.changedTouches[0]?.clientX ?? startX;
    const endY = e.changedTouches[0]?.clientY ?? startY;
    const dx = endX - startX;
    const dy = endY - startY;
    // Prefer horizontal swipe; ignore mostly-vertical scrolls
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) goNext();
    else goPrev();
  };

  const panel = (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Photo gallery"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="relative z-10 flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <p className="min-w-[4.5rem] text-sm font-semibold text-white/80 tabular-nums">
          {safeIndex + 1} / {count}
        </p>
        <p className="text-xs text-white/50 hidden sm:block">Swipe for more</p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/20 backdrop-blur-sm active:scale-[0.98]"
          aria-label="Close full screen photos"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        <img
          src={src}
          alt={`${altPrefix} ${safeIndex + 1}`}
          draggable={false}
          className="max-h-full max-w-full object-contain select-none"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/placeholder.svg';
          }}
        />

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-2 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/20 backdrop-blur-sm hover:bg-white/25 sm:inline-flex"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-2 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/20 backdrop-blur-sm hover:bg-white/25 sm:inline-flex"
              aria-label="Next photo"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="relative z-10 flex justify-center gap-1.5 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {photos.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to photo ${i + 1}`}
              onClick={() => onIndexChange(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === safeIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/35'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );

  return createPortal(panel, document.body);
};

export default PhotoLightbox;
