import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { X, Copy, Check } from 'lucide-react';
import PassTicketCard from '@/components/PassTicketCard';
import { clampPartySize } from '@/data/pricing';

const FloatingPassButton: React.FC = () => {
  const { user, currentView } = useAppContext();
  const [showPass, setShowPass] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pulseAnim, setPulseAnim] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setPulseAnim(false), 10000);
    return () => clearTimeout(timer);
  }, []);

  // Only show for tourists with an active pass — not on the pre-purchase homepage feed
  if (!user || user.type !== 'tourist' || !user.pass || !user.passId) return null;

  // Hide during checkout / admin — QR is for account + post-purchase (incl. home after buy)
  if (currentView === 'checkout' || currentView === 'payment-confirmation' || currentView === 'admin') {
    return null;
  }

  const partySize = clampPartySize(user.passPeopleCount || 1);
  const qrPayload = user.passId;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrPayload)}&color=0d9488&bgcolor=ffffff&margin=8`;

  const handleCopy = () => {
    navigator.clipboard.writeText(qrPayload).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <>
      <button
        onClick={() => setShowPass(true)}
        className="fixed bottom-6 right-6 z-50 group flex items-center gap-2.5 pl-4 pr-5 py-3.5 rounded-full bg-[#0FB5B5] text-white font-bold shadow-xl shadow-teal-300/40 hover:bg-[#0da3a3] active:scale-95 transition-all duration-200"
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

            <PassTicketCard partySize={partySize} qrCodeUrl={qrCodeUrl} size="compact">
              <div className="mt-3 space-y-2">
                <p className="text-center text-xs text-[#555555]">
                  Holder · <span className="font-semibold text-[#0A0A0A]">{user.name}</span>
                </p>
                <p className="text-center text-[11px] text-[#888888]">
                  {user.passValidFrom
                    ? new Date(user.passValidFrom + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })
                    : '-'}
                  {' — '}
                  {user.passValidUntil
                    ? new Date(user.passValidUntil + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '-'}
                </p>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-teal-200/80 bg-white/70 text-sm text-[#555555] hover:bg-white transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-green-600" />
                      <span className="text-green-600 font-medium">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy pass code</span>
                    </>
                  )}
                </button>
              </div>
            </PassTicketCard>
          </div>
        </div>
      )}
    </>
  );
};

export default FloatingPassButton;
