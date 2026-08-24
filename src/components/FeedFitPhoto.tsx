import React from 'react';

type FeedFitPhotoProps = {
  src: string;
  className?: string;
  imgClassName?: string;
  /** Eager-load for the visible swipe card (LCP). */
  priority?: boolean;
};

/**
 * Show the uploaded photo as-is inside a 9:16 (or any) frame.
 * No crop, no zoom-to-fill. If the photo is not 9:16, empty space is a
 * blurred + dark surround so the whole image stays visible.
 */
export function FeedFitPhoto({
  src,
  className = '',
  imgClassName = '',
  priority = false,
}: FeedFitPhotoProps) {
  if (!src) return <div className={`bg-neutral-950 ${className}`} />;

  const safeUrl = src.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  return (
    <div className={`relative overflow-hidden bg-neutral-950 ${className}`}>
      <div
        aria-hidden
        className="absolute inset-0 scale-125 bg-cover bg-center blur-2xl"
        style={{ backgroundImage: `url("${safeUrl}")` }}
      />
      <div aria-hidden className="absolute inset-0 bg-black/55" />
      <img
        src={src}
        alt=""
        draggable={false}
        decoding={priority ? 'sync' : 'async'}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        className={`feed-photo-as-is ${imgClassName}`}
      />
    </div>
  );
}
