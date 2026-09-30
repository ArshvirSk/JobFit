"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ResumeStep } from "@/components/onboarding/ResumeStep";
import { LinkedInStep } from "@/components/onboarding/LinkedInStep";
import { ConnectorsStep } from "@/components/onboarding/ConnectorsStep";
import { PreferencesStep } from "@/components/onboarding/PreferencesStep";
import { SummaryStep } from "@/components/onboarding/SummaryStep";
import { UserPreferences, completeOnboarding } from "@/lib/onboarding-api";

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isExisting = searchParams.get("existing") === "true";
  const skipResume = searchParams.get("skip_resume") === "true";

  const [currentStep, setCurrentStep] = useState(1);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [preferences, setPreferences] = useState<UserPreferences>({});
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (skipResume && !resumeId) {
      setCurrentStep(2);
      setResumeId("existing");
    }
  }, [skipResume, resumeId]);

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 5));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      await completeOnboarding(preferences, linkedinUrl);
      router.push("/");
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
      alert("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          {isExisting ? "Welcome back!" : "Welcome to JobFit"}
        </h1>
        <p className="mt-2 text-slate-600">
          {isExisting 
            ? "Let's enhance your profile for even more personalized tracking and job fit scoring."
            : "Let's set up your profile for personalized job tracking and fit scoring."}
        </p>
        
        {/* Progress Bar */}
        <div className="mt-6 flex items-center justify-between">
          {[1, 2, 3, 4, 5].map((step) => (
            <div key={step} className="flex-1 flex items-center">
              <div className={`h-2 w-full rounded ${currentStep >= step ? 'bg-blue-600' : 'bg-slate-200'} mx-1`}></div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-sm text-slate-500 font-medium text-right">Step {currentStep} of 5</div>
      </div>

      <div className="bg-white p-6 md:p-8 rounded-xl shadow-sm border border-slate-200 min-h-[400px]">
        {currentStep === 1 && (
          <ResumeStep 
            onNext={nextStep} 
            resumeId={resumeId} 
            setResumeId={setResumeId} 
          />
        )}
        
        {currentStep === 2 && (
          <LinkedInStep 
            onNext={nextStep} 
            onBack={prevStep} 
            linkedinUrl={linkedinUrl} 
            setLinkedinUrl={setLinkedinUrl} 
          />
        )}
        
        {currentStep === 3 && (
          <ConnectorsStep 
            onNext={nextStep} 
            onBack={prevStep} 
          />
        )}
        
        {currentStep === 4 && (
          <PreferencesStep 
            onNext={nextStep} 
            onBack={prevStep} 
            preferences={preferences} 
            setPreferences={setPreferences} 
          />
        )}
        
        {currentStep === 5 && (
          <SummaryStep 
            onBack={prevStep} 
            onComplete={handleComplete} 
            isSubmitting={isSubmitting}
            hasResume={!!resumeId}
            linkedinUrl={linkedinUrl}
            preferences={preferences}
          />
        )}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500">Loading setup...</div>}>
      <OnboardingContent />
    </Suspense>
  );
}
