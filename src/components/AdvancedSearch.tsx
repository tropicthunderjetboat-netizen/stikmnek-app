import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { businesses as localBusinesses } from '@/data/businesses';
import { supabase } from '@/lib/supabase';
import { Search, SlidersHorizontal, X, Clock, TrendingUp, ArrowUpDown, Star, ChevronDown, ChevronUp, DollarSign, Navigation, Loader2, Award, Tag, Sparkles, MessageCircle } from 'lucide-react';

export type SortOption = 'featured' | 'leaderboard' | 'price-low' | 'price-high' | 'rating' | 'savings' | 'reviews' | 'near-me';


interface AdvancedSearchProps {
  sortBy: SortOption;
  setSortBy: (s: SortOption) => void;
  priceRange: [number, number];
  setPriceRange: (r: [number, number]) => void;
  minRating: number;
  setMinRating: (r: number) => void;
  maxPrice: number;
  whatsappFilter: boolean;
  setWhatsappFilter: (v: boolean) => void;
}

// WhatsApp SVG icon component
const WhatsAppIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const AdvancedSearch: React.FC<AdvancedSearchProps> = ({
  sortBy, setSortBy, priceRange, setPriceRange, minRating, setMinRating, maxPrice, whatsappFilter, setWhatsappFilter
}) => {
  const { searchQuery, setSearchQuery, user, language, userLocation, locationLoading, requestUserLocation, dbBusinesses } = useAppContext();

  const [showFilters, setShowFilters] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const allBusinesses = dbBusinesses.length > 0 ? dbBusinesses : localBusinesses;

  // Count businesses with WhatsApp
  const whatsappCount = useMemo(() => {
    return allBusinesses.filter(b => !!b.whatsappNumber).length;
  }, [allBusinesses]);

  // Extract all unique tags from businesses for auto-suggest
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const biz of allBusinesses) {
      if (biz.tags) {
        for (const tag of biz.tags) {
          tagSet.add((tag ?? '').toLowerCase());
        }
      }
      // Also add category as a tag
      tagSet.add((biz.category ?? '').toLowerCase());
    }
    return Array.from(tagSet).sort();
  }, [allBusinesses]);

  // Extract all unique business names for auto-suggest
  const allNames = useMemo(() => {
    return allBusinesses.map(b => b.name);
  }, [allBusinesses]);

  // Generate auto-suggest results based on current query
  const autoSuggestions = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();

    const results: { type: 'business' | 'tag' | 'category' | 'whatsapp'; text: string; count?: number }[] = [];

    // Special: if query matches 'whatsapp' or 'wa', suggest WhatsApp filter
    if ('whatsapp'.includes(q) || q.includes('whatsapp') || q === 'wa' || 'wa '.startsWith(q)) {
      results.push({
        type: 'whatsapp',
        text: 'WhatsApp businesses',
        count: whatsappCount
      });
    }

    // Match business names (partial + fuzzy)
    for (const biz of allBusinesses) {
      const name = (biz.name ?? '').toLowerCase();
      // Exact substring match
      if (name.includes(q)) {
        results.push({ type: 'business', text: biz.name });
      }
      // Fuzzy: check if query words appear in name
      else {
        const queryWords = q.split(/\s+/);
        const nameWords = name.split(/\s+/);
        const allWordsMatch = queryWords.every(qw =>
          nameWords.some(nw => nw.startsWith(qw) || nw.includes(qw))
        );
        if (allWordsMatch && queryWords.length > 0) {
          results.push({ type: 'business', text: biz.name });
        }
      }
    }

    // Match tags
    for (const tag of allTags) {
      if (tag.includes(q) || q.includes(tag)) {
        const count = allBusinesses.filter(b =>
          b.tags?.some(t => (t ?? '').toLowerCase() === tag) || (b.category ?? '').toLowerCase() === tag
        ).length;
        if (count > 0) {
          results.push({ type: 'tag', text: tag, count });
        }
      }
    }

    // Deduplicate and limit
    const seen = new Set<string>();
    return results.filter(r => {
      const key = `${r.type}:${r.text.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
  }, [searchQuery, allBusinesses, allTags, whatsappCount]);

  const popularSearches = useMemo(() => {
    // Generate popular searches from actual tags
    const tagCounts: Record<string, number> = {};
    for (const biz of allBusinesses) {
      if (biz.tags) {
        for (const tag of biz.tags) {
          tagCounts[tag.toLowerCase()] = (tagCounts[tag.toLowerCase()] || 0) + 1;
        }
      }
    }
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);
  }, [allBusinesses]);

  // Load search history
  useEffect(() => {
    if (!user) return;
    const loadHistory = async () => {
      try {
        const { data } = await supabase
          .from('search_history')
          .select('query')
          .eq('user_id', user.id)
          .order('searched_at', { ascending: false })
          .limit(5);
        if (data) {
          setSearchHistory([...new Set(data.map(d => d.query))]);
        }
      } catch (err) {
        const local = JSON.parse(localStorage.getItem('searchHistory') || '[]');
        setSearchHistory(local.slice(0, 5));
      }
    };
    loadHistory();
  }, [user]);

  // Save search to history
  const saveSearch = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) return;

    const local = JSON.parse(localStorage.getItem('searchHistory') || '[]');
    const updated = [query, ...local.filter((q: string) => q !== query)].slice(0, 10);
    localStorage.setItem('searchHistory', JSON.stringify(updated));
    setSearchHistory(updated.slice(0, 5));

    if (user) {
      try {
        await supabase.from('search_history').insert({ user_id: user.id, query, results_count: 0 });
      } catch (err) {
        // Ignore
      }
    }
  }, [user]);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    setShowSuggestions(false);
    if (q.trim()) saveSearch(q.trim());
  };

  const handleWhatsAppSuggestionClick = () => {
    setWhatsappFilter(true);
    setSearchQuery('');
    setShowSuggestions(false);
  };

  const clearSearch = () => {
    setSearchQuery('');
    inputRef.current?.focus();
  };

  const clearHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem('searchHistory');
    if (user) {
      supabase.from('search_history').delete().eq('user_id', user.id).then(() => {});
    }
  };

  const handleNearMeSort = () => {
    if (!userLocation) {
      requestUserLocation();
    }
    setSortBy('near-me');
  };

  const sortOptions: { key: SortOption; label: string; icon: React.ReactNode }[] = [
    { key: 'featured', label: 'Featured', icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { key: 'leaderboard', label: 'Top Ranked', icon: <Award className="w-3.5 h-3.5" /> },
    { key: 'near-me', label: locationLoading ? 'Finding...' : 'Near Me', icon: locationLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" /> },
    { key: 'price-low', label: 'Price: Low to High', icon: <DollarSign className="w-3.5 h-3.5" /> },
    { key: 'price-high', label: 'Price: High to Low', icon: <DollarSign className="w-3.5 h-3.5" /> },
    { key: 'rating', label: 'Highest Rated', icon: <Star className="w-3.5 h-3.5" /> },
    { key: 'savings', label: 'Biggest Savings', icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { key: 'reviews', label: 'Most Reviews', icon: <Star className="w-3.5 h-3.5" /> },
  ];


  const activeFiltersCount =
    (minRating > 0 ? 1 : 0) +
    (priceRange[0] > 0 || priceRange[1] < maxPrice ? 1 : 0) +
    (sortBy !== 'featured' ? 1 : 0) +
    (whatsappFilter ? 1 : 0);

  return (
    <div className="space-y-3">
      {/* Search Bar with Suggestions */}
      <div className="relative" ref={suggestionsRef}>
        <div className="relative max-w-xl mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value.length >= 2) setShowSuggestions(true);
            }}
            onFocus={() => { setFocused(true); setShowSuggestions(true); }}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch(searchQuery);
              if (e.key === 'Escape') setShowSuggestions(false);
            }}
            placeholder={language === 'en' ? 'Search by name, tag, or category...' : language === 'fr' ? 'Rechercher par nom, tag ou catégorie...' : 'Sejem bae nem, tag, o kategori...'}
            className={`w-full pl-12 pr-20 py-3.5 rounded-xl bg-white border text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent shadow-sm text-sm transition-all ${
              focused ? 'border-teal-300 shadow-md' : 'border-gray-200'
            }`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchQuery && (
              <button onClick={clearSearch} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg transition-colors relative ${
                showFilters || activeFiltersCount > 0
                  ? 'bg-teal-100 text-teal-700'
                  : 'hover:bg-gray-100 text-gray-400'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-teal-600 text-white text-[9px] font-bold flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Auto-Suggest Dropdown (when typing) */}
        {showSuggestions && searchQuery.length >= 2 && autoSuggestions.length > 0 && (
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-full max-w-xl bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-40">
            <div className="p-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 py-1">
                Suggestions
              </p>
              {autoSuggestions.map((suggestion, i) => (
                <button
                  key={i}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (suggestion.type === 'whatsapp') {
                      handleWhatsAppSuggestionClick();
                    } else {
                      handleSearch(suggestion.text);
                    }
                  }}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-teal-50 hover:text-teal-700 transition-colors text-left ${
                    suggestion.type === 'whatsapp' ? 'hover:bg-green-50 hover:text-green-700' : ''
                  }`}
                >
                  {suggestion.type === 'business' ? (
                    <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  ) : suggestion.type === 'whatsapp' ? (
                    <WhatsAppIcon className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  ) : (
                    <Tag className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                  )}
                  <span className="flex-1 truncate">
                    {suggestion.text}
                  </span>
                  {suggestion.type === 'whatsapp' && suggestion.count != null && (
                    <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
                      {suggestion.count} {suggestion.count === 1 ? 'business' : 'businesses'}
                    </span>
                  )}
                  {suggestion.type === 'tag' && suggestion.count != null && (
                    <span className="text-[10px] text-gray-400 font-medium flex-shrink-0">
                      {suggestion.count} {suggestion.count === 1 ? 'deal' : 'deals'}
                    </span>
                  )}
                  {suggestion.type === 'business' && (
                    <span className="text-[10px] text-gray-400 font-medium flex-shrink-0">
                      Business
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search Suggestions Dropdown (when empty) */}
        {showSuggestions && !searchQuery && (
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-full max-w-xl bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-40">
            {/* Recent Searches */}
            {searchHistory.length > 0 && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    Recent Searches
                  </p>
                  <button onClick={clearHistory} className="text-[10px] text-gray-400 hover:text-red-500 font-medium">
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {searchHistory.map((q, i) => (
                    <button
                      key={i}
                      onMouseDown={(e) => { e.preventDefault(); handleSearch(q); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 text-sm text-gray-600 hover:bg-teal-50 hover:text-teal-700 transition-colors"
                    >
                      <Clock className="w-3 h-3 text-gray-400" />
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Popular Tags */}
            <div className={`p-3 ${searchHistory.length > 0 ? 'border-t border-gray-100' : ''}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <TrendingUp className="w-3 h-3" />
                Popular Tags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {popularSearches.map((q, i) => (
                  <button
                    key={i}
                    onMouseDown={(e) => { e.preventDefault(); handleSearch(q); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 text-sm text-teal-700 hover:bg-teal-100 transition-colors"
                  >
                    <Tag className="w-3 h-3 text-teal-400" />
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Filters */}
            <div className="p-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <SlidersHorizontal className="w-3 h-3" />
                Quick Filters
              </p>
              <div className="flex flex-wrap gap-1.5">
                {/* WhatsApp quick filter */}
                {whatsappCount > 0 && (
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setWhatsappFilter(!whatsappFilter);
                      setShowSuggestions(false);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      whatsappFilter
                        ? 'bg-green-600 text-white'
                        : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                    }`}
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5" />
                    Has WhatsApp
                    <span className={`text-[10px] ${whatsappFilter ? 'text-green-200' : 'text-green-500'}`}>({whatsappCount})</span>
                  </button>
                )}
                {/* Browse Categories */}
                {['dining', 'activities', 'tours', 'shopping', 'spa', 'accommodation'].map((cat, i) => (
                  <button
                    key={i}
                    onMouseDown={(e) => { e.preventDefault(); handleSearch(cat); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 text-sm text-gray-600 hover:bg-gray-100 transition-colors capitalize"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Active WhatsApp filter indicator (shown below search bar when active) */}
      {whatsappFilter && (
        <div className="max-w-xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-sm text-green-700 font-medium">
            <WhatsAppIcon className="w-3.5 h-3.5 text-green-600" />
            Showing only WhatsApp businesses
            <button
              onClick={() => setWhatsappFilter(false)}
              className="ml-1 p-0.5 rounded-full hover:bg-green-200 transition-colors"
              aria-label="Remove WhatsApp filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="max-w-3xl mx-auto bg-white rounded-xl border border-gray-200 shadow-lg p-5 space-y-5 animate-in slide-in-from-top-2">
          {/* Sort By */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5" />
              Sort By
            </label>
            <div className="flex flex-wrap gap-2">
              {sortOptions.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => opt.key === 'near-me' ? handleNearMeSort() : setSortBy(opt.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    sortBy === opt.key
                      ? opt.key === 'near-me' ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                        : opt.key === 'leaderboard' ? 'bg-amber-600 text-white shadow-md shadow-amber-200'
                        : 'bg-teal-600 text-white shadow-md shadow-teal-200'
                      : opt.key === 'near-me' ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                        : opt.key === 'leaderboard' ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* WhatsApp Filter Toggle */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <WhatsAppIcon className="w-3.5 h-3.5 text-green-600" />
              WhatsApp Contact
            </label>
            <button
              onClick={() => setWhatsappFilter(!whatsappFilter)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                whatsappFilter
                  ? 'bg-green-600 text-white shadow-md shadow-green-200'
                  : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
              }`}
            >
              <WhatsAppIcon className="w-4 h-4" />
              <span>Has WhatsApp</span>
              <span className={`text-xs ml-1 ${whatsappFilter ? 'text-green-200' : 'text-green-500'}`}>
                ({whatsappCount})
              </span>
              {whatsappFilter && (
                <X className="w-3.5 h-3.5 ml-1" />
              )}
            </button>
            <p className="text-[11px] text-gray-400 mt-1.5 ml-1">
              {language === 'en'
                ? 'Show only businesses you can contact directly via WhatsApp'
                : language === 'fr'
                ? 'Afficher uniquement les entreprises contactables via WhatsApp'
                : 'Soem nomo bisnis we yu save kontaktem long WhatsApp'}
            </p>
          </div>

          {/* Price Range */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              Price Range (VT)
            </label>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <input
                  type="range"
                  min={0}
                  max={maxPrice}
                  step={500}
                  value={priceRange[0]}
                  onChange={(e) => setPriceRange([Number(e.target.value), priceRange[1]])}
                  className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-teal-600"
                />
              </div>
              <span className="text-sm font-semibold text-gray-700 min-w-[60px] text-center">
                {priceRange[0].toLocaleString()}
              </span>
              <span className="text-gray-400">-</span>
              <span className="text-sm font-semibold text-gray-700 min-w-[60px] text-center">
                {priceRange[1].toLocaleString()}
              </span>
              <div className="flex-1">
                <input
                  type="range"
                  min={0}
                  max={maxPrice}
                  step={500}
                  value={priceRange[1]}
                  onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])}
                  className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-teal-600"
                />
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
              <span>0 VT</span>
              <span>{maxPrice.toLocaleString()} VT</span>
            </div>
          </div>

          {/* Rating Filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5" />
              Minimum Rating
            </label>
            <div className="flex items-center gap-2">
              {[0, 3, 3.5, 4, 4.5].map(rating => (
                <button
                  key={rating}
                  onClick={() => setMinRating(rating)}
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    minRating === rating
                      ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {rating === 0 ? 'All' : (
                    <>
                      <Star className={`w-3 h-3 ${minRating === rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'}`} />
                      {rating}+
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Clear Filters */}
          {activeFiltersCount > 0 && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setSortBy('featured');
                  setPriceRange([0, maxPrice]);
                  setMinRating(0);
                  setWhatsappFilter(false);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Clear All Filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdvancedSearch;
