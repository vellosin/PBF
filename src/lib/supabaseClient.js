import { createClient } from '@supabase/supabase-js';

export const isSupabaseConfigured = () => {
  try {
    if (String(import.meta.env.VITE_DISABLE_SUPABASE || '0') === '1') return false;
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    return Boolean(url && key);
  } catch {
    return false;
  }
};

export const supabase = isSupabaseConfigured()
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
      auth: {
        // Default to NOT persisting sessions so the app always starts at the login screen.
        // Set VITE_SUPABASE_PERSIST_SESSION=1 to opt in.
        persistSession: String(import.meta.env.VITE_SUPABASE_PERSIST_SESSION || '0') === '1'
      }
    })
  : null;
