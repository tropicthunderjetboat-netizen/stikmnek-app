import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';

/**
 * Shown when listings failed to load or the database returned zero active offers.
 * Helps tourists on www.stikmnek.com know to retry instead of seeing a blank site.
 */
const ListingsLoadBanner: React.FC = () => {
  const { dataLoaded, dbBusinesses, listingsLoadError, refreshBusinesses } = useAppContext();

  if (!dataLoaded || dbBusinesses.length > 0) return null;

  const message =
    listingsLoadError ||
    'No business listings are available right now. Please try again in a moment.';

  return (
    <div
      role="alert"
      className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-amber-950"
    >
      <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-start gap-2 min-w-0">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" aria-hidden />
          <p className="text-sm leading-snug">{message}</p>
        </div>
        <button
          type="button"
          onClick={() => void refreshBusinesses()}
          className="inline-flex items-center gap-1.5 shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" aria-hidden />
          Retry
        </button>
      </div>
    </div>
  );
};

export default ListingsLoadBanner;
