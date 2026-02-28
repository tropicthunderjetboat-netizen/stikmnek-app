import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hbaflbmfptobyfqbudrt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYWZsYm1mcHRvYnlmcWJ1ZHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MTMwMTIsImV4cCI6MjA4NzI4OTAxMn0.Ukdx0PKI6cpoEdKGcV4LgcgumkhDIfiIXbmVMgbqKL0';

export const supabase = createClient(supabaseUrl, supabaseKey);

export const ENDPOINTS = {
  auth:      `${supabaseUrl}/auth/v1`,
  rest:      `${supabaseUrl}/rest/v1`,
  functions: `${supabaseUrl}/functions/v1`,
  storage:   `${supabaseUrl}/storage/v1`,
};

export async function directProfileInsert(params: {
  userId: string;
  email: string;
  name: string;
  userType: 'customer' | 'business';
}) {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .insert({
        user_id: params.userId,
        name: params.name,
        full_name: params.name,
        user_type: params.userType,
        email: params.email,
        onboarding_complete: params.userType !== 'business',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error && error.code === '23505') {
       return { success: true };
    }
    return { success: !error, profile: data, error: error?.message };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}