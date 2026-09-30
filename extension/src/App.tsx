import { useState, useEffect } from 'react';
import { CompanyPanel } from '@/components/chat/company-panel';
import { setExtensionAuthToken, api } from '@/lib/api';
import { Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function App() {
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [context, setContext] = useState<any>(null);
  
  const [fitScore, setFitScore] = useState<any>(null);
  const [fitLoading, setFitLoading] = useState(false);

  useEffect(() => {
    async function loadAuth() {
      try {
        const data = await chrome.storage.local.get('jobfit_auth_token');
        if (data.jobfit_auth_token) {
          setExtensionAuthToken(data.jobfit_auth_token);
          setSessionLoaded(true);
          return;
        }
        setAuthError("Not logged in. Please log into JobFit first.");
      } catch (err) {
        console.error("Auth load error:", err);
        setAuthError("Failed to load auth session.");
      }
    }
    loadAuth();

    const storageListener = (changes: any, area: string) => {
      if (area === 'local' && changes.jobfit_auth_token?.newValue) {
        setExtensionAuthToken(changes.jobfit_auth_token.newValue);
        setSessionLoaded(true);
        setAuthError(null);
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
    return () => chrome.storage.onChanged.removeListener(storageListener);
  }, []);

  useEffect(() => {
    // 1. Get current active context if any
    chrome.runtime.sendMessage({ type: 'GET_ACTIVE_CONTEXT' }, (response) => {
      if (response && response.type) {
        setContext(response);
        if (response.type === 'job') {
          fetchFitScore(response);
        }
      }
    });

    // 2. Listen for new context updates
    const listener = (message: any) => {
      if (message.type === 'CONTEXT_DETECTED') {
        setContext(message.payload);
        if (message.payload.type === 'job') {
          fetchFitScore(message.payload);
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const fetchFitScore = async (jobContext: any) => {
    setFitLoading(true);
    setFitScore(null);
    try {
      // 1. Get base resume
      const resumesRes = await api.getResumes();
      if (!resumesRes.data || resumesRes.data.length === 0) {
        setFitLoading(false);
        return;
      }
      const resume = resumesRes.data[0];
      
      // 2. Score fit
      const res = await api.scoreFit(resume.id, jobContext.text, { company: jobContext.company, role: jobContext.title });
      setFitScore(res.data);
    } catch (e) {
      console.error("Fit score failed:", e);
    } finally {
      setFitLoading(false);
    }
  };

  if (authError) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background p-6 text-center">
        <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2 text-foreground">Authentication Required</h2>
        <p className="text-muted-foreground mb-6 text-xs break-all">{authError}</p>
        <Button onClick={() => window.open("http://localhost:3000/login", "_blank")}>
          Open JobFit
        </Button>
      </div>
    );
  }

  if (!sessionLoaded) {
    return (
      <div className="p-6 h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!context) {
    return (
      <div className="p-6 h-full flex-1 w-full flex flex-col items-center justify-center text-center bg-background overflow-hidden">
        <Sparkles className="w-12 h-12 text-blue-400 mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">JobFit Sidebar Ready</h2>
        <p className="text-sm text-muted-foreground">
          Navigate to a job posting on LinkedIn or Indeed, or a company page, to see insights and fit scores here.
        </p>
      </div>
    );
  }

  const slug = context.company.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {context.type === 'job' && (
          <Card className="border-blue-100 shadow-sm bg-white">
            <CardContent className="p-4">
              <h3 className="font-semibold text-slate-800 mb-1">{context.title}</h3>
              <p className="text-sm text-slate-500 mb-4">Fit Score Analysis</p>
              
              {fitLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : fitScore ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-blue-700">{fitScore.fit_score}/100</span>
                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">
                      {fitScore.fit_label || 'Good Fit'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{fitScore.analysis}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Failed to load fit score.</p>
              )}
            </CardContent>
          </Card>
        )}

        <CompanyPanel 
          slug={slug}
          onClose={() => setContext(null)}
          onTailorJob={(url, missing, extra) => {
            const encodedUrl = encodeURIComponent(url);
            window.open(`http://localhost:3000/tailor?url=${encodedUrl}`, '_blank');
          }}
          onOpenProfile={() => {
            window.open(`http://localhost:3000/companies`, '_blank');
          }}
        />
      </div>
    </div>
  );
}
