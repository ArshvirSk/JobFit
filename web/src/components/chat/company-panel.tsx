"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, ExternalLink, Briefcase, Banknote, Building2, TrendingUp, Users, Heart, X, Sparkles, Bell, BellRing, Code, Info, ListChecks, Globe, GraduationCap, Search } from "lucide-react";
import { getAuthHeaders, API_BASE } from "@/lib/chat-api";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Role-based interview prep fallback ──────────────────────────────
// Generic practice questions shown ONLY when company-specific DSA research
// came back empty but the company has open roles. Clearly tagged "role-based"
// so they're never mistaken for company-reported questions.
type PrepQuestion = { title: string; topic: string; difficulty: string };

const ROLE_PREP_LIBRARY: Array<{ match: RegExp; questions: PrepQuestion[] }> = [
  {
    match: /data|etl|database|warehouse|analytics|\bbi\b|ssis|ssas/i,
    questions: [
      { title: "Design an idempotent ETL pipeline that can be safely re-run after a failure", topic: "Data pipelines", difficulty: "medium" },
      { title: "Window functions vs GROUP BY — when do you reach for each?", topic: "SQL", difficulty: "medium" },
      { title: "Explain slowly changing dimensions (SCD Type 2) with a concrete example", topic: "Data modelling", difficulty: "medium" },
      { title: "Star schema vs snowflake schema — what are the trade-offs?", topic: "Data modelling", difficulty: "easy" },
    ],
  },
  {
    match: /full.?stack|front.?end|back.?end|react|node|javascript|typescript|\bweb\b/i,
    questions: [
      { title: "How do the event loop, microtasks and macrotasks interact?", topic: "JavaScript", difficulty: "medium" },
      { title: "Render a table of 10,000 rows smoothly — what do you change?", topic: "Performance", difficulty: "medium" },
      { title: "Design a REST API for the feature you're most proud of", topic: "API design", difficulty: "medium" },
      { title: "How would you prevent XSS and CSRF in a typical web app?", topic: "Security", difficulty: "medium" },
    ],
  },
  {
    match: /mobile|android|ios|flutter|react[\s-]?native/i,
    questions: [
      { title: "Handle process death and configuration changes on Android", topic: "Android", difficulty: "medium" },
      { title: "Design offline-first sync with conflict resolution", topic: "Mobile architecture", difficulty: "medium" },
      { title: "How do you cut jank in a long scrollable list?", topic: "Performance", difficulty: "medium" },
    ],
  },
  {
    match: /architect/i,
    questions: [
      { title: "Design a rate limiter for a public API", topic: "System design", difficulty: "medium" },
      { title: "How would you migrate a monolith to services without downtime?", topic: "System design", difficulty: "hard" },
      { title: "Walk through the C4 model for a system you've built", topic: "Architecture", difficulty: "medium" },
    ],
  },
];

const DEFAULT_PREP_QUESTIONS: PrepQuestion[] = [
  { title: "Tell a concise STAR story about a tough problem you solved", topic: "Behavioral", difficulty: "easy" },
  { title: "Walk through your resume in 2 minutes — what do you emphasize?", topic: "Behavioral", difficulty: "easy" },
  { title: "Reverse a linked list and analyze time/space complexity", topic: "DSA", difficulty: "easy" },
  { title: "Explain a technical trade-off you made in a recent project", topic: "Technical deep-dive", difficulty: "medium" },
];

function prepForRoles(titles: string[]): PrepQuestion[] {
  const pickedEntries: PrepQuestion[][] = [];
  const seen = new Set<string>();
  for (const title of titles) {
    const entry = ROLE_PREP_LIBRARY.find((e) => e.match.test(title));
    if (entry && !pickedEntries.includes(entry.questions)) {
      pickedEntries.push(entry.questions);
    }
  }
  if (pickedEntries.length === 0) pickedEntries.push(DEFAULT_PREP_QUESTIONS);

  // Round-robin across matched roles so each role gets representation, cap at 6.
  const result: PrepQuestion[] = [];
  const maxLen = Math.max(...pickedEntries.map((qs) => qs.length));
  for (let i = 0; i < maxLen && result.length < 6; i++) {
    for (const qs of pickedEntries) {
      const q = qs[i];
      if (q && !seen.has(q.title)) {
        seen.add(q.title);
        result.push(q);
      }
    }
  }
  return result;
}

function RolePrepFallback({ titles }: { titles: string[] }) {
  const questions = prepForRoles(titles);
  const shownRoles = titles.slice(0, 3).join(", ") + (titles.length > 3 ? "…" : "");
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">
        No company-specific questions surfaced for {shownRoles} — prep for these open roles instead:
      </p>
      <div className="space-y-2">
        {questions.map((q, idx) => (
          <div key={idx} className="flex items-start justify-between gap-2 p-2.5 rounded-md border border-border bg-muted/10 hover:bg-muted/30 transition-colors">
            <div className="flex-1 min-w-0">
              <span className="font-medium text-[13px] text-foreground">{q.title}</span>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider",
                  q.difficulty === "easy" ? "text-green-600" :
                  q.difficulty === "medium" ? "text-yellow-600" :
                  "text-red-600"
                )}>
                  {q.difficulty}
                </span>
                <span className="text-muted-foreground text-[10px]">•</span>
                <span className="text-muted-foreground text-[10px]">{q.topic}</span>
              </div>
            </div>
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5 shrink-0 bg-muted text-muted-foreground">role-based</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

interface CompanyPanelProps {
  slug: string;
  onClose: () => void;
  onTailorJob: (url: string, missingRequirements?: string[], extra?: {company: string, role: string, fitLabel?: string}) => void;
  onOpenProfile: (slug: string) => void;
}

export function CompanyPanel({ slug, onClose, onTailorJob, onOpenProfile }: CompanyPanelProps) {
  const router = useRouter();
  const companyName = slug ? slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Company";

  const [data, setData] = useState<any>({
    funding: undefined,
    linkedin: undefined,
    glassdoor: undefined,
    compensation: undefined,
    benefits: undefined,
    competitors: undefined,
    jobs: undefined,
    dsa: undefined,
    extended_links: undefined,
    org_info: undefined,
    interview_process: undefined
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [digestHasData, setDigestHasData] = useState<boolean>(true);
  const [digestLoading, setDigestLoading] = useState(true);
  const [priorApps, setPriorApps] = useState<any[]>([]);
  const [isWatched, setIsWatched] = useState(false);
  const [isTogglingWatch, setIsTogglingWatch] = useState(false);

  const [githubMatch, setGithubMatch] = useState<any[]>([]);
  const [githubLoading, setGithubLoading] = useState(true);
  const [linkedinConnections, setLinkedinConnections] = useState<any[]>([]);
  const [manualContacts, setManualContacts] = useState<any[]>([]);
  const [linkedinLoading, setLinkedinLoading] = useState(true);
  const [fallbackActions, setFallbackActions] = useState<any>(null);
  const [outreachDraft, setOutreachDraft] = useState<string | null>(null);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', title: '', note: '', linkedin_url: '' });
  const [savingContact, setSavingContact] = useState(false);
  
  // Project Ideas state
  const [projectIdeas, setProjectIdeas] = useState<Record<string, any>>({});
  const [generatingIdeas, setGeneratingIdeas] = useState<Record<string, boolean>>({});
  
  const fetchProjectIdea = async (jobHash: string, skillGap: string, jobTitle: string) => {
    const key = `${jobHash}-${skillGap}`;
    if (projectIdeas[key] || generatingIdeas[key]) return;
    setGeneratingIdeas(prev => ({ ...prev, [key]: true }));
    try {
      const res = await api.generateProjectIdea(slug, jobHash, {
        skill_gap: skillGap,
        company_name: companyName,
        job_title: jobTitle
      });
      const idea = await res.json();
      setProjectIdeas(prev => ({ ...prev, [key]: idea }));
    } catch (e) {
      console.error("Failed to generate idea", e);
    } finally {
      setGeneratingIdeas(prev => ({ ...prev, [key]: false }));
    }
  };

  const updateIdeaStatus = async (jobHash: string, ideaId: string, status: string, skillGap: string) => {
    const key = `${jobHash}-${skillGap}`;
    try {
      await api.updateProjectIdeaStatus(slug, jobHash, ideaId, status);
      setProjectIdeas(prev => ({
        ...prev,
        [key]: { ...prev[key], status }
      }));
    } catch (e) {
      console.error("Failed to update status", e);
    }
  };
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchProfile = async () => {
    setIsRefreshing(true);
    
    // Clear data to show skeletons again if refreshing
    setData({
      funding: undefined,
      linkedin: undefined,
      glassdoor: undefined,
      compensation: undefined,
      benefits: undefined,
      competitors: undefined,
      jobs: undefined,
      dsa: undefined
    });
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      console.log(`[CompanyPanel] Starting fetch for ${slug}...`);
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE}/api/company/${slug}/stream`, {
        headers,
        signal: abortControllerRef.current.signal
      });
      
      console.log(`[CompanyPanel] Stream response status: ${response.status}`);
      if (!response.ok) {
        // Only read the body on error — consuming it here would lock the
        // SSE stream and make getReader() below throw.
        const text = await response.text().catch(() => "");
        throw new Error(`HTTP error! status: ${response.status}, text: ${text}`);
      }

      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let buffer = "";
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.substring(6);
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.done) {
                  setLastUpdated(new Date());
                  setIsRefreshing(false);
                  break; 
                }
                if (parsed.category) {
                  console.log(`[CompanyPanel] Received data for ${parsed.category}:`, parsed.data);
                  setData((prev: any) => ({
                    ...prev,
                    [parsed.category]: parsed.data || null // null means no data found
                  }));
                }
              } catch (e) {
                console.error("Error parsing SSE JSON", e, jsonStr);
              }
            }
          }
        }
      }
      setIsRefreshing(false);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error("Fetch error", e);
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    fetchProfile();
    // Fetch digest independently
    const fetchDigest = async () => {
      setDigestLoading(true);
      setDigest(null);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_BASE}/api/company/${slug}/digest`, { headers });
        if (res.ok) {
          const json = await res.json();
          setDigest(json.digest || null);
          setDigestHasData(json.has_data ?? true);
        }
      } catch (e) {
        console.error("Failed to fetch digest", e);
      } finally {
        setDigestLoading(false);
      }
    };
    fetchDigest();

    // Fetch prior applications
    const fetchApps = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_BASE}/api/applications`, { headers });
        if (res.ok) {
          const apps = await res.json();
          // Filter for this company
          const companyApps = apps.filter((a: any) => 
            a.company.toLowerCase().includes(companyName.toLowerCase()) || 
            companyName.toLowerCase().includes(a.company.toLowerCase())
          );
          setPriorApps(companyApps);
        }
      } catch (e) {
        console.error("Failed to fetch applications", e);
      }
    };
    fetchApps();

    const fetchWatchStatus = async () => {
      try {
        const res = await api.getWatchStatus(slug);
        setIsWatched(res.data.is_watched);
      } catch (e) {
        console.error("Failed to fetch watch status", e);
      }
    };
    fetchWatchStatus();

    const fetchMatchData = async () => {
      setGithubLoading(true);
      setLinkedinLoading(true);
      try {
        api.getGithubMatch(slug).then(res => {
          setGithubMatch(res.data.repos || []);
          setGithubLoading(false);
        }).catch(e => {
          console.error("Failed to fetch GitHub match", e.response?.data || e.message || e);
          setGithubLoading(false);
        });

        api.getLinkedinConnections(slug).then(res => {
          setLinkedinConnections(res.data.connections || []);
          if (res.data.fallback_actions) {
            setFallbackActions(res.data.fallback_actions);
          }
          if (res.data.manual_contacts) {
            setManualContacts(res.data.manual_contacts);
          }
          setLinkedinLoading(false);
        }).catch(e => {
          console.error("Failed to fetch LinkedIn connections", e.response?.data || e.message || e);
          setLinkedinLoading(false);
        });
      } catch (e) {
        console.error(e);
      }
    };
    fetchMatchData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [slug, companyName]);

  const toggleWatch = async () => {
    setIsTogglingWatch(true);
    try {
      if (isWatched) {
        await api.unwatchCompany(slug);
        setIsWatched(false);
      } else {
        await api.watchCompany(slug);
        setIsWatched(true);
      }
    } catch (e: any) {
      console.error("Failed to toggle watch status", e);
      alert(e.response?.data?.error || "Failed to toggle watch company");
    } finally {
      setIsTogglingWatch(false);
    }
  };

  const handleGenerateDraft = async () => {
    setGeneratingDraft(true);
    
    // Find best fit role if available
    let bestFitRole = undefined;
    if (data?.jobs?.length > 0) {
      const sortedJobs = [...data.jobs].sort((a, b) => (b.fit_score?.score || 0) - (a.fit_score?.score || 0));
      if (sortedJobs[0].fit_score?.score >= 60) {
        bestFitRole = sortedJobs[0].title;
      }
    }
    
    // Find github match if available
    let githubProject = undefined;
    if (githubMatch && githubMatch.length > 0) {
      githubProject = githubMatch[0].repo_name;
    }
    
    try {
      const res = await api.generateOutreachDraft(slug, bestFitRole, githubProject);
      setOutreachDraft(res.data.draft);
    } catch (e) {
      console.error("Failed to generate outreach draft", e);
    } finally {
      setGeneratingDraft(false);
    }
  };

  const handleAddManualContact = async () => {
    if (!newContact.name) return;
    setSavingContact(true);
    try {
      const res = await api.addManualContact(slug, newContact);
      if (res.data) {
        setManualContacts(prev => [...prev, res.data]);
        setShowAddContact(false);
        setNewContact({ name: '', title: '', note: '', linkedin_url: '' });
      }
    } catch (e) {
      console.error("Failed to add manual contact", e);
    } finally {
      setSavingContact(false);
    }
  };

  const handleDeleteManualContact = async (id: string) => {
    try {
      await api.deleteManualContact(slug, id);
      setManualContacts(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      console.error("Failed to delete manual contact", e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background border-l border-border overflow-hidden shadow-xl animate-in slide-in-from-right-8 duration-300">
      {/* Fixed Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 bg-background">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{companyName}</h2>
          <div className="flex items-center gap-2 mt-1 text-muted-foreground text-xs">
            <span>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : "Fetching live data..."}</span>
            {isRefreshing && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={toggleWatch} 
            disabled={isTogglingWatch}
            className={cn("text-xs gap-1.5 transition-colors", isWatched && "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800")}
          >
            {isWatched ? <BellRing className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
            {isWatched ? "Watching" : "Watch"}
          </Button>
          <Button variant="ghost" size="icon" onClick={fetchProfile} disabled={isRefreshing} title="Refresh Data">
            <TrendingUp className="h-4 w-4" /> {/* Just an icon for refresh or similar */}
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} title="Close Panel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Prior Application Banner */}
        {priorApps.length > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-3">
            <div className="flex items-center gap-2 text-sm text-blue-800 dark:text-blue-300">
              <Briefcase className="h-4 w-4" />
              <span>
                You have {priorApps.length} prior application(s) here. Most recent:{" "}
                <strong>{priorApps[0].role}</strong> ({new Date(priorApps[0].applied_at || priorApps[0].created_at).toLocaleDateString()}) - <em>{priorApps[0].status}</em>.
              </span>
            </div>
          </div>
        )}

        {/* Personalized Digest */}
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
          <div className="flex items-start gap-3">
            <div className="h-7 w-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-1.5">Your Fit Summary</p>
              {digestLoading ? (
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              ) : digest ? (
                <div>
                  <p className="text-sm text-foreground leading-relaxed">{digest}</p>
                  {!digestHasData && (
                    <div className="mt-3">
                      <Button variant="outline" size="sm" onClick={() => router.push('/resumes')} className="text-xs bg-emerald-100/50 hover:bg-emerald-200/50 dark:bg-emerald-900/30 dark:hover:bg-emerald-800/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
                        Upload Resume
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground italic mb-3">Upload a resume to see your personalized fit summary.</p>
                  <Button variant="outline" size="sm" onClick={() => router.push('/resumes')} className="text-xs bg-emerald-100/50 hover:bg-emerald-200/50 dark:bg-emerald-900/30 dark:hover:bg-emerald-800/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
                    Upload Resume
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Company Overview Section */}
        <Card className="shadow-none border border-sky-200/60 dark:border-sky-900/50 bg-sky-50/40 dark:bg-sky-950/20 overflow-hidden rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Info className="h-4 w-4 text-slate-600 dark:text-slate-400" /> Company Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.org_info === undefined ? (
              <div className="space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>
            ) : data.org_info === null ? (
              <p className="text-sm text-muted-foreground italic">No overview data available.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-0.5">Founded</p>
                  <p className="font-medium">{data.org_info.founded_year || "Unknown"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-0.5">Headcount</p>
                  <p className="font-medium">{data.org_info.headcount_range || "Unknown"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-0.5">Headquarters</p>
                  <p className="font-medium">{data.org_info.hq_location || "Unknown"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-0.5">Major Offices</p>
                  <p className="font-medium">{data.org_info.office_locations?.length ? data.org_info.office_locations.join(", ") : "Unknown"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-0.5">Industry</p>
                  <p className="font-medium">{data.org_info.industry_tags?.length ? data.org_info.industry_tags.join(", ") : "Unknown"}</p>
                </div>
                
                {data.org_info.confidence && (
                  <div className="col-span-2 mt-2 pt-2 border-t flex justify-between items-center">
                    <div className="text-xs text-muted-foreground">Source: {data.org_info.source}</div>
                    <Badge variant={data.org_info.confidence === 'high' ? 'outline' : 'secondary'} className="text-[10px] font-normal px-1.5 py-0">
                      {data.org_info.confidence} confidence
                    </Badge>
                  </div>
                )}
                
                <div className="col-span-2 mt-1">
                  <a href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(companyName + " Recruiter")}`} 
                     target="_blank" rel="noopener noreferrer" 
                     className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full text-xs")}>
                    Search LinkedIn for Recruiters <ExternalLink className="ml-1.5 h-3 w-3" />
                  </a>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Funding Section */}
        <Card className="shadow-none border border-emerald-200/60 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 overflow-hidden rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-blue-600" /> Funding & Valuation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.funding === undefined ? (
              <div className="space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>
            ) : data.funding === null ? (
              <p className="text-sm text-muted-foreground italic">No funding data available.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-0.5">Last Round</p>
                  <p className="font-medium">{data.funding.last_round_stage || "Unknown"} {data.funding.last_round_amount ? `(${data.funding.last_round_amount})` : ""}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-0.5">Total Raised</p>
                  <p className="font-medium">{data.funding.total_raised || "Unknown"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-0.5">Valuation</p>
                  <p className="font-medium">{data.funding.valuation || "Unknown"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-0.5">Key Investors</p>
                  <p className="font-medium">{data.funding.key_investors?.join(", ") || "Unknown"}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Compensation Section */}
        <Card className="shadow-none border border-teal-200/60 dark:border-teal-900/50 bg-teal-50/40 dark:bg-teal-950/20 overflow-hidden rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-green-600" /> Compensation
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.compensation === undefined ? (
              <div className="space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>
            ) : data.compensation === null ? (
              <p className="text-sm text-muted-foreground italic">No compensation data found.</p>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="flex gap-6">
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider mb-0.5">Average Package</p>
                    <p className="font-medium text-base">{data.compensation.average_package || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider mb-0.5">Highest Package</p>
                    <p className="font-medium text-base">{data.compensation.highest_package || "N/A"}</p>
                  </div>
                </div>
                
                {data.compensation.by_role && Object.keys(data.compensation.by_role).length > 0 && (
                  <div className="pt-2 border-t mt-3">
                    <p className="text-muted-foreground text-xs uppercase tracking-wider mb-2 mt-2">By Role</p>
                    <div className="grid grid-cols-1 gap-2">
                      {Object.entries(data.compensation.by_role).map(([role, comp], idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm border-b border-border pb-1 last:border-0">
                          <span className="font-medium text-foreground">{role}</span>
                          <span className="text-muted-foreground">{comp as string}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Interview Process Section */}
        <Card className="shadow-none border border-indigo-200/60 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 overflow-hidden rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ListChecks className="h-4 w-4 text-purple-600 dark:text-purple-400" /> Interview Process
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.interview_process === undefined ? (
              <div className="space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>
            ) : data.interview_process === null ? (
              <p className="text-sm text-muted-foreground italic">No interview process data available.</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Typical Rounds</p>
                  <p className="font-medium leading-relaxed">{data.interview_process.typical_rounds_summary || "Not available"}</p>
                </div>
                
                {data.interview_process.careers_page_url && (
                  <div className="pt-2 border-t">
                    <a href={data.interview_process.careers_page_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 w-fit text-xs font-medium">
                      Official Careers Page <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}

                {data.interview_process.confidence && (
                  <div className="mt-2 pt-2 border-t flex justify-between items-center">
                    <div className="text-xs text-muted-foreground">Source: {data.interview_process.source}</div>
                    <Badge variant={data.interview_process.confidence === 'high' ? 'outline' : 'secondary'} className="text-[10px] font-normal px-1.5 py-0">
                      {data.interview_process.confidence} confidence
                    </Badge>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* DSA / Interview Prep Section */}
        <Card className="shadow-none border border-orange-200/60 dark:border-orange-900/50 bg-orange-50/40 dark:bg-orange-950/20 overflow-hidden rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Code className="h-4 w-4 text-orange-600" /> Interview Prep — Coding
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.dsa === undefined ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : data.dsa && ((data.dsa.topics_frequency?.length || 0) > 0 || (data.dsa.reported_questions?.length || 0) > 0) ? (
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Commonly Tested Topics</p>
                  {data.dsa.topics_frequency && data.dsa.topics_frequency.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {data.dsa.topics_frequency.map((t: any, idx: number) => (
                        <Badge key={idx} variant={t.relative_frequency === 'high' ? 'default' : t.relative_frequency === 'medium' ? 'secondary' : 'outline'} className="font-normal text-xs">
                          {t.topic}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No topics reported.</p>
                  )}
                </div>

                {data.dsa.reported_questions && data.dsa.reported_questions.length > 0 ? (
                  <div className="border-t pt-3">
                    <p className="text-muted-foreground text-xs uppercase tracking-wider mb-3">Recently Reported Questions</p>
                    <div className="space-y-2">
                      {data.dsa.reported_questions.map((q: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center p-2.5 rounded-md border border-border bg-muted/10 hover:bg-muted/30 transition-colors">
                          <div className="flex-1 min-w-0 pr-3">
                            <a href={q.leetcode_url} target="_blank" rel="noopener noreferrer" className="font-medium text-[13px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1.5 truncate">
                              {q.title} <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={cn(
                                "text-[10px] font-semibold uppercase tracking-wider",
                                q.difficulty === 'easy' ? "text-green-600" :
                                q.difficulty === 'medium' ? "text-yellow-600" :
                                "text-red-600"
                              )}>
                                {q.difficulty}
                              </span>
                              <span className="text-muted-foreground text-[10px]">•</span>
                              <span className="text-muted-foreground text-[10px] truncate">{q.topic}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (data.dsa.confidence === 'topic_only' || data.dsa.confidence === 'unavailable') ? (
                  <div className="border-t pt-3">
                    <p className="text-sm text-muted-foreground italic">
                      Specific reported questions aren't reliably available for this company yet — here's what topics tend to come up.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : data.jobs === undefined ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (data.jobs?.open_roles?.length || 0) > 0 ? (
              <RolePrepFallback titles={data.jobs.open_roles.map((j: any) => j.title)} />
            ) : (
              <p className="text-sm text-muted-foreground italic">No interview prep data found.</p>
            )}
          </CardContent>
        </Card>

        {/* Open Jobs Section */}
        <Card className="shadow-none border border-rose-200/60 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20 overflow-hidden rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Briefcase className="h-4 w-4 text-purple-600" /> Open Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.jobs === undefined ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : data.jobs === null || !data.jobs.open_roles || data.jobs.open_roles.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No recent open roles found.</p>
            ) : (
              <div className="space-y-4 text-sm">
                {[...data.jobs.open_roles].sort((a: any, b: any) => {
                  const order = { strong_match: 1, partial_match: 2, stretch: 3 };
                  const scoreA = a.fit_score?.fit_label ? order[a.fit_score.fit_label as keyof typeof order] || 4 : 4;
                  const scoreB = b.fit_score?.fit_label ? order[b.fit_score.fit_label as keyof typeof order] || 4 : 4;
                  return scoreA - scoreB;
                }).map((job: any, idx: number) => (
                  <div key={idx} className="flex flex-col gap-3 p-4 border rounded-md hover:bg-muted/50 transition-colors relative">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <p className="font-semibold text-foreground leading-tight">{job.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{job.location}</p>
                      </div>
                      {job.fit_score && (() => {
                        const matchedCount = job.fit_score.matched_requirements?.length || 0;
                        const missingCount = job.fit_score.missing_requirements?.length || 0;
                        const totalCount = matchedCount + missingCount;
                        const matchPercentage = totalCount > 0 ? Math.round((matchedCount / totalCount) * 100) : 0;
                        
                        return (
                          <div className="flex flex-col items-end gap-1.5">
                            <Badge variant={job.fit_score.fit_label === 'strong_match' ? 'default' : job.fit_score.fit_label === 'partial_match' ? 'secondary' : 'outline'}
                              className={cn(
                                "capitalize text-[10px] shrink-0",
                                job.fit_score.fit_label === 'strong_match' ? "bg-green-100 text-green-800 hover:bg-green-100" :
                                job.fit_score.fit_label === 'partial_match' ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100" :
                                "bg-orange-50 text-orange-800 border-orange-200"
                              )}>
                              {job.fit_score.fit_label.replace('_', ' ')}
                            </Badge>
                            {totalCount > 0 && (
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground" title="Based on your resume and GitHub activity">
                                <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${matchPercentage}%` }} />
                                </div>
                                <span className="font-medium whitespace-nowrap">{matchPercentage}% Match</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    
                    {job.fit_score && (
                      <div className="text-xs bg-muted/30 rounded p-2.5 border border-border">
                        <p className="font-medium text-foreground mb-1">{job.fit_score.summary}</p>
                        {job.fit_score.matched_requirements?.length > 0 && (
                          <div className="flex items-start gap-1.5 mt-1.5 text-muted-foreground">
                            <span className="text-green-600 font-bold shrink-0">✓</span>
                            <span className="line-clamp-2">Has: {job.fit_score.matched_requirements.join(', ')}</span>
                          </div>
                        )}
                        {job.fit_score.missing_requirements?.length > 0 && (
                          <div className="flex flex-col gap-1.5 mt-2">
                            {job.fit_score.missing_requirements.map((req: string, i: number) => {
                              const ideaKey = `${job.job_hash}-${req}`;
                              const idea = projectIdeas[ideaKey];
                              const isGenerating = generatingIdeas[ideaKey];
                              
                              return (
                                <div key={i} className="flex flex-col gap-1">
                                  <div className="flex items-start gap-1.5 text-muted-foreground">
                                    <span className="text-orange-500 font-bold shrink-0 mt-0.5">!</span>
                                    <span className="text-xs flex-1">Missing: {req}</span>
                                  </div>
                                  
                                  {!idea && !isGenerating && job.job_hash && (
                                    <div className="ml-4 mt-0.5">
                                      <button 
                                        onClick={() => fetchProjectIdea(job.job_hash, req, job.title)}
                                        className="text-[10px] text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors"
                                      >
                                        <Sparkles className="w-3 h-3" />
                                        Project idea to close this gap
                                      </button>
                                    </div>
                                  )}
                                  
                                  {isGenerating && (
                                    <div className="ml-4 mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                                      <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                                      Generating tailored project idea...
                                    </div>
                                  )}
                                  
                                  {idea && (
                                    <div className="ml-4 mt-1.5 bg-white dark:bg-slate-900 border border-border rounded-md p-2.5 shadow-sm">
                                      <div className="flex justify-between items-start gap-2 mb-1.5">
                                        <h4 className="font-semibold text-foreground text-xs">{idea.project_title}</h4>
                                        <div className="flex items-center gap-1 text-[9px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-muted-foreground whitespace-nowrap">
                                          <Briefcase className="w-2.5 h-2.5" />
                                          {idea.estimated_time}
                                        </div>
                                      </div>
                                      <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
                                        {idea.project_description}
                                      </p>
                                      <div className="space-y-1.5 mb-3">
                                        <div className="flex items-start gap-1.5 text-[10px]">
                                          <span className="text-green-600 font-medium shrink-0 mt-0.5">Why:</span>
                                          <span className="text-muted-foreground leading-tight">{idea.why_this_helps}</span>
                                        </div>
                                        <div className="flex items-start gap-1.5 text-[10px]">
                                          <span className="text-blue-600 font-medium shrink-0 mt-0.5">Stack:</span>
                                          <span className="text-muted-foreground leading-tight">{idea.stretch_from_current_skills}</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 border-t pt-2 mt-2">
                                        <span className="text-[10px] font-medium text-slate-500">Status:</span>
                                        <div className="flex bg-slate-100 dark:bg-slate-800 rounded p-0.5">
                                          {(['suggested', 'building', 'done'] as const).map(status => (
                                            <button
                                              key={status}
                                              onClick={() => updateIdeaStatus(job.job_hash, idea.id, status, req)}
                                              className={cn(
                                                "px-2 py-0.5 text-[9px] rounded capitalize transition-colors font-medium",
                                                idea.status === status 
                                                  ? "bg-white dark:bg-slate-700 shadow-sm text-foreground" 
                                                  : "text-muted-foreground hover:text-foreground"
                                              )}
                                            >
                                              {status}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="flex gap-2 w-full mt-1">
                      <a 
                        href={job.url || `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(`${job.title} ${companyName} jobs`)}`}
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 text-xs shrink-0", job.url ? "w-28" : "flex-1")}
                      >
                        View <ExternalLink className="ml-1.5 h-3 w-3" />
                      </a>
                      {job.url && (
                        <Button variant="default" size="sm" className="flex-1 h-8 text-xs bg-blue-600 hover:bg-blue-700" 
                          onClick={() => onTailorJob(
                            job.url, 
                            job.fit_score?.missing_requirements,
                            { company: companyName, role: job.title, fitLabel: job.fit_score?.fit_label }
                          )}>
                          Tailor
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Network & Code Matches */}
        <Card className="shadow-none border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 overflow-hidden rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-blue-600" /> Your Network at {companyName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {linkedinLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full rounded" />
                <Skeleton className="h-10 w-full rounded" />
              </div>
            ) : (
              <div className="space-y-4">
                {(linkedinConnections.length > 0 || manualContacts.length > 0) ? (
                  <div className="space-y-2">
                    {manualContacts.map((conn: any) => (
                      <div key={conn.id} className="flex flex-col p-2 bg-white dark:bg-slate-950 border rounded text-sm relative group">
                        <span className="font-medium text-foreground flex items-center justify-between">
                          {conn.name}
                          {conn.linkedin_url && (
                            <a href={conn.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-muted-foreground text-xs">{conn.title || "Contact"}</span>
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">Added by you</Badge>
                        </div>
                        {conn.note && <p className="text-xs text-muted-foreground mt-1 italic">"{conn.note}"</p>}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteManualContact(conn.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    {linkedinConnections.map((conn: any, i: number) => (
                      <div key={i} className="flex flex-col p-2 bg-white dark:bg-slate-950 border rounded text-sm">
                        <span className="font-medium text-foreground flex items-center justify-between">
                          {conn.name}
                          {conn.url && (
                            <a href={conn.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </span>
                        <span className="text-muted-foreground text-xs">{conn.position || conn.title}</span>
                      </div>
                    ))}
                  </div>
                ) : fallbackActions ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">No direct connections found at {companyName}. Here are some ways to build your network:</p>
                    
                    {fallbackActions.alumni_links && fallbackActions.alumni_links.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alumni Network</h4>
                        <div className="space-y-2">
                          {fallbackActions.alumni_links.map((alumni: any, i: number) => (
                            <a key={i} href={alumni.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 p-2 bg-white dark:bg-slate-950 border rounded text-sm hover:border-blue-300 transition-colors">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                <GraduationCap className="h-4 w-4" />
                              </span>
                              <span className="flex flex-col min-w-0 flex-1">
                                <span className="font-medium text-foreground truncate">{alumni.school}</span>
                                <span className="text-xs text-muted-foreground">Search LinkedIn alumni</span>
                              </span>
                              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-blue-600" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {fallbackActions.adjacent_connections && fallbackActions.adjacent_connections.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sector Peers</h4>
                        <div className="space-y-2">
                          {fallbackActions.adjacent_connections.map((conn: any, i: number) => (
                            <div key={i} className="flex flex-col p-2 bg-white dark:bg-slate-950 border rounded text-sm">
                              <span className="font-medium text-foreground flex items-center justify-between">
                                {conn.name}
                                {conn.url && (
                                  <a href={conn.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </span>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-muted-foreground text-xs">Works at <span className="font-medium">{conn.company}</span></span>
                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">sector_peer</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(fallbackActions.search_links?.people_search || fallbackActions.search_links?.second_degree) && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Search LinkedIn</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {fallbackActions.search_links?.people_search && (
                            <a href={fallbackActions.search_links.people_search} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-3 p-2 bg-white dark:bg-slate-950 border rounded text-sm hover:border-blue-300 transition-colors">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                <Search className="h-4 w-4" />
                              </span>
                              <span className="flex flex-col min-w-0">
                                <span className="font-medium text-foreground flex items-center gap-1">
                                  People Search <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-blue-600" />
                                </span>
                                <span className="text-xs text-muted-foreground">Search LinkedIn's people directory for {companyName}</span>
                              </span>
                            </a>
                          )}
                          {fallbackActions.search_links?.second_degree && (
                            <a href={fallbackActions.search_links.second_degree} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-3 p-2 bg-white dark:bg-slate-950 border rounded text-sm hover:border-blue-300 transition-colors">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                <Users className="h-4 w-4" />
                              </span>
                              <span className="flex flex-col min-w-0">
                                <span className="font-medium text-foreground flex items-center gap-1">
                                  2nd Degree <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-blue-600" />
                                </span>
                                <span className="text-xs text-muted-foreground">Search your 2nd-degree network at {companyName}</span>
                              </span>
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t">
                      {!outreachDraft ? (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground mb-2">Find someone using the links above, then use this to break the ice.</p>
                          <Button 
                            variant="default" 
                            className="w-full text-xs h-8" 
                            onClick={handleGenerateDraft}
                            disabled={generatingDraft}
                          >
                            {generatingDraft ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : null}
                            Draft Outreach Message
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Draft Message</h4>
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => navigator.clipboard.writeText(outreachDraft)}>
                              Copy
                            </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Personalize the greeting with their name before sending on LinkedIn.</p>
                          <textarea 
                            value={outreachDraft} 
                            onChange={(e) => setOutreachDraft(e.target.value)}
                            className="w-full h-32 p-2 text-xs bg-white dark:bg-slate-950 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No connections found at {companyName} in your LinkedIn export.</p>
                )}

                {/* Add Manual Contact */}
                <div className="pt-3 border-t">
                  {showAddContact ? (
                    <div className="space-y-2 p-3 border rounded-md bg-slate-50 dark:bg-slate-900/50">
                      <div className="flex justify-between items-center mb-1">
                        <h4 className="text-xs font-semibold">Log a Contact</h4>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowAddContact(false)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <input 
                        type="text" 
                        placeholder="Name*" 
                        value={newContact.name} 
                        onChange={e => setNewContact({...newContact, name: e.target.value})}
                        className="w-full h-8 px-2 text-xs border rounded bg-white dark:bg-slate-950"
                      />
                      <input 
                        type="text" 
                        placeholder="Role / Title" 
                        value={newContact.title} 
                        onChange={e => setNewContact({...newContact, title: e.target.value})}
                        className="w-full h-8 px-2 text-xs border rounded bg-white dark:bg-slate-950"
                      />
                      <input 
                        type="text" 
                        placeholder="LinkedIn URL (optional)" 
                        value={newContact.linkedin_url} 
                        onChange={e => setNewContact({...newContact, linkedin_url: e.target.value})}
                        className="w-full h-8 px-2 text-xs border rounded bg-white dark:bg-slate-950"
                      />
                      <input 
                        type="text" 
                        placeholder="Note (e.g. 'Met at alumni event')" 
                        value={newContact.note} 
                        onChange={e => setNewContact({...newContact, note: e.target.value})}
                        className="w-full h-8 px-2 text-xs border rounded bg-white dark:bg-slate-950"
                      />
                      <div className="flex justify-end pt-1">
                        <Button 
                          size="sm" 
                          className="h-7 text-xs bg-blue-600 hover:bg-blue-700" 
                          disabled={!newContact.name || savingContact}
                          onClick={handleAddManualContact}
                        >
                          {savingContact ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null} Save Contact
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="w-full h-8 text-xs border-dashed" onClick={() => setShowAddContact(true)}>
                      + Add a contact
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-none border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 overflow-hidden rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Code className="h-4 w-4 text-purple-600" /> Relevant GitHub Projects
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {githubLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full rounded" />
                <Skeleton className="h-12 w-full rounded" />
              </div>
            ) : githubMatch.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No projects explicitly matching {companyName}'s tech stack.</p>
            ) : (
              <div className="space-y-2">
                {githubMatch.map((repo: any, i: number) => (
                  <div key={i} className="flex flex-col p-2 bg-white dark:bg-slate-950 border rounded text-sm">
                    <span className="font-medium text-foreground flex items-center justify-between">
                      {repo.repo_name}
                      {repo.repo_url && repo.repo_url !== "#" && (
                        <a href={repo.repo_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </span>
                    <span className="text-muted-foreground text-xs line-clamp-1">{repo.one_line_relevance}</span>
                    {repo.matched_stack && repo.matched_stack.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {repo.matched_stack.map((stack: string, j: number) => (
                          <span key={j} className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded w-fit">{stack}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ratings & Links */}
        <Card className="shadow-none border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 overflow-hidden rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4 text-muted-foreground" /> Socials & Links
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* LinkedIn */}
            <div>
              <p className="font-medium text-sm flex items-center gap-2 mb-1">
                LinkedIn
                {data.linkedin?.link_confidence === "unverified_fallback" && <Badge variant="secondary" className="text-[10px] px-1 py-0 font-normal">Unverified</Badge>}
              </p>
              {data.linkedin === undefined ? (
                <Skeleton className="h-3 w-full" />
              ) : data.linkedin === null || !data.linkedin.url ? (
                <p className="text-sm text-muted-foreground italic">Not found</p>
              ) : (
                <div className="text-sm">
                  <a href={data.linkedin.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 w-fit">
                    View Profile <ExternalLink className="h-3 w-3" />
                  </a>
                  {data.linkedin.note && <p className="text-xs text-muted-foreground mt-1">{data.linkedin.note}</p>}
                </div>
              )}
            </div>
            
            {/* Glassdoor */}
            <div className="pt-2 border-t border-border">
              <p className="font-medium text-sm flex items-center gap-2 mb-1">
                Glassdoor
                {data.glassdoor?.link_confidence === "unverified_fallback" && <Badge variant="secondary" className="text-[10px] px-1 py-0 font-normal">Unverified</Badge>}
              </p>
              {data.glassdoor === undefined ? (
                <Skeleton className="h-3 w-full" />
              ) : data.glassdoor === null || !data.glassdoor.url ? (
                <p className="text-sm text-muted-foreground italic">Not found</p>
              ) : (
                <div className="text-sm">
                  <a href={data.glassdoor.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 w-fit">
                    View Profile <ExternalLink className="h-3 w-3" />
                  </a>
                  {data.glassdoor.note && <p className="text-xs text-muted-foreground mt-1">{data.glassdoor.note}</p>}
                </div>
              )}
            </div>

            {/* Extended Links */}
            {data.extended_links === undefined ? (
               <div className="pt-2 border-t border-border space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-full" /></div>
            ) : data.extended_links && (
              <>
                {['website', 'twitter', 'instagram', 'crunchbase', 'ambitionbox'].map((key) => {
                  const linkData = data.extended_links[key];
                  if (!linkData || !linkData.url) return null;
                  const label = key.charAt(0).toUpperCase() + key.slice(1);
                  return (
                    <div key={key} className="pt-2 border-t border-border">
                      <p className="font-medium text-sm flex items-center gap-2 mb-1">
                        {label === "Ambitionbox" ? "AmbitionBox" : label}
                        {linkData.link_confidence === "unverified_fallback" && <Badge variant="secondary" className="text-[10px] px-1 py-0 font-normal">Unverified</Badge>}
                      </p>
                      <div className="text-sm">
                        <a href={linkData.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 w-fit">
                          Visit {label === "Ambitionbox" ? "AmbitionBox" : label} <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </CardContent>
        </Card>

        {/* Competitors */}
        <Card className="shadow-none border border-amber-200/60 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 overflow-hidden rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-orange-600" /> Competitors
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.competitors === undefined ? (
              <div className="space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /></div>
            ) : data.competitors === null || !data.competitors.top_competitors || data.competitors.top_competitors.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No competitors found.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.competitors.top_competitors.map((comp: string, idx: number) => (
                  <Badge key={idx} variant="secondary" className="cursor-pointer hover:bg-muted-foreground/20 font-normal" onClick={() => onOpenProfile(comp.replace(/ /g, '-').toLowerCase())}>
                    {comp}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Benefits */}
        <Card className="shadow-none border border-fuchsia-200/60 dark:border-fuchsia-900/50 bg-fuchsia-50/40 dark:bg-fuchsia-950/20 overflow-hidden rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Heart className="h-4 w-4 text-red-500" /> Key Benefits
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.benefits === undefined ? (
              <div className="space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /></div>
            ) : data.benefits === null || !data.benefits.benefits || data.benefits.benefits.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No benefits data found.</p>
            ) : (
              <ul className="list-disc pl-4 text-sm space-y-1.5 marker:text-muted-foreground/50">
                {data.benefits.benefits.map((b: string, idx: number) => (
                  <li key={idx} className="text-foreground">{b}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
