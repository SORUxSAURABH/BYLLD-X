const FALLBACK_SUPABASE_URL = "https://ourpauaxcqdqvpjvzhxo.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91cnBhdWF4Y3FkcXZwanZ6aHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1MzIwMzYsImV4cCI6MjEwNDEwODAzNn0.CxNK8QJxNTLI84CPLobWVYfwUVe2XDUY3H7Dy6i6F28";

export function hasSupabaseConfig() {
  return true;
}

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || FALLBACK_SUPABASE_PUBLISHABLE_KEY;
  return { url, publishableKey };
}
