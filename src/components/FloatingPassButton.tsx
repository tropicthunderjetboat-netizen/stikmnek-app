import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { getPassDisplayTitle } from '@/data/pricing';
import { QrCode, X, Calendar, Shield, Ticket, Copy, Check, ChevronUp } from 'lucide-react';

const FloatingPassButton: React.FC = () => {
  const { user, currentView, language } = useAppContext();
  const [showPass, setShowPass] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pulseAnim, setPulseAnim] = useState(true);

  // Stop pulse after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => setPulseAnim(false), 10000);
    return () => clearTimeout(timer);
  }, []);

  // Only show for tourists with an active pass
  if (!user || user.type !== 'tourist' || !user.pass || !user.passId) return null;

  // Hide on certain views where it would conflict
  if (currentView === 'checkout' || currentView === 'payment-confirmation' || currentView === 'admin') return null;

  const passColors: Record<string, { gradient: string; bg: string; border: string; shadow: string }> = {
    daily: {
      gradient: 'from-sky-500 to-blue-600',
      bg: 'bg-sky-50',
      border: 'border-sky-200',
      shadow: 'shadow-sky-300/50',
    },
    weekly: {
      gradient: 'from-teal-500 to-emerald-600',
      bg: 'bg-teal-50',
      border: 'border-teal-200',
      shadow: 'shadow-teal-300/50',
    },
    monthly: {
      gradient: 'from-orange-500 to-amber-600',
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      shadow: 'shadow-orange-300/50',
    },
    mega_group: {
      gradient: 'from-fuchsia-600 to-purple-700',
      bg: 'bg-fuchsia-50',
      border: 'border-fuchsia-200',
      shadow: 'shadow-fuchsia-300/50',
    },
  };

  const colors = passColors[user.pass] || passColors.weekly;
  const passTitle = getPassDisplayTitle(user.pass, language);

  // Generate QR code data
  const qrPayload = JSON.stringify({
    type: 'stikm_nek_pass',
    userId: user.id,
    passId: user.passId,
    passType: user.pass,
    validFrom: user.passValidFrom,
    validUntil: user.passValidUntil,
    name: user.name,
  });

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrPayload)}&color=0d9488&bgcolor=ffffff&margin=8`;

  const handleCopy = () => {
    navigator.clipboard.writeText(qrPayload).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setShowPass(true)}
        className={`fixed bottom-6 right-6 z-50 group flex items-center gap-2.5 pl-4 pr-5 py-3.5 rounded-full bg-gradient-to-r ${colors.gradient} text-white font-bold shadow-xl ${colors.shadow} hover:shadow-2xl active:scale-95 transition-all duration-200`}
        title="Show my Pass"
        aria-label="Show my StikmNek Pass"
      >
        <div className="relative">
          <QrCode className="w-5 h-5" />
          {pulseAnim && (
            <>
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-300 animate-ping" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-300" />
            </>
          )}
        </div>
        <span className="text-sm whitespace-nowrap">Show my Pass</span>
      </button>

      {/* Pass Modal Overlay */}
      {showPass && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowPass(false)}
        >
          <div
            className="relative w-full max-w-sm mx-4 bg-white rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`bg-gradient-to-r ${colors.gradient} p-5 text-white relative overflow-hidden`}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16" />
              <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/10 rounded-full translate-y-10 -translate-x-10" />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-lg">StikmNek Pass</h3>
                    <p className="text-white/80 text-xs leading-snug">{passTitle}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPass(false)}
                  className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="relative mt-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
                <span className="text-white/90 text-xs font-semibold">Active Pass</span>
              </div>
            </div>

            {/* QR Code */}
            <div className="p-6 flex flex-col items-center">
              <div className={`p-3 rounded-2xl border-2 ${colors.border} ${colors.bg} mb-4`}>
                <img
                  src={qrCodeUrl}
                  alt="Your StikmNek Pass QR Code"
                  className="w-[260px] h-[260px] rounded-xl"
                  loading="eager"
                />
              </div>

              {/* Pass Holder Info */}
              <div className="w-full space-y-2.5 mb-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-teal-600" />
                    <span className="text-xs text-gray-500">Pass Holder</span>
                  </div>
                  <span className="text-sm font-bold text-gray-900">{user.name}</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-teal-600" />
                    <span className="text-xs text-gray-500">Valid Period</span>
                  </div>
                  <span className="text-xs font-bold text-gray-900">
                    {user.passValidFrom
                      ? new Date(user.passValidFrom + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : '-'}
                    {' — '}
                    {user.passValidUntil
                      ? new Date(user.passValidUntil + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '-'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                  <div className="flex items-center gap-2">
                    <Ticket className="w-4 h-4 text-teal-600" />
                    <span className="text-xs text-gray-500">Pass Type</span>
                  </div>
                  <span className="text-sm font-bold text-gray-900 text-right leading-snug">{passTitle}</span>
                </div>
              </div>

              {/* Copy Button */}
              <button
                onClick={handleCopy}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
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

              {/* Instructions */}
              <div className="mt-3 p-3.5 rounded-xl bg-blue-50 border border-blue-100 w-full">
                <p className="text-xs font-semibold text-blue-800 mb-1.5">How to use:</p>
                <ol className="text-[11px] text-blue-700 space-y-1 list-decimal list-inside">
                  <li>Show this QR code at any participating business</li>
                  <li>Staff will scan it to verify your pass</li>
                  <li>Enjoy your discount automatically!</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FloatingPassButton;
