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

      // Fetch role from the public users table
      const { data: record } = await supabase
        .from("users")
        .select("role")
        .eq("id", supabaseUser.id)
        .single();

      // Check active subscription from the subscriptions table
      const now = new Date().toISOString();
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("tier")
        .eq("user_id", supabaseUser.id)
        .eq("tier", "premium")
        .gt("ends_at", now)
        .limit(1)
        .maybeSingle();

      // Fetch profile for real full_name & completion percentage
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, completion_percent")
        .eq("user_id", supabaseUser.id)
        .single();

      const role = (record?.role ?? "founder") as "founder" | "investor";
      const isPremium = Boolean(sub);

      const fullName =
        profile?.full_name ||
        (supabaseUser.user_metadata?.full_name as string | undefined) ||
        supabaseUser.email?.split("@")[0] ||
        "Member";

      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email ?? "",
        fullName,
        role,
        initials: toInitials(fullName),
        isPremium,
        completionPercent: profile?.completion_percent ?? 0,
      });
      setLoading(false);
    }

    // Load current session immediately
    supabase.auth.getUser().then(({ data: { user: u } }) => loadUser(u));

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
