import React, { useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { QrCode, Calendar, Shield, Ticket, Copy, Check } from 'lucide-react';

const QRCodeDisplay: React.FC = () => {
  const { user } = useAppContext();
  const [copied, setCopied] = React.useState(false);

  // Generate the QR code data payload
  const qrPayload = useMemo(() => {
    if (!user || !user.pass || !user.passId) return null;
    return JSON.stringify({
      type: 'stikm_nek_pass',
      userId: user.id,
      passId: user.passId,
      passType: user.pass,
      validFrom: user.passValidFrom,
      validUntil: user.passValidUntil,
      name: user.name,
    });
  }, [user]);

  // Generate QR code URL using qrserver.com API
  const qrCodeUrl = useMemo(() => {
    if (!qrPayload) return null;
    const encoded = encodeURIComponent(qrPayload);
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encoded}&color=0d9488&bgcolor=ffffff&margin=8`;
  }, [qrPayload]);

  const handleCopyCode = () => {
    if (qrPayload) {
      navigator.clipboard.writeText(qrPayload).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  if (!user || !user.pass || !user.passId) {
    return null;
  }

  const passColors: Record<string, string> = {
    daily: 'from-sky-500 to-blue-600',
    weekly: 'from-teal-500 to-emerald-600',
    monthly: 'from-orange-500 to-amber-600',
  };

  const passBgColors: Record<string, string> = {
    daily: 'bg-sky-50 border-sky-200',
    weekly: 'bg-teal-50 border-teal-200',
    monthly: 'bg-orange-50 border-orange-200',
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className={`bg-gradient-to-r ${passColors[user.pass] || passColors.weekly} p-5 text-white`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Your Pass QR Code</h3>
              <p className="text-white/80 text-xs">Show this to businesses to redeem discounts</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-bold">
            <div className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
            Active
          </div>
        </div>
      </div>

      {/* QR Code */}
      <div className="p-6 flex flex-col items-center">
        <div className={`p-4 rounded-2xl border-2 ${passBgColors[user.pass] || passBgColors.weekly} mb-4`}>
          {qrCodeUrl ? (
            <img
              src={qrCodeUrl}
              alt="Your StikmNek Pass QR Code"
              className="w-[280px] h-[280px] rounded-xl"
              loading="eager"
            />
          ) : (
            <div className="w-[280px] h-[280px] rounded-xl bg-gray-100 flex items-center justify-center">
              <QrCode className="w-16 h-16 text-gray-300" />
            </div>
          )}
        </div>

        {/* Pass Info */}
        <div className="w-full space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
            <div className="flex items-center gap-2">
              <Ticket className="w-4 h-4 text-teal-600" />
              <span className="text-sm text-gray-600">Pass Type</span>
            </div>
            <span className="text-sm font-bold text-gray-900 capitalize">{user.pass} Pass</span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-600" />
              <span className="text-sm text-gray-600">Valid Period</span>
            </div>
            <span className="text-sm font-bold text-gray-900">
              {user.passValidFrom
                ? new Date(user.passValidFrom + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '-'}
              {' - '}
              {user.passValidUntil
                ? new Date(user.passValidUntil + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '-'}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-teal-600" />
              <span className="text-sm text-gray-600">Pass Holder</span>
            </div>
            <span className="text-sm font-bold text-gray-900">{user.name}</span>
          </div>
        </div>

        {/* Copy Button (for manual entry fallback) */}
        <button
          onClick={handleCopyCode}
          className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-green-600" />
              <span className="text-green-600 font-medium">Copied to clipboard!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copy pass code (for manual entry)</span>
            </>
          )}
        </button>

        {/* Instructions */}
        <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-100 w-full">
          <p className="text-xs font-semibold text-blue-800 mb-1">How to use your QR code:</p>
          <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
            <li>Visit any participating business</li>
            <li>Show this QR code to the staff</li>
            <li>They will scan it to verify your pass</li>
            <li>Enjoy your discount automatically!</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default QRCodeDisplay;
