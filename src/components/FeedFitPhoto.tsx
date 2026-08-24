import React from 'react';

type FeedFitPhotoProps = {
  src: string;
  className?: string;
  imgClassName?: string;
  /** Eager-load for the visible swipe card (LCP). */
  priority?: boolean;
};

/**
 * Every photo fills the phone card (object-cover), whatever its shape.
 * Landscape and portrait both cover the frame — no letterbox strip, no forced crop dialog.
 */
export function FeedFitPhoto({
  src,
  className = '',
  imgClassName = '',
  priority = false,
}: FeedFitPhotoProps) {
  if (!src) return <div className={`bg-neutral-900 ${className}`} />;

  return (
    <div className={`relative overflow-hidden bg-neutral-950 ${className}`}>
      <img
        src={src}
        alt=""
        draggable={false}
        decoding={priority ? 'sync' : 'async'}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        className={`feed-photo-img ${imgClassName}`}
      />
    </div>
  );
}
