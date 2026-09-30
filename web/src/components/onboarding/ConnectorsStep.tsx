import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { startOAuthFlow, getConnectors, UserConnector } from "@/lib/onboarding-api";

export function ConnectorsStep({ 
  onNext, 
  onBack 
}: { 
  onNext: () => void, 
  onBack: () => void 
}) {
  const [connectors, setConnectors] = useState<UserConnector[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // In a real implementation, we would fetch existing connectors to show their status
    getConnectors().then((data) => {
      setConnectors(data || []);
      setIsLoading(false);
    }).catch(() => {
      setIsLoading(false);
    });
  }, []);

  const handleConnect = async (provider: string) => {
    try {
      await startOAuthFlow(provider);
      // In a real flow, the window would redirect away and return to a callback URL.
      // For this step simulation, we might poll or wait.
    } catch (error) {
      console.error(`Failed to connect ${provider}:`, error);
    }
  };

  const isConnected = (provider: string) => connectors.some(c => c.provider === provider && c.status === "active");

  return (
    <div className="flex flex-col h-full justify-between">
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold text-slate-800">3. Connect your apps</h2>
          <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-1 rounded">Optional</span>
        </div>
        <p className="text-slate-600 mb-6">
          Opt-in to securely connect your apps. We request only the minimum access needed for specific features, and you can revoke access at any time.
        </p>

        <div className="space-y-4">
          {/* Gmail */}
          <div className="border border-slate-200 rounded-lg p-4 flex items-start justify-between bg-white">
            <div className="flex-1 pr-4">
              <h3 className="font-medium text-slate-900 flex items-center">
                Gmail
                <span className="ml-2 text-xs font-normal text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Read-only emails</span>
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Detects application confirmation, rejection, and interview invite emails to auto-populate your Job Tracker.
              </p>
            </div>
            <div>
              {isConnected("gmail") ? (
                <Button variant="outline" className="text-green-600 border-green-200 bg-green-50" disabled>Connected</Button>
              ) : (
                <Button variant="outline" onClick={() => handleConnect("gmail")}>Connect</Button>
              )}
            </div>
          </div>

          {/* Calendar */}
          <div className="border border-slate-200 rounded-lg p-4 flex items-start justify-between bg-white">
            <div className="flex-1 pr-4">
              <h3 className="font-medium text-slate-900 flex items-center">
                Google Calendar
                <span className="ml-2 text-xs font-normal text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Read-only events</span>
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Detects scheduled interviews to power automated interview preparation and reminders.
              </p>
            </div>
            <div>
              {isConnected("calendar") ? (
                <Button variant="outline" className="text-green-600 border-green-200 bg-green-50" disabled>Connected</Button>
              ) : (
                <Button variant="outline" onClick={() => handleConnect("calendar")}>Connect</Button>
              )}
            </div>
          </div>

          {/* Outlook */}
          <div className="border border-slate-200 rounded-lg p-4 flex items-start justify-between bg-white">
            <div className="flex-1 pr-4">
              <h3 className="font-medium text-slate-900 flex items-center">
                Microsoft Outlook
                <span className="ml-2 text-xs font-normal text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Read-only mail/events</span>
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                For Microsoft users: detects application statuses and upcoming interviews to power your tracker and prep.
              </p>
            </div>
            <div>
              {isConnected("outlook") ? (
                <Button variant="outline" className="text-green-600 border-green-200 bg-green-50" disabled>Connected</Button>
              ) : (
                <Button variant="outline" onClick={() => handleConnect("outlook")}>Connect</Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 flex justify-between">
        <Button onClick={onBack} variant="outline">Back</Button>
        <div className="space-x-3">
          <Button onClick={onNext} className="px-8">Continue</Button>
        </div>
      </div>
    </div>
  );
}
