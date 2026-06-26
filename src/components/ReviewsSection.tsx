import React, { useState, useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { toast } from 'sonner';
import { t } from '@/data/translations';
import { businesses as fallbackBusinesses } from '@/data/businesses';
import { profileBusinessIdFor } from '@/lib/businessOfferingMap';
import { Star, Quote, MessageSquarePlus, X, ChevronDown, Sparkles } from 'lucide-react';
import ReviewForm from '@/components/ReviewForm';


const ReviewsSection: React.FC = () => {
  const { language, dbReviews, dbBusinesses, user, setShowAuth, setAuthMode, checkReviewSubmissionAllowed } =
    useAppContext();
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const allBusinesses = dbBusinesses.length > 0 ? dbBusinesses : fallbackBusinesses;

  const reviewableBusinesses = useMemo(() => {
    if (!user?.id) return allBusinesses;
    return allBusinesses.filter((b) => !b.ownerId || b.ownerId !== user.id);
  }, [allBusinesses, user?.id]);

  // Use DB reviews if available, otherwise show placeholder
  const featured = dbReviews.length > 0
    ? dbReviews.slice(0, 4)
    : [
        { id: 'r1', business_id: 'b1', user_name: 'Sarah M.', rating: 5, comment: 'Absolutely incredible seafood! The coconut crab was the best I\'ve ever had.', created_at: '2026-02-01' },
        { id: 'r2', business_id: 'b5', user_name: 'Mike T.', rating: 5, comment: 'Best snorkeling experience of my life! The coral is so vibrant.', created_at: '2026-02-05' },
        { id: 'r3', business_id: 'b9', user_name: 'Emma W.', rating: 5, comment: 'Such an authentic cultural experience. The kava ceremony was unforgettable!', created_at: '2026-01-30' },
        { id: 'r4', business_id: 'b11', user_name: 'David K.', rating: 5, comment: 'Mount Yasur is absolutely breathtaking. Worth every penny.', created_at: '2026-02-08' },
      ];

  // Map business_id to business name for display
  const businessNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    allBusinesses.forEach((b) => {
      map[profileBusinessIdFor(b)] = b.name;
    });
    return map;
  }, [allBusinesses]);

  const selectedBusinessName = selectedBusinessId ? businessNameMap[selectedBusinessId] || '' : '';

  const handleWriteReview = () => {
    if (!user) {
      setShowAuth(true);
      setAuthMode('signin');
      return;
    }
    setShowReviewModal(true);
  };

  const handleReviewSuccess = () => {
    setTimeout(() => {
      setShowReviewModal(false);
      setSelectedBusinessId('');
    }, 2000);
  };

  return (
    <section className="py-20 bg-gradient-to-b from-teal-50/50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">{t('review.title', language)}</h2>
          <p className="text-gray-500 max-w-lg mx-auto mb-6">
            {language === 'en' ? 'Real experiences from tourists who saved with StikmNek' :
             language === 'fr' ? 'Expériences réelles de touristes qui ont économisé avec StikmNek' :
             'Jusum wan bisnis blong riviu'}
          </p>
          <button
            onClick={handleWriteReview}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold text-sm hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200/50"
          >
            <MessageSquarePlus className="w-4 h-4" />
            {t('review.write', language)}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featured.map((review) => (
            <div key={review.id} className={`bg-white rounded-2xl p-6 shadow-sm border hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ${
              (review as any).has_super_star ? 'border-purple-200 ring-1 ring-purple-100' : 'border-gray-100'
            }`}>
              <div className="flex items-center gap-0.5 mb-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`w-4 h-4 ${i < review.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`} />
                ))}
                {(review as any).has_super_star && (
                  <div className="relative ml-1">
                    <Star className="w-5 h-5 text-purple-500 fill-purple-500" />
                    <Sparkles className="absolute -top-0.5 -right-0.5 w-3 h-3 text-yellow-400" />
                  </div>
                )}
              </div>
              {(review as any).has_super_star && (
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-[10px] font-bold text-purple-700 mb-2">
                  <Sparkles className="w-3 h-3" />
                  Super Star Review
                </div>
              )}
              <Quote className="w-8 h-8 text-teal-200 mb-2" />
              <p className="text-sm text-gray-600 leading-relaxed mb-4">"{review.comment}"</p>
              {businessNameMap[review.business_id] && (
                <p className="text-xs text-teal-600 font-medium mb-3">
                  {businessNameMap[review.business_id]}
                </p>
              )}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white text-sm font-bold">
                  {review.user_name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{review.user_name}</p>
                  <p className="text-xs text-gray-400">{new Date(review.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          ))}

        </div>
      </div>

      {/* Write Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setShowReviewModal(false); setSelectedBusinessId(''); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {t('review.write', language)}
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {language === 'en' ? 'Share your experience with other tourists' :
                   language === 'fr' ? 'Partagez votre expérience avec d\'autres touristes' :
                   'Jusum wan bisnis...'}
                </p>
              </div>
              <button
                onClick={() => { setShowReviewModal(false); setSelectedBusinessId(''); }}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {/* Business Selector */}
              {!selectedBusinessId ? (
                <div className="mb-0">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {language === 'en' ? 'Select a business to review' :
                     language === 'fr' ? 'Sélectionnez une entreprise à évaluer' :
                     'No gat list blong riviu. Inklutum blong yu naoia'}
                    <span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowDropdown(!showDropdown)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm text-left hover:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
                    >
                      <span className="text-gray-400">
                        {language === 'en' ? 'Choose a business...' :
                         language === 'fr' ? 'Choisir une entreprise...' :
                         'Jensem'}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {showDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl max-h-60 overflow-y-auto z-20">
                        {reviewableBusinesses.length === 0 && (
                          <p className="px-4 py-3 text-sm text-gray-500">
                            {language === 'en'
                              ? 'No listings available to review (including your own).'
                              : language === 'fr'
                                ? 'Aucune annonce à évaluer (y compris la vôtre).'
                                : 'Komplitim profael blong yu'}
                          </p>
                        )}
                        {reviewableBusinesses.map((biz) => {
                          const pid = profileBusinessIdFor(biz);
                          return (
                          <button
                            key={biz.id}
                            type="button"
                            onClick={() => {
                              void (async () => {
                                const gate = await checkReviewSubmissionAllowed(pid, 'leave_review');
                                if (!gate.allowed) {
                                  toast.error(gate.message || '');
                                  return;
                                }
                                setSelectedBusinessId(pid);
                                setShowDropdown(false);
                              })();
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-teal-50 transition-colors border-b border-gray-50 last:border-0"
                          >
                            <img
                              src={biz.image}
                              alt={biz.name}
                              className="w-10 h-10 rounded-lg object-cover shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{biz.name}</p>
                              <p className="text-xs text-gray-500 capitalize">{biz.category} &middot; {biz.location}</p>
                            </div>
                          </button>
                        );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Selected Business Display */}
                  <div className="flex items-center gap-3 p-3 bg-teal-50 rounded-xl border border-teal-100">
                    {(() => {
                      const biz = allBusinesses.find((b) => profileBusinessIdFor(b) === selectedBusinessId);
                      return biz ? (
                        <>
                          <img src={biz.image} alt={biz.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{biz.name}</p>
                            <p className="text-xs text-gray-500 capitalize">{biz.category} &middot; {biz.location}</p>
                          </div>
                        </>
                      ) : null;
                    })()}
                    <button
                      type="button"
                      onClick={() => setSelectedBusinessId('')}
                      className="text-xs text-teal-600 font-semibold hover:underline shrink-0"
                    >
                      {language === 'en' ? 'Change' : language === 'fr' ? 'Changer' : 'Helpem mifala blong givim dils mo kontakt yu long we yu preferem'}
                    </button>
                  </div>

                  {/* Review Form */}
                  <ReviewForm
                    businessId={selectedBusinessId}
                    businessName={selectedBusinessName}
                    offeringId={null}
                    onSuccess={handleReviewSuccess}
                    onCancel={() => { setShowReviewModal(false); setSelectedBusinessId(''); }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default ReviewsSection;
