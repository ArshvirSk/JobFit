"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getConnectors, revokeConnector, startOAuthFlow, uploadLinkedInData, UserConnector } from "@/lib/onboarding-api";
import { AlertCircle, Link as LinkIcon, Plus, Loader2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FaGithub, FaLinkedin, FaMicrosoft, FaGoogle } from "react-icons/fa";

const AVAILABLE_PROVIDERS = [
  { id: "google", name: "Google", description: "Sync Gmail threads and Calendar schedules", icon: FaGoogle, color: "text-red-500 bg-red-50 border-red-100" },
  { id: "outlook", name: "Microsoft Outlook", description: "Sync email & calendar", icon: FaMicrosoft, color: "text-sky-600 bg-sky-50 border-sky-100" },
  { id: "github", name: "GitHub", description: "Sync top repositories and coding activity", icon: FaGithub, color: "text-slate-800 bg-slate-100 border-slate-200" },
  { id: "linkedin", name: "LinkedIn", description: "Upload your LinkedIn data export (.zip)", icon: FaLinkedin, color: "text-blue-700 bg-blue-50 border-blue-200" }
];

export default function ConnectorsSettings() {
  const [connectors, setConnectors] = useState<UserConnector[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchConnectors();
  }, []);

  const fetchConnectors = async () => {
    try {
      setIsLoading(true);
      const data = await getConnectors();
      setConnectors(data || []);
    } catch (err) {
      setError("Failed to load connectors");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async (provider: string) => {
    if (!confirm(`Are you sure you want to revoke access to ${provider}? Some features may stop working.`)) return;
    
    try {
      await revokeConnector(provider);
      await fetchConnectors(); // Refresh the list
    } catch (err) {
      alert("Failed to revoke connector. Please try again.");
    }
  };

  const handleConnect = async (provider: string) => {
    if (provider === "linkedin") {
      fileInputRef.current?.click();
      return;
    }
    
    try {
      setConnecting(provider);
      await startOAuthFlow(provider);
      // It will redirect out, so we don't clear loading state here unless it fails
    } catch (err) {
      alert("Failed to start connection flow. Please try again.");
      setConnecting(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".zip")) {
      alert("Please upload a valid .zip file.");
      return;
    }

    try {
      setConnecting("linkedin");
      await uploadLinkedInData(file);
      await fetchConnectors(); // Refresh the list
    } catch (err: any) {
      alert(err.message || "Failed to upload LinkedIn data. Please try again.");
    } finally {
      setConnecting(null);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const getProviderInfo = (provider: string) => {
    return AVAILABLE_PROVIDERS.find(p => p.id === provider);
  };

  const connectedProviderIds = connectors.map(c => c.provider);
  const unconnectedProviders = AVAILABLE_PROVIDERS.filter(p => !connectedProviderIds.includes(p.id));

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-medium">Connected Accounts</h3>
        <p className="text-sm text-muted-foreground">
          Manage the third-party accounts connected to JobFit. Revoking access will invalidate our security tokens.
        </p>
      </div>
      <Separator />

      {isLoading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-md"></div>)}
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-600 rounded-md flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Active Connections */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-slate-900">Your Connections</h4>
            {connectors.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-slate-300 rounded-lg bg-slate-50">
                <p className="text-sm text-slate-500">
                  No accounts connected yet.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {connectors.map(connector => {
                  const providerInfo = getProviderInfo(connector.provider);
                  const Icon = providerInfo?.icon || LinkIcon;
                  return (
                    <div key={connector.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-slate-200 rounded-lg bg-white shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-md border ${providerInfo?.color || 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-medium text-slate-900 capitalize">{providerInfo?.name || connector.provider}</h3>
                          <div className="mt-1 space-y-1">
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                              <span className="font-medium">Status:</span> 
                              <span className={connector.status === 'expired' ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}>
                                {connector.provider === 'linkedin' ? 'Snapshot' : (connector.status === 'expired' ? 'Expired' : 'Active')}
                              </span>
                              {connector.connected_at && ` • ${connector.provider === 'linkedin' ? 'Last updated' : 'Connected'} ${new Date(connector.connected_at).toLocaleDateString()}`}
                              {connector.last_synced_at && connector.provider !== 'linkedin' && ` • Synced ${new Date(connector.last_synced_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 sm:mt-0 flex items-center gap-3">
                        {(connector.status === 'expired' || connector.provider === 'linkedin') && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleConnect(connector.provider)}
                          >
                            {connector.provider === 'linkedin' ? 'Re-upload' : 'Reconnect'}
                          </Button>
                        )}
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => handleRevoke(connector.provider)}
                        >
                          {connector.provider === 'linkedin' ? 'Remove data' : 'Revoke Access'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Available Connections */}
          {unconnectedProviders.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-slate-900 mb-4">Available to Connect</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {unconnectedProviders.map((provider) => {
                  const Icon = provider.icon || Plus;
                  return (
                    <Dialog key={provider.id}>
                      <DialogTrigger className="flex flex-col items-center justify-center p-4 border border-slate-200 rounded-xl hover:border-emerald-300 hover:shadow-md transition-all bg-white group relative aspect-square">
                          <div className="absolute top-2 right-2 p-1 bg-slate-50 text-slate-400 rounded-md group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                            <Plus className="w-3.5 h-3.5" />
                          </div>
                          <div className={`p-3 rounded-xl border mb-3 transition-transform group-hover:scale-110 ${provider.color || 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                            <Icon className="w-8 h-8" />
                          </div>
                          <span className="text-xs font-medium text-slate-700 text-center leading-tight px-1">
                            {provider.name}
                          </span>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`p-2 rounded-lg border ${provider.color || 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                              <Icon className="w-6 h-6" />
                            </div>
                            <DialogTitle>Connect {provider.name}</DialogTitle>
                          </div>
                          <DialogDescription>{provider.description}</DialogDescription>
                        </DialogHeader>

                        {provider.id === "linkedin" && (
                          <div className="mt-2 p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 space-y-3">
                            <p className="font-medium text-slate-900">How to get your data:</p>
                            <ol className="list-decimal pl-5 space-y-1">
                              <li>
                                Go to the{" "}
                                <a 
                                  href="https://www.linkedin.com/mypreferences/d/download-my-data" 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline font-medium"
                                >
                                  LinkedIn Data Export page
                                </a>
                              </li>
                              <li>Select "The works" or Profile, Skills, Positions, Education</li>
                              <li>Request archive (can take up to 24 hours)</li>
                              <li>Download the .zip and upload it here</li>
                            </ol>
                          </div>
                        )}

                        <DialogFooter className="mt-4 sm:justify-start">
                          <Button 
                            onClick={() => handleConnect(provider.id)}
                            disabled={connecting !== null}
                            className="w-full sm:w-auto"
                          >
                            {connecting === provider.id ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : provider.id === "linkedin" ? (
                              <Upload className="h-4 w-4 mr-2" />
                            ) : null}
                            {provider.id === "linkedin" ? "Upload Zip" : "Connect Account"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      <input 
        type="file" 
        accept=".zip" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        className="hidden" 
      />
    </div>
  );
}
