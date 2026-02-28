import { createClient } from '@supabase/supabase-js';

// 1. Credentials
const supabaseUrl = 'https://hbaflbmfptobyfqbudrt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYWZsYm1mcHRvYnlmcWJ1ZHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MTMwMTIsImV4cCI6MjA4NzI4OTAxMn0.Ukdx0PKI6cpoEdKGcV4LgcgumkhDIfiIXbmVMgbqKL0';

// 2. Initialize Client
export const supabase = createClient(supabaseUrl, supabaseKey);

// 3. Derived Endpoints
export const ENDPOINTS = {
  auth:      `${supabaseUrl}/auth/v1`,
  rest:      `${supabaseUrl}/rest/v1`,
  functions: `${supabaseUrl}/functions/v1`,
  storage:   `${supabaseUrl}/storage/v1`,
};

/**
 * directProfileInsert
 * Bypasses the edge trigger to ensure a profile exists.
 */
export async function directProfileInsert(params: {
  userId: string;
  email: string;
  name: string;
  userType: 'customer' | 'business';
}) {
  console.log('[directProfileInsert] Starting for:', params.userId);
  try {
    const { data: inserted, error: insertError } = await supabase
      .from('user_profiles')
      .insert({
        user_id: params.userId,
        name: params.name,
        full_name: params.name,
        user_type: params.userType,
        display_name: params.name,
        role: params.userType,
        email: params.email,
        phone: '',
        onboarding_complete: params.userType !== 'business',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: conflictProfile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', params.userId)
          .maybeSingle();
        if (conflictProfile) return { success: true, profile: conflictProfile };
      }
      return { success: false, error: insertError.message };
    }
    return { success: true, profile: inserted };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}