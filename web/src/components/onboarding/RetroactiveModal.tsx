"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RetroactiveModal({ 
  isOpen, 
  onClose,
  hasResume
}: { 
  isOpen: boolean,
  onClose: () => void,
  hasResume: boolean
}) {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted || !isOpen) return null;

  const handleStart = () => {
    // If they already have a resume, we might append a query param to skip step 1
    // but the onboarding flow could also just detect it from API if we built it that way.
    // For now, we'll route to onboarding and it will start at step 1 or step 2 based on state.
    router.push(`/onboarding?existing=true${hasResume ? "&skip_resume=true" : ""}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 relative animate-in fade-in zoom-in-95 duration-200">
        
        <div className="mb-6 text-center">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Get more personalized results</h2>
          <p className="mt-2 text-slate-600">
            We've added new ways to tailor JobFit to you. Connect your {hasResume ? "LinkedIn, Calendar," : "Resume, LinkedIn,"} and set preferences to get better job fit scores and automated tracking.
          </p>
        </div>

        <div className="flex flex-col space-y-3 mt-8">
          <Button onClick={handleStart} className="w-full text-md h-12 bg-blue-600 hover:bg-blue-700">
            Enhance my profile
          </Button>
          <Button onClick={onClose} variant="ghost" className="w-full text-slate-500 hover:text-slate-800">
            Maybe later
          </Button>
        </div>
      </div>
    </div>
  );
}
