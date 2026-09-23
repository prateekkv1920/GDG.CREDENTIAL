/**
 * ============================================================
 * ⚡ SUPABASE CONFIGURATION
 * ============================================================
 * Project: prateekkv1920's Project
 * Project ID: anrgvpowpwncyneqxlcm
 * ============================================================
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Supabase Project URL
export const SUPABASE_URL = "https://anrgvpowpwncyneqxlcm.supabase.co";

// Supabase Publishable / Anon API Key
export const SUPABASE_ANON_KEY = "sb_publishable_SLyd0_gva4JPX8FJdP2fBA_wQPN0aaS";

export const isSupabaseConfigured = SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith("YOUR_");

let supabase = null;

if (isSupabaseConfigured) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("✅ Supabase initialized successfully for project: anrgvpowpwncyneqxlcm");
  } catch (err) {
    console.error("❌ Supabase init error:", err);
  }
}

export { supabase };
