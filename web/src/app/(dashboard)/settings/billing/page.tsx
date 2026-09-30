"use client";

import { useState } from "react";
import { Check, Zap, Shield, Loader2, Sparkles, TrendingUp, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";

export default function BillingSettings() {
  const { user } = useAuth();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  const handleSubscribe = async (tier: string) => {
    try {
      setLoadingTier(tier);
      const res = await api.createCheckoutSession(tier);
      if (res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (e) {
      console.error(e);
      alert("Failed to initialize checkout.");
    } finally {
      setLoadingTier(null);
    }
  };

  const isPro = user?.plan_tier === "pro" || user?.plan_tier === "annual_pro";
  const planName = user?.plan_tier === "annual_pro" ? "Annual Pro Plan" 
                 : user?.plan_tier === "pro" ? "Pro Plan" 
                 : "Free Plan";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Billing & Subscription</h3>
        <p className="text-sm text-muted-foreground">
          Manage your subscription plan, billing cycle, and payment methods.
        </p>
      </div>
      <Separator />

      {/* Current Plan Overview */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium">Current Plan</h4>
        <Card className="bg-slate-50/50">
          <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg">{planName}</span>
                {isPro && <span className="bg-emerald-100 text-emerald-800 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full">Active</span>}
              </div>
              {isPro ? (
                <p className="text-sm text-slate-500">Your next billing date is <span className="font-medium text-slate-700">Oct 1, 2026</span></p>
              ) : (
                <p className="text-sm text-slate-500">You are on the free tier.</p>
              )}
            </div>
            
            <div className="flex flex-col gap-2 min-w-[140px]">
              {isPro ? (
                <Button variant="outline" className="w-full">Manage Billing</Button>
              ) : (
                <Button className="w-full" onClick={() => document.getElementById('pricing-plans')?.scrollIntoView({ behavior: 'smooth' })}>Upgrade Plan</Button>
              )}
            </div>
          </CardContent>
        </Card>

        {isPro && (
          <Card className="bg-slate-50/50">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-slate-200 rounded-md flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Payment Method</p>
                  <p className="text-xs text-slate-500">Visa ending in 4242</p>
                </div>
              </div>
              <Button variant="ghost" size="sm">Update</Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Separator className="my-8" />

      {/* Upgrade / Pricing Plans */}
      <div id="pricing-plans" className="space-y-4">
        <h4 className="text-sm font-medium">Available Plans</h4>
        <div className="grid md:grid-cols-2 gap-6 pt-2">
          
          {/* Pro Monthly Tier */}
          <Card className={`flex flex-col border-blue-200 relative transition-all duration-300 hover:shadow-xl ${user?.plan_tier === "pro" ? "ring-2 ring-blue-600 shadow-lg" : "shadow-sm bg-card"}`}>
            <CardHeader>
              <CardTitle className="text-blue-700 flex justify-between items-center">
                Pro Monthly
                {user?.plan_tier !== "pro" && user?.plan_tier !== "annual_pro" && (
                  <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest shadow-sm flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Popular
                  </span>
                )}
              </CardTitle>
              <div className="flex items-baseline mt-4 mb-2">
                <span className="text-4xl font-extrabold text-foreground">$12</span>
                <span className="text-muted-foreground ml-1 font-medium">/ month</span>
              </div>
              <CardDescription className="text-sm h-10">For active job seekers who want every advantage.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex-1 mt-4">
              <div className="flex items-start gap-3">
                <div className="bg-blue-100 dark:bg-blue-900 p-0.5 rounded-full shrink-0">
                  <Check className="h-4 w-4 text-blue-700 dark:text-blue-300" />
                </div>
                <span className="text-sm font-semibold text-foreground">Unlimited tailored resumes</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-blue-100 dark:bg-blue-900 p-0.5 rounded-full shrink-0">
                  <Check className="h-4 w-4 text-blue-700 dark:text-blue-300" />
                </div>
                <span className="text-sm font-medium text-foreground">AI cover letters</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-blue-100 dark:bg-blue-900 p-0.5 rounded-full shrink-0">
                  <Check className="h-4 w-4 text-blue-700 dark:text-blue-300" />
                </div>
                <span className="text-sm font-semibold text-foreground">Predict interview questions</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-blue-100 dark:bg-blue-900 p-0.5 rounded-full shrink-0">
                  <Check className="h-4 w-4 text-blue-700 dark:text-blue-300" />
                </div>
                <span className="text-sm font-semibold text-foreground">ATS compatibility check</span>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className={`w-full font-semibold transition-all ${user?.plan_tier !== "pro" ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md hover:shadow-lg" : ""}`}
                variant={user?.plan_tier === "pro" ? "outline" : "default"}
                disabled={user?.plan_tier === "pro" || loadingTier !== null}
                onClick={() => handleSubscribe("pro")}
              >
                {loadingTier === "pro" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {user?.plan_tier === "pro" ? "Current Plan" : "Upgrade to Pro"}
              </Button>
            </CardFooter>
          </Card>

          {/* Annual Pro Tier */}
          <Card className={`flex flex-col transition-all duration-300 hover:shadow-lg ${user?.plan_tier === "annual_pro" ? "ring-2 ring-emerald-500 shadow-md border-emerald-200" : "border-border"}`}>
            <CardHeader>
              <CardTitle className="text-emerald-700 flex justify-between items-center">
                Pro Annual
                <TrendingUp className="h-5 w-5 opacity-70" />
              </CardTitle>
              <div className="flex items-baseline mt-4 mb-2">
                <span className="text-4xl font-extrabold text-foreground">$89</span>
                <span className="text-muted-foreground ml-1 font-medium">/ year</span>
              </div>
              <CardDescription className="text-sm h-10">
                <span className="inline-block bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded mb-1">
                  SAVE ~38%
                </span>
                <br/>
                Best value for long-term career growth.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex-1 mt-4">
              <div className="flex items-start gap-3">
                <div className="bg-emerald-100 dark:bg-emerald-900 p-0.5 rounded-full shrink-0">
                  <Check className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                </div>
                <span className="text-sm font-semibold text-foreground">All Pro features included</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-emerald-100 dark:bg-emerald-900 p-0.5 rounded-full shrink-0">
                  <Check className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                </div>
                <span className="text-sm font-medium text-foreground">One-time payment</span>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className={`w-full font-semibold transition-all ${user?.plan_tier !== "annual_pro" ? "bg-primary hover:bg-primary/90 text-primary-foreground" : ""}`}
                variant={user?.plan_tier === "annual_pro" ? "outline" : "default"}
                disabled={user?.plan_tier === "annual_pro" || loadingTier !== null}
                onClick={() => handleSubscribe("annual_pro")}
              >
                {loadingTier === "annual_pro" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {user?.plan_tier === "annual_pro" ? "Current Plan" : "Get Annual Plan"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
