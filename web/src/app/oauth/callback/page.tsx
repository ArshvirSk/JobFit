"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { completeOAuthFlow } from "@/lib/onboarding-api";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function OAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const hasAttempted = useRef(false);

  useEffect(() => {
    if (hasAttempted.current) return;
    hasAttempted.current = true;

    const handleCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");
      
      if (error) {
        setStatus("error");
        setErrorMessage("You cancelled the connection or an error occurred with the provider.");
        setTimeout(() => router.push("/settings/connectors"), 3000);
        return;
      }

      if (!code || !state) {
        setStatus("error");
        setErrorMessage("Missing authorization code or state.");
        setTimeout(() => router.push("/settings/connectors"), 3000);
        return;
      }

      const provider = localStorage.getItem("oauth_provider");
      if (!provider) {
        setStatus("error");
        setErrorMessage("Lost track of which provider you were connecting.");
        setTimeout(() => router.push("/settings/connectors"), 3000);
        return;
      }

      try {
        await completeOAuthFlow(provider, code, state);
        setStatus("success");
        // Clear the provider from local storage
        localStorage.removeItem("oauth_provider");
        // Redirect back to settings after a short delay
        setTimeout(() => router.push("/settings/connectors"), 2000);
      } catch (err: any) {
        setStatus("error");
        setErrorMessage(err.message || "Failed to complete connection.");
        setTimeout(() => router.push("/settings/connectors"), 3000);
      }
    };

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="max-w-md w-full mx-auto p-8 bg-white rounded-xl shadow-sm border border-slate-200 text-center">
        {status === "loading" && (
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
            <h2 className="text-xl font-semibold text-slate-900">Connecting account...</h2>
            <p className="text-sm text-slate-500">Please wait while we securely connect your account.</p>
          </div>
        )}
        
        {status === "success" && (
          <div className="flex flex-col items-center space-y-4">
            <CheckCircle className="h-12 w-12 text-emerald-500" />
            <h2 className="text-xl font-semibold text-slate-900">Successfully Connected!</h2>
            <p className="text-sm text-slate-500">Redirecting you back...</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center space-y-4">
            <XCircle className="h-12 w-12 text-red-500" />
            <h2 className="text-xl font-semibold text-slate-900">Connection Failed</h2>
            <p className="text-sm text-slate-500">{errorMessage}</p>
            <p className="text-xs text-slate-400">Redirecting you back...</p>
          </div>
        )}
      </div>
    </div>
  );
}
