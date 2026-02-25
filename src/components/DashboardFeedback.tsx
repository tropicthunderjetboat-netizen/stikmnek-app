import React, { useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Bug, Lightbulb, ThumbsUp, MessageCircle, Send, Loader2,
  Star, CheckCircle, AlertTriangle, HelpCircle
} from 'lucide-react';

type FeedbackType = 'bug' | 'suggestion' | 'praise' | 'other';

const DashboardFeedback: React.FC = () => {
  const { user, language } = useAppContext();
  const [type, setType] = useState<FeedbackType>('suggestion');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [feedbackHistory, setFeedbackHistory] = useState<{ type: string; message: string; date: string }[]>(() => {
    try {
      const stored = localStorage.getItem('stikm-feedback-history');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const feedbackTypes: { key: FeedbackType; label: string; labelFr: string; icon: React.ReactNode; color: string; bgColor: string }[] = [
    { key: 'bug', label: 'Bug Report', labelFr: 'Rapport de bug', icon: <Bug className="w-5 h-5" />, color: 'text-red-600', bgColor: 'bg-red-50 border-red-200 hover:bg-red-100' },
    { key: 'suggestion', label: 'Suggestion', labelFr: 'Suggestion', icon: <Lightbulb className="w-5 h-5" />, color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-200 hover:bg-amber-100' },
    { key: 'praise', label: 'Praise', labelFr: 'Compliment', icon: <ThumbsUp className="w-5 h-5" />, color: 'text-green-600', bgColor: 'bg-green-50 border-green-200 hover:bg-green-100' },
    { key: 'other', label: 'Other', labelFr: 'Autre', icon: <MessageCircle className="w-5 h-5" />, color: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-200 hover:bg-blue-100' },
  ];

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast.error(language === 'en' ? 'Please enter your feedback' : 'Veuillez entrer votre commentaire');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('feedback').insert({
        user_id: user?.id || null,
        user_email: user?.email || 'anonymous',
        user_name: user?.name || 'Anonymous',
        type,
        message: message.trim(),
        rating: rating || null,
        page: window.location.href,
        user_agent: navigator.userAgent,
        screen_size: `${window.innerWidth}x${window.innerHeight}`,
      });

      if (error) {
        // Fallback to localStorage
        const localFeedback = JSON.parse(localStorage.getItem('stikm-feedback') || '[]');
        localFeedback.push({
          type, message: message.trim(), rating,
          user: user?.email || 'anonymous',
          timestamp: new Date().toISOString(),
        });
        localStorage.setItem('stikm-feedback', JSON.stringify(localFeedback));
      }

      // Save to local history
      const newHistory = [
        { type, message: message.trim(), date: new Date().toISOString() },
        ...feedbackHistory,
      ].slice(0, 10);
      setFeedbackHistory(newHistory);
      try { localStorage.setItem('stikm-feedback-history', JSON.stringify(newHistory)); } catch {}

      setSubmitted(true);
      toast.success(language === 'en' ? 'Thank you for your feedback!' : 'Merci pour votre retour !');

      setTimeout(() => {
        setSubmitted(false);
        setMessage('');
        setRating(0);
        setType('suggestion');
      }, 3000);
    } catch (err) {
      // Fallback
      const localFeedback = JSON.parse(localStorage.getItem('stikm-feedback') || '[]');
      localFeedback.push({
        type, message: message.trim(), rating,
        user: user?.email || 'anonymous',
        timestamp: new Date().toISOString(),
      });
      localStorage.setItem('stikm-feedback', JSON.stringify(localFeedback));
      toast.success(language === 'en' ? 'Feedback saved locally. Thank you!' : 'Commentaire sauvegardé localement. Merci !');
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setMessage('');
        setRating(0);
      }, 3000);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            {language === 'en' ? 'Thank You!' : 'Merci !'}
          </h3>
          <p className="text-gray-500 text-sm">
            {language === 'en'
              ? 'Your feedback helps us improve StikmNek for everyone.'
              : 'Votre retour nous aide à améliorer StikmNek pour tout le monde.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-20 translate-x-20" />
        <div className="relative flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
            <MessageCircle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold">
              {language === 'en' ? 'Feedback & Bug Reports' : 'Retours & Rapports de bugs'}
            </h2>
            <p className="text-white/70 text-sm mt-0.5">
              {language === 'en'
                ? 'Help us improve StikmNek by sharing your experience'
                : 'Aidez-nous à améliorer StikmNek en partageant votre expérience'}
            </p>
          </div>
        </div>
      </div>

      {/* Feedback Form */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 space-y-5">
          {/* Feedback Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              {language === 'en' ? 'What type of feedback?' : 'Quel type de retour ?'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {feedbackTypes.map(ft => (
                <button
                  key={ft.key}
                  onClick={() => setType(ft.key)}
                  className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    type === ft.key
                      ? `${ft.bgColor} ${ft.color} border-current ring-1 ring-current/20`
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {ft.icon}
                  <span className="text-xs font-semibold">{language === 'fr' ? ft.labelFr : ft.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Rating */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              {language === 'en' ? 'Overall Experience' : 'Expérience globale'}
            </label>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-7 h-7 ${
                      star <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
              {rating > 0 && (
                <span className="text-sm text-gray-400 ml-3 font-medium">
                  {rating === 5 ? (language === 'en' ? 'Excellent!' : 'Excellent !') :
                   rating === 4 ? (language === 'en' ? 'Great' : 'Très bien') :
                   rating === 3 ? (language === 'en' ? 'Good' : 'Bien') :
                   rating === 2 ? (language === 'en' ? 'Fair' : 'Moyen') :
                   (language === 'en' ? 'Poor' : 'Mauvais')}
                </span>
              )}
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {type === 'bug'
                ? (language === 'en' ? 'Describe the issue' : 'Décrivez le problème')
                : type === 'suggestion'
                  ? (language === 'en' ? 'Your suggestion' : 'Votre suggestion')
                  : (language === 'en' ? 'Your message' : 'Votre message')}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none h-32"
              placeholder={
                type === 'bug'
                  ? (language === 'en' ? 'What happened? What did you expect? Steps to reproduce...' : 'Que s\'est-il passé ? Que attendiez-vous ?')
                  : type === 'suggestion'
                    ? (language === 'en' ? 'How can we make StikmNek better?' : 'Comment pouvons-nous améliorer StikmNek ?')
                    : (language === 'en' ? 'Tell us what you think...' : 'Dites-nous ce que vous pensez...')
              }
              maxLength={2000}
            />
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[11px] text-gray-400">
                {user ? `${language === 'en' ? 'Sending as' : 'Envoyé en tant que'} ${user.name}` : (language === 'en' ? 'Sending anonymously' : 'Envoi anonyme')}
              </p>
              <span className="text-[11px] text-gray-400">{message.length}/2000</span>
            </div>
          </div>

          {/* Bug report extra info */}
          {type === 'bug' && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-100">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-red-800">
                    {language === 'en' ? 'Helpful bug report tips:' : 'Conseils pour un bon rapport de bug :'}
                  </p>
                  <ul className="text-[11px] text-red-700 mt-1 space-y-0.5 list-disc list-inside">
                    <li>{language === 'en' ? 'Describe what you were doing when the bug occurred' : 'Décrivez ce que vous faisiez'}</li>
                    <li>{language === 'en' ? 'Include any error messages you saw' : 'Incluez les messages d\'erreur'}</li>
                    <li>{language === 'en' ? 'Mention your device and browser if relevant' : 'Mentionnez votre appareil et navigateur'}</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !message.trim()}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" />{language === 'en' ? 'Sending...' : 'Envoi...'}</>
            ) : (
              <><Send className="w-4 h-4" />{language === 'en' ? 'Send Feedback' : 'Envoyer le retour'}</>
            )}
          </button>
        </div>
      </div>

      {/* Previous Feedback */}
      {feedbackHistory.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-500" />
              {language === 'en' ? 'Your Recent Feedback' : 'Vos retours récents'}
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {feedbackHistory.slice(0, 5).map((item, i) => {
              const ft = feedbackTypes.find(f => f.key === item.type);
              return (
                <div key={i} className="p-4 flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    item.type === 'bug' ? 'bg-red-50' :
                    item.type === 'suggestion' ? 'bg-amber-50' :
                    item.type === 'praise' ? 'bg-green-50' : 'bg-blue-50'
                  }`}>
                    {ft?.icon || <MessageCircle className="w-4 h-4 text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 capitalize">{item.type}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.message}</p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardFeedback;
