import { Button } from "@/components/ui/button";
import { UserPreferences } from "@/lib/onboarding-api";

export function PreferencesStep({ 
  onNext, 
  onBack,
  preferences,
  setPreferences
}: { 
  onNext: () => void, 
  onBack: () => void,
  preferences: UserPreferences,
  setPreferences: React.Dispatch<React.SetStateAction<UserPreferences>>
}) {
  const handleArrayChange = (field: keyof UserPreferences, value: string) => {
    const arr = (preferences[field] as string[]) || [];
    const values = value.split(',').map(s => s.trim()).filter(Boolean);
    setPreferences({ ...preferences, [field]: values });
  };

  return (
    <div className="flex flex-col h-full justify-between">
      <div>
        <h2 className="text-2xl font-semibold text-slate-800 mb-4">4. Set your preferences</h2>
        <p className="text-slate-600 mb-6">
          Tell us what you're looking for. This sets your defaults for job fit-scoring and future alerting.
        </p>

        <div className="space-y-5">
          <div>
            <label htmlFor="roles" className="block text-sm font-medium text-slate-700 mb-1">Target Roles (comma separated)</label>
            <input
              type="text"
              id="roles"
              placeholder="e.g. Frontend Engineer, Fullstack Developer"
              className="w-full border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 border p-2"
              defaultValue={(preferences.target_roles || []).join(', ')}
              onChange={(e) => handleArrayChange('target_roles', e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="seniority" className="block text-sm font-medium text-slate-700 mb-1">Seniority Level</label>
            <select
              id="seniority"
              className="w-full border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 border p-2"
              value={preferences.seniority || ""}
              onChange={(e) => setPreferences({ ...preferences, seniority: e.target.value })}
            >
              <option value="">Select level...</option>
              <option value="entry">Entry Level</option>
              <option value="mid">Mid Level</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead / Staff</option>
              <option value="manager">Manager / Director</option>
            </select>
          </div>

          <div>
            <label htmlFor="work_mode" className="block text-sm font-medium text-slate-700 mb-1">Preferred Work Mode</label>
            <select
              id="work_mode"
              className="w-full border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 border p-2"
              value={preferences.work_mode || ""}
              onChange={(e) => setPreferences({ ...preferences, work_mode: e.target.value })}
            >
              <option value="">Any</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </select>
          </div>

          <div>
            <label htmlFor="locations" className="block text-sm font-medium text-slate-700 mb-1">Target Locations (comma separated)</label>
            <input
              type="text"
              id="locations"
              placeholder="e.g. San Francisco, New York, London"
              className="w-full border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 border p-2"
              defaultValue={(preferences.locations || []).join(', ')}
              onChange={(e) => handleArrayChange('locations', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="mt-10 flex justify-between">
        <Button onClick={onBack} variant="outline">Back</Button>
        <Button onClick={onNext} className="px-8">Continue</Button>
      </div>
    </div>
  );
}
