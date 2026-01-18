
import { createClient } from '@supabase/supabase-js';

// Access environment variables securely
// Safely handle cases where import.meta.env might be undefined during initialization
const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase credentials missing. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env or Vercel settings.");
}

// Use placeholders to prevent 'supabaseUrl is required' error during initialization if env vars are missing.
// Requests will simply fail gracefully if keys are invalid, which is handled in App.tsx.
const validUrl = supabaseUrl && supabaseUrl.length > 0 ? supabaseUrl : 'https://placeholder.supabase.co';
const validKey = supabaseAnonKey && supabaseAnonKey.length > 0 ? supabaseAnonKey : 'placeholder-key';

export const supabase = createClient(validUrl, validKey);
