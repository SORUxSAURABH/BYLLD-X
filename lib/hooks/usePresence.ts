"use client";

import { useEffect } from "react";
import { createClient } from "../supabase/browser";
import { hasSupabaseConfig } from "../supabase/config";

/**
 * Hook that maintains an active online heartbeat for the authenticated user in Supabase.
 * - Sets is_online = true and updates last_seen_at on mount & every 45s
 * - Sets is_online = false on tab hide or window unload
 */
export function usePresence(userId: string | null) {
  useEffect(() => {
    if (!userId || !hasSupabaseConfig()) return;

    const supabase = createClient();

    async function setStatus(online: boolean) {
      try {
        await supabase.from("presence").upsert({
          user_id: userId,
          is_online: online,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } catch {
        // ignore presence heartbeat error
      }
    }

    // Set online on mount
    setStatus(true);

    // Heartbeat every 45 seconds
    const interval = setInterval(() => {
      setStatus(true);
    }, 45000);

    // Handle tab visibility change
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        setStatus(true);
      } else {
        setStatus(false);
      }
    }

    // Handle window beforeunload
    function handleBeforeUnload() {
      setStatus(false);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      setStatus(false);
    };
  }, [userId]);
}
