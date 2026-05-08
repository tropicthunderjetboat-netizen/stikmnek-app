import { supabase } from '@/lib/supabase';

export type InteractionEventType =
  | 'view_listing'
  | 'click_listing'
  | 'tap_request_booking'
  | 'tap_whatsapp';

type TrackInteractionEventArgs = {
  eventType: InteractionEventType;
  businessId: string;
  offeringId?: string | null;
  /**
   * If true, only log once per browser session for this (eventType,businessId,offeringId).
   * Useful for page views to avoid inflating counts on re-renders.
   */
  dedupeInSession?: boolean;
};

const sessionDedupeKey = (a: TrackInteractionEventArgs) =>
  `stikm-evt:${a.eventType}:${a.businessId}:${a.offeringId ?? ''}`;

export async function trackInteractionEvent(args: TrackInteractionEventArgs): Promise<void> {
  try {
    if (!args.businessId) return;

    if (args.dedupeInSession) {
      try {
        const key = sessionDedupeKey(args);
        if (sessionStorage.getItem(key) === '1') return;
        sessionStorage.setItem(key, '1');
      } catch {
        // ignore
      }
    }

    // Keep it privacy-safe: we do not store IP/user agent here. user_id is optional.
    await supabase.from('analytics_events').insert({
      event_type: args.eventType,
      business_id: args.businessId,
      offering_id: args.offeringId ?? null,
      user_id: null,
    });
  } catch {
    // Silent by design — analytics must never break UX.
  }
}

