import { Button } from "@/components/ui/button";
import { UserPreferences } from "@/lib/onboarding-api";

export function SummaryStep({ 
  onBack, 
  onComplete,
  isSubmitting,
  hasResume,
  linkedinUrl,
  preferences
}: { 
  onBack: () => void, 
  onComplete: () => void,
  isSubmitting: boolean,
  hasResume: boolean,
  linkedinUrl: string,
  preferences: UserPreferences
}) {
  return (
    <div className="flex flex-col h-full justify-between">
      <div>
        <h2 className="text-2xl font-semibold text-slate-800 mb-4">5. Review your profile</h2>
        <p className="text-slate-600 mb-6">
          Everything looks good! You can always update these settings later from your account dashboard.
        </p>

        <div className="space-y-6">
          {/* Core Profile */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-3">Profile Data</h3>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center">
                <span className="w-32 text-sm text-slate-500">Resume</span>
                <span className="text-sm font-medium text-slate-900 flex items-center">
                  {hasResume ? (
                    <><span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span> Uploaded</>
                  ) : (
                    <><span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span> Missing</>
                  )}
                </span>
              </div>
              <div className="flex items-center">
                <span className="w-32 text-sm text-slate-500">LinkedIn</span>
                <span className="text-sm font-medium text-slate-900 truncate">
                  {linkedinUrl || "Not provided"}
                </span>
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-3">Job Preferences</h3>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 grid grid-cols-2 gap-4">
              <div>
                <span className="block text-xs text-slate-500 mb-1">Target Roles</span>
                <span className="text-sm font-medium text-slate-900">{preferences.target_roles?.join(', ') || "Any"}</span>
              </div>
              <div>
                <span className="block text-xs text-slate-500 mb-1">Seniority</span>
                <span className="text-sm font-medium text-slate-900 capitalize">{preferences.seniority || "Any"}</span>
              </div>
              <div>
                <span className="block text-xs text-slate-500 mb-1">Locations</span>
                <span className="text-sm font-medium text-slate-900">{preferences.locations?.join(', ') || "Any"}</span>
              </div>
              <div>
                <span className="block text-xs text-slate-500 mb-1">Work Mode</span>
                <span className="text-sm font-medium text-slate-900 capitalize">{preferences.work_mode || "Any"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 flex justify-between">
        <Button onClick={onBack} variant="outline" disabled={isSubmitting}>Back</Button>
        <Button onClick={onComplete} className="px-8 bg-blue-600 hover:bg-blue-700" disabled={isSubmitting || !hasResume}>
          {isSubmitting ? "Saving..." : "Complete Setup"}
        </Button>
      </div>
    </div>
  );
}
