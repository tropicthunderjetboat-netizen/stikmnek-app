import React from 'react';

function PalmWatermark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M60 150V72"
        stroke="#0FB5B5"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M60 78C48 62 28 52 12 50c18 8 32 22 38 40"
        fill="#0FB5B5"
      />
      <path
        d="M60 78c12-16 32-26 48-28-18 8-32 22-38 40"
        fill="#0FB5B5"
      />
      <path
        d="M60 70C42 58 30 36 28 18c14 14 26 32 32 52"
        fill="#0FB5B5"
      />
      <path
        d="M60 70c18-12 30-34 32-52-14 14-26 32-32 52"
        fill="#0FB5B5"
      />
      <path
        d="M60 82c-4-22-18-40-36-50 22 4 36 24 40 48"
        fill="#0FB5B5"
      />
      <path
        d="M60 82c4-22 18-40 36-50-22 4-36 24-40 48"
        fill="#0FB5B5"
      />
    </svg>
  );
}

export type PassTicketCardProps = {
  /** Ages 6+ covered by the pass */
  partySize: number;
  /** Optional QR image URL — when omitted, only ticket copy is shown */
  qrCodeUrl?: string | null;
  /** Compact modal vs full dashboard */
  size?: 'default' | 'compact';
  className?: string;
  children?: React.ReactNode;
};

/**
 * Light tropical “ticket stub” pass card — cream bg, dashed teal edge, palm watermark.
 */
export default function PassTicketCard({
  partySize,
  qrCodeUrl,
  size = 'default',
  className = '',
  children,
}: PassTicketCardProps) {
  const crewLabel =
    partySize <= 1 ? '1 person' : partySize >= 5 ? `${partySize} people` : `${partySize} people`;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-[#FFF8F0] shadow-sm ${className}`}
      style={{
        borderTop: '2px dashed #0FB5B5',
        borderLeft: '1px solid rgba(15, 181, 181, 0.25)',
        borderRight: '1px solid rgba(15, 181, 181, 0.25)',
        borderBottom: '1px solid rgba(15, 181, 181, 0.25)',
      }}
    >
      <PalmWatermark className="pointer-events-none absolute -left-2 top-4 h-36 w-28 opacity-[0.12]" />

      <div className={`relative z-10 ${size === 'compact' ? 'p-4' : 'p-5 sm:p-6'}`}>
        <p className="text-[15px] sm:text-base font-bold text-[#0A0A0A] tracking-tight">
          STIKMNEK PASS · For {crewLabel}
        </p>
        <p className="mt-1 text-sm text-[#555555]">1 pass covers your whole crew · 7 days</p>
        <p className="mt-1.5 text-xs text-[#888888]">$30 first + $10 each extra</p>

        {qrCodeUrl ? (
          <div className="mt-4 flex justify-center">
            <div className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5">
              <img
                src={qrCodeUrl}
                alt="Your StikmNek Pass QR Code"
                className={size === 'compact' ? 'h-[200px] w-[200px]' : 'h-[240px] w-[240px] sm:h-[260px] sm:w-[260px]'}
                loading="eager"
              />
            </div>
          </div>
        ) : null}

        {children}

        <div className="mt-4 flex justify-end">
          <span className="inline-flex items-center gap-1 rounded-full border border-[#0FB5B5] px-2.5 py-1 text-[11px] font-semibold text-[#0FB5B5]">
            🌴 Supports local
          </span>
        </div>
      </div>
    </div>
  );
}
