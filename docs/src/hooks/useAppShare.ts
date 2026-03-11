/**
 * useAppShare — Share-to-upgrade logic for StikmNek passes
 * Triggers native share dialog (or clipboard fallback) and optionally
 * calls extend-pass to apply share bonus to the user's active pass.
 */
import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export interface ShareOptions {
  title: string;
  text: string;
  url: string;
}

export interface AppShareResult {
  success: boolean;
  platform: 'native-share' | 'clipboard';
}

/**
 * Triggers the native share dialog (or clipboard fallback).
 * Returns { success, platform }.
 */
export async function handleAppShare(options: ShareOptions): Promise<AppShareResult> {
  const { title, text, url } = options;

  if (navigator.share) {
    try {
      await navigator.share({
        title,
        text,
        url,
      });
      return { success: true, platform: 'native-share' };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, platform: 'native-share' };
      }
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        toast.success('Link copied to clipboard!');
        return { success: true, platform: 'clipboard' };
      } catch {
        toast.error('Could not share. Please try again.');
        return { success: false, platform: 'clipboard' };
      }
    }
  }

  // No Web Share API — use clipboard
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast.success('Link copied! Share it to unlock your bonus.');
    return { success: true, platform: 'clipboard' };
  } catch {
    toast.error('Could not copy link. Please try again.');
    return { success: false, platform: 'clipboard' };
  }
}

/**
 * Calls the extend-pass edge function to apply share bonus.
 * Updates max_people and valid_until in the DB per business model.
 */
export async function claimShareBonus(
  userId: string,
  shareProof: string,
  platform: string
): Promise<{ success: boolean; data?: any; error?: any }> {
  try {
    const { data, error } = await supabase.functions.invoke('extend-pass', {
      body: {
        user_id: userId,
        share_proof: shareProof,
        platform,
      },
    });

    if (error) {
      return { success: false, error };
    }
    return { success: !!data?.success, data };
  } catch (err: any) {
    return { success: false, error: err };
  }
}

export function useAppShare() {
  const share = useCallback(handleAppShare, []);
  const claimBonus = useCallback(claimShareBonus, []);
  return { share, claimBonus };
}
