// supabase.js — creates the Supabase client from environment variables.
// The anon key is safe to ship in the browser: Row-Level Security on the
// database (see supabase-setup.sql) is what actually protects the data.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,       // keep the user signed in across launches
        autoRefreshToken: true,
        detectSessionInUrl: true,   // pick up the magic-link tokens on return
      },
    })
  : null;
