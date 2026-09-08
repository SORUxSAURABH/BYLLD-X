const FALLBACK_SUPABASE_URL = "https://yszkarazdwhwstivovxx.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzemthcmF6ZHdod3N0aXZvdnh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MDM2MzYsImV4cCI6MjEwNDM3OTYzNn0.XSxct6gWK8hbPts1sUhuC4gam8klOv_iZmJ8eLu1AIk";

export function hasSupabaseConfig() {
  return true;
}

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || FALLBACK_SUPABASE_PUBLISHABLE_KEY;
  return { url, publishableKey };
}
