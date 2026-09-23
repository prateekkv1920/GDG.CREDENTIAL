/**
 * ============================================================
 * ⚡ SUPABASE CONFIGURATION
 * ============================================================
 * Project: prateekkv1920's Project
 * Project ID: anrgvpowpwncyneqxlcm
 * ============================================================
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Supabase Project URL for project "anrgvpowpwncyneqxlcm"
export const SUPABASE_URL = "https://anrgvpowpwncyneqxlcm.supabase.co";

// ⬇️ Paste your Supabase `anon` / `public` API key below ⬇️
// Found in: Supabase Dashboard → Project Settings (Gear Icon) → API → Project API Keys → `anon` `public`
export const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

export const isSupabaseConfigured = !SUPABASE_ANON_KEY.startsWith("YOUR_");

let supabase = null;

if (isSupabaseConfigured) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("✅ Supabase initialized successfully");
  } catch (err) {
    console.error("❌ Supabase init error:", err);
  }
} else {
  console.warn("⚠️ Supabase anon key not set in js/supabase-config.js");
}

export { supabase };
