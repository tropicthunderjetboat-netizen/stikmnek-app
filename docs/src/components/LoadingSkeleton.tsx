import React from 'react';

/**
 * Lightweight shimmer skeleton displayed while lazy-loaded route components
 * are being fetched. Uses a pure-CSS animation so there are zero JS
 * dependencies beyond React itself.
 */

const shimmerClass =
  'relative overflow-hidden bg-gray-200 rounded-lg before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent';

const LoadingSkeleton: React.FC = () => (
  <div className="pt-20 pb-16 min-h-screen bg-gray-50/60">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* ── Page header skeleton ── */}
      <div className="mb-8 space-y-3">
        <div className={`${shimmerClass} h-8 w-64 max-w-full`} />
        <div className={`${shimmerClass} h-4 w-96 max-w-full`} />
      </div>

      {/* ── Stat cards row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl p-5 shadow-sm border border-gray-100"
          >
            <div className={`${shimmerClass} h-4 w-24 mb-3`} />
            <div className={`${shimmerClass} h-7 w-16 mb-2`} />
            <div className={`${shimmerClass} h-3 w-32`} />
          </div>
        ))}
      </div>

      {/* ── Toolbar / filter bar skeleton ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className={`${shimmerClass} h-10 w-48`} />
        <div className={`${shimmerClass} h-10 w-32`} />
        <div className={`${shimmerClass} h-10 w-28`} />
        <div className="flex-1" />
        <div className={`${shimmerClass} h-10 w-10 rounded-lg`} />
      </div>

      {/* ── Content cards grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100"
          >
            {/* Image placeholder */}
            <div className={`${shimmerClass} h-44 w-full rounded-none`} />
            {/* Card body */}
            <div className="p-5 space-y-3">
              <div className={`${shimmerClass} h-5 w-3/4`} />
              <div className={`${shimmerClass} h-4 w-full`} />
              <div className={`${shimmerClass} h-4 w-5/6`} />
              <div className="flex items-center gap-2 pt-2">
                <div className={`${shimmerClass} h-8 w-8 rounded-full`} />
                <div className={`${shimmerClass} h-4 w-24`} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default LoadingSkeleton;
