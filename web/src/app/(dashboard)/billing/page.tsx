"use client";

import { useState } from "react";
import { Check, Zap, Shield, Loader2, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";

export default function BillingPage() {
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

  return (
    <div className="max-w-6xl mx-auto py-12 px-4">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-muted-foreground">
          Upgrade your Job Search
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Get the tools you need to stand out from the crowd. Tailor unlimited resumes, predict interview questions, and land your dream job faster.
        </p>
      </div>

      {isPro && (
        <Card className="mb-10 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-sm mx-auto max-w-4xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-blue-700 flex items-center justify-center gap-2 text-xl">
              <Zap className="h-6 w-6 fill-blue-600 text-blue-600" />
              You're currently on a Pro plan
            </CardTitle>
            <CardDescription className="text-center text-blue-600/80 font-medium">
              You have access to all premium features.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        {/* Free Tier */}
        <Card className={`flex flex-col transition-all duration-300 hover:shadow-md ${user?.plan_tier === "free" ? "border-border ring-2 ring-muted" : "border-border"}`}>
          <CardHeader>
            <CardTitle className="text-muted-foreground">Free</CardTitle>
            <div className="flex items-baseline mt-4 mb-2">
              <span className="text-4xl font-extrabold text-foreground">$0</span>
              <span className="text-muted-foreground ml-1 font-medium">/ month</span>
            </div>
            <CardDescription className="text-sm h-10">Perfect for exploring the platform and occasional applications.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-1 mt-4">
            <div className="flex items-start gap-3">
              <Check className="h-5 w-5 text-blue-600 shrink-0" />
              <span className="text-sm font-medium text-foreground">3 tailored resumes / month</span>
            </div>
            <div className="flex items-start gap-3">
              <Check className="h-5 w-5 text-blue-600 shrink-0" />
              <span className="text-sm font-medium text-foreground">AI cover letters</span>
            </div>
            <div className="flex items-start gap-3 text-muted-foreground opacity-60">
              <Shield className="h-5 w-5 shrink-0" />
              <span className="text-sm line-through">Predict interview questions</span>
            </div>
            <div className="flex items-start gap-3 text-muted-foreground opacity-60">
              <Shield className="h-5 w-5 shrink-0" />
              <span className="text-sm line-through">ATS compatibility check</span>
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full text-muted-foreground border-border" disabled>
              {user?.plan_tier === "free" ? "Current Plan" : "Downgrade"}
            </Button>
          </CardFooter>
        </Card>

        {/* Pro Monthly Tier */}
        <Card className={`flex flex-col border-blue-200 relative transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${user?.plan_tier === "pro" ? "ring-2 ring-blue-600 shadow-lg" : "shadow-md bg-card"}`}>
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
        <Card className={`flex flex-col transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${user?.plan_tier === "annual_pro" ? "ring-2 ring-emerald-500 shadow-md border-emerald-200" : "border-border"}`}>
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
  );
}
