import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { X } from 'lucide-react';
import PassCard from '@/components/PassCard';

const FloatingPassButton: React.FC = () => {
  const { user, currentView } = useAppContext();
  const [showPass, setShowPass] = useState(false);
  const [pulseAnim, setPulseAnim] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setPulseAnim(false), 10000);
    return () => clearTimeout(timer);
  }, []);

  if (!user || user.type !== 'tourist' || !user.pass || !user.passId) return null;

  if (
    currentView === 'home' ||
    currentView === 'dashboard' ||
    currentView === 'checkout' ||
    currentView === 'payment-confirmation' ||
    currentView === 'admin' ||
    currentView === 'my-favorites'
  ) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setShowPass(true)}
        className="fixed z-50 group flex items-center gap-2.5 pl-4 pr-5 py-3.5 rounded-full bg-[#0FB5B5] text-white font-bold shadow-xl shadow-teal-300/40 hover:bg-[#0da3a3] active:scale-95 transition-all duration-200 right-6 md:right-[max(1.5rem,calc((100vw-480px)/2+1.5rem))]"
        style={{ bottom: 'calc(1.5rem + var(--hub-nav-offset, 0px))' }}
        title="Show my Pass"
        aria-label="Show my StikmNek Pass"
      >
        <div className="relative">
          <span className="text-lg leading-none" aria-hidden>
            🌴
          </span>
          {pulseAnim && (
            <>
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-300 animate-ping" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-300" />
            </>
          )}
        </div>
        <span className="text-sm whitespace-nowrap">Show my Pass</span>
      </button>

      {showPass && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowPass(false)}
        >
          <div
            className="relative w-full max-w-sm mx-4 animate-in slide-in-from-bottom-4 zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowPass(false)}
              className="absolute -top-3 -right-1 z-20 w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center text-gray-600 hover:bg-gray-50"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <PassCard size="compact" showSharePrompt={false} />
          </div>
        </div>
      )}
    </>
  );
};

export default FloatingPassButton;
