"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { createClient } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

export type PlanTier = "free" | "pro" | "annual_pro";

export interface User {
  id: string;
  email: string;
  name: string;
  plan_tier: PlanTier;
  credits_used: number;
  credits_limit: number;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  loginWithGoogle: () => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  consumeCredit: () => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  // Fetch the app-level user profile from our backend
  const fetchProfile = async (accessToken: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/user/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        console.error("Failed to fetch profile:", res.status);
      }
    } catch (err) {
      console.error("Failed to fetch profile:", err);
    }
  };

  const refreshProfile = async () => {
    if (session?.access_token) {
      await fetchProfile(session.access_token);
    }
  };

  useEffect(() => {
    // Check for existing session on mount
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.access_token) {
        fetchProfile(s.access_token).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s);
        if (s?.access_token) {
          await fetchProfile(s.access_token);
        } else {
          setUser(null);
        }
      }
    );

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  };

  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/tailor` },
    });
  };

  const signup = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) return { error: error.message };
    return {};
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  const consumeCredit = () => {
    if (!user) return false;
    if (user.plan_tier !== "free") return true;
    if (user.credits_used >= user.credits_limit) return false;
    setUser({ ...user, credits_used: user.credits_used + 1 });
    return true;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, login, loginWithGoogle, signup, logout, consumeCredit, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
