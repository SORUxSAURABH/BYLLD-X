"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../supabase/browser";
import { hasSupabaseConfig } from "../supabase/config";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: "founder" | "investor";
  initials: string;
  isPremium: boolean;
  completionPercent: number;
};

function toInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      setLoading(false);
      return;
    }

    const supabase = createClient();

    async function loadUser(supabaseUser: User | null) {
      if (!supabaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        // Fetch role and full_name from public.users table
        const { data: record } = await supabase
          .from("users")
          .select("role, full_name")
          .eq("id", supabaseUser.id)
          .maybeSingle();

        // Check active subscription from subscriptions table
        const now = new Date().toISOString();
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("tier")
          .eq("user_id", supabaseUser.id)
          .eq("tier", "premium")
          .lte("starts_at", now)
          .gt("ends_at", now)
          .limit(1)
          .maybeSingle();

        // Fetch profile for real full_name & completion percentage
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, completion_percent")
          .eq("user_id", supabaseUser.id)
          .maybeSingle();

        const role = (record?.role ?? (supabaseUser.user_metadata?.role as string) ?? "founder") as "founder" | "investor";
        const isPremium = Boolean(sub);

        // Full name resolution: DB profile > public.users record > Supabase auth metadata > fallback to email handle
        const fullName =
          profile?.full_name ||
          record?.full_name ||
          (supabaseUser.user_metadata?.full_name as string | undefined) ||
          supabaseUser.email?.split("@")[0] ||
          (role === "founder" ? "Founder Member" : "Investor Member");

        setUser({
          id: supabaseUser.id,
          email: supabaseUser.email ?? "",
          fullName,
          role,
          initials: toInitials(fullName),
          isPremium,
          completionPercent: profile?.completion_percent ?? 50,
        });
      } catch (err) {
        console.error("Error loading user profile:", err);
      } finally {
        setLoading(false);
      }
    }

    // Load current session immediately
    supabase.auth.getUser()
      .then(({ data: { user: u } }) => loadUser(u))
      .catch(() => setLoading(false));

    // Subscribe to auth changes (sign-in / sign-out / token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      loadUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading };
}
