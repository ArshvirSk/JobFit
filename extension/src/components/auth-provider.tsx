"use client";

import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

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
  login: () => void;
  logout: () => void;
  consumeCredit: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MOCK_USER: User = {
  id: "usr_mock_123",
  email: "arshvir@example.com",
  name: "Arshvir Singh Kalsi",
  plan_tier: "free",
  credits_used: 0,
  credits_limit: 3,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(MOCK_USER);

  const login = () => setUser(MOCK_USER);
  const logout = () => setUser(null);

  const consumeCredit = () => {
    if (!user) return false;
    if (user.plan_tier !== "free") return true; // Pro users have unlimited
    if (user.credits_used >= user.credits_limit) return false;
    
    setUser({ ...user, credits_used: user.credits_used + 1 });
    return true;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, consumeCredit }}>
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
