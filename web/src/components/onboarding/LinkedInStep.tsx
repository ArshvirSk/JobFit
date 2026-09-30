import { Button } from "@/components/ui/button";

export function LinkedInStep({ 
  onNext, 
  onBack,
  linkedinUrl,
  setLinkedinUrl
}: { 
  onNext: () => void, 
  onBack: () => void,
  linkedinUrl: string,
  setLinkedinUrl: (url: string) => void
}) {
  return (
    <div className="flex flex-col h-full justify-between">
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold text-slate-800">2. Link your LinkedIn profile</h2>
          <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-1 rounded">Optional</span>
        </div>
        
        <p className="text-slate-600 mb-6">
          Adding your LinkedIn profile provides richer background context like skills and endorsements that a resume alone might miss.
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="linkedin" className="block text-sm font-medium text-slate-700 mb-1">LinkedIn Profile URL</label>
            <input
              type="url"
              id="linkedin"
              placeholder="https://linkedin.com/in/username"
              className="w-full border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 border p-2"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="mt-10 flex justify-between">
        <Button onClick={onBack} variant="outline">Back</Button>
        <div className="space-x-3">
          {!linkedinUrl && <Button onClick={onNext} variant="ghost" className="text-slate-500 hover:text-slate-700">Skip for now</Button>}
          <Button onClick={onNext} className="px-8">
            {linkedinUrl ? "Continue" : "Next Step"}
          </Button>
        </div>
      </div>
    </div>
  );
}
