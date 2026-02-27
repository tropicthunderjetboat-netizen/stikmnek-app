import React, { useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  MessageCircle, X, Send, Bug, Lightbulb, ThumbsUp,
  Loader2, ChevronDown, Star
} from 'lucide-react';

type FeedbackType = 'bug' | 'suggestion' | 'praise' | 'other';

const FeedbackWidget: React.FC = () => {
  const { user, currentView } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);

  const [type, setType] = useState<FeedbackType>('suggestion');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const feedbackTypes: { key: FeedbackType; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'bug', label: 'Bug Report', icon: <Bug className="w-4 h-4" />, color: 'text-red-600 bg-red-50 border-red-200' },
    { key: 'suggestion', label: 'Suggestion', icon: <Lightbulb className="w-4 h-4" />, color: 'text-amber-600 bg-amber-50 border-amber-200' },
    { key: 'praise', label: 'Praise', icon: <ThumbsUp className="w-4 h-4" />, color: 'text-green-600 bg-green-50 border-green-200' },
    { key: 'other', label: 'Other', icon: <MessageCircle className="w-4 h-4" />, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  ];

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast.error('Please enter your feedback');
      return;
    }

    setSubmitting(true);
    try {
      // Store feedback in the database
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
        // If table doesn't exist, store locally
        const localFeedback = JSON.parse(localStorage.getItem('stikm-feedback') || '[]');
        localFeedback.push({
          type,
          message: message.trim(),
          rating,
          user: user?.email || 'anonymous',
          timestamp: new Date().toISOString(),
        });
        localStorage.setItem('stikm-feedback', JSON.stringify(localFeedback));
      }

      setSubmitted(true);
      toast.success('Thank you for your feedback!');
      
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
        setMessage('');
        setRating(0);
        setType('suggestion');
      }, 2000);
    } catch (err) {
      // Fallback to localStorage
      const localFeedback = JSON.parse(localStorage.getItem('stikm-feedback') || '[]');
      localFeedback.push({
        type,
        message: message.trim(),
        rating,
        user: user?.email || 'anonymous',
        timestamp: new Date().toISOString(),
      });
      localStorage.setItem('stikm-feedback', JSON.stringify(localFeedback));
      
      setSubmitted(true);
      toast.success('Feedback saved locally. Thank you!');
      
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
        setMessage('');
        setRating(0);
      }, 2000);
    } finally {
      setSubmitting(false);
    }
  };

  // Hide the feedback widget on business-dashboard (it has its own FAB for QR scanning)
  if (currentView === 'business-dashboard' || currentView === 'admin') return null;

  return (
    <>

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-110 ${
          isOpen
            ? 'bg-gray-700 text-white rotate-0'
            : 'bg-gradient-to-br from-teal-500 to-emerald-600 text-white'
        }`}
        title="Send Feedback"
      >
        {isOpen ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
      </button>

      {/* Feedback Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
          {submitted ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-50 flex items-center justify-center">
                <ThumbsUp className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Thank You!</h3>
              <p className="text-sm text-gray-500 mt-1">Your feedback helps us improve StikmNek.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="bg-gradient-to-r from-teal-600 to-emerald-600 p-4">
                <h3 className="text-white font-bold text-base">Send Feedback</h3>
                <p className="text-white/70 text-xs mt-0.5">
                  Help us improve StikmNek for everyone
                </p>
              </div>

              <div className="p-4 space-y-4">
                {/* Feedback Type */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-2">Type</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {feedbackTypes.map(ft => (
                      <button
                        key={ft.key}
                        onClick={() => setType(ft.key)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-xs font-medium transition-all ${
                          type === ft.key ? ft.color + ' border-current' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {ft.icon}
                        <span className="text-[10px]">{ft.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rating */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-2">Overall Experience</label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        onClick={() => setRating(star)}
                        className="p-0.5 transition-transform hover:scale-110"
                      >
                        <Star
                          className={`w-6 h-6 ${
                            star <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'
                          }`}
                        />
                      </button>
                    ))}
                    {rating > 0 && (
                      <span className="text-xs text-gray-400 ml-2">
                        {rating === 5 ? 'Excellent!' : rating === 4 ? 'Great' : rating === 3 ? 'Good' : rating === 2 ? 'Fair' : 'Poor'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-2">
                    {type === 'bug' ? 'Describe the issue' : type === 'suggestion' ? 'Your suggestion' : 'Your message'}
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none h-24"
                    placeholder={
                      type === 'bug'
                        ? 'What happened? What did you expect?'
                        : type === 'suggestion'
                        ? 'How can we make StikmNek better?'
                        : 'Tell us what you think...'
                    }
                    maxLength={1000}
                  />
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[10px] text-gray-400">
                      {user ? `Sending as ${user.name}` : 'Sending anonymously'}
                    </p>
                    <span className="text-[10px] text-gray-400">{message.length}/1000</span>
                  </div>
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !message.trim()}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-semibold text-sm hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Sending...</>
                  ) : (
                    <><Send className="w-4 h-4" />Send Feedback</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default FeedbackWidget;
