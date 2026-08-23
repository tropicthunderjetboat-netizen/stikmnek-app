import React, { useEffect, useState } from 'react';

type FeedFitPhotoProps = {
  src: string;
  className?: string;
  imgClassName?: string;
  /** Eager-load for the visible swipe card (LCP). */
  priority?: boolean;
};

/**
 * Portrait photos fill the card (cover). Landscape photos stay fully visible
 * (contain) on a blurred fill of the same image — no black bars, no side crop.
 */
export function FeedFitPhoto({
  src,
  className = '',
  imgClassName = '',
  priority = false,
}: FeedFitPhotoProps) {
  const [contain, setContain] = useState(true);

  useEffect(() => {
    setContain(true);
  }, [src]);

  if (!src) return <div className={`bg-neutral-900 ${className}`} />;

  const safeUrl = src.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  return (
    <div className={`relative overflow-hidden bg-neutral-950 ${className}`}>
      <div
        aria-hidden
        className="absolute inset-0 scale-125 bg-cover bg-center blur-2xl brightness-90"
        style={{ backgroundImage: `url("${safeUrl}")` }}
      />
      {contain ? <div aria-hidden className="absolute inset-0 bg-black/25" /> : null}
      <img
        src={src}
        alt=""
        draggable={false}
        decoding={priority ? 'sync' : 'async'}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        onLoad={(e) => {
          const el = e.currentTarget;
          setContain(el.naturalWidth > el.naturalHeight);
        }}
        className={`feed-photo-img ${contain ? 'feed-photo-img--contain' : ''} ${imgClassName}`}
      />
    </div>
  );
}
