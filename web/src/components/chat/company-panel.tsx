"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, ExternalLink, Briefcase, DollarSign, Building2, TrendingUp, Users, Heart, X, Sparkles, Bell, BellRing, Code, Info, ListChecks, Globe } from "lucide-react";
import { getAuthHeaders, API_BASE } from "@/lib/chat-api";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CompanyPanelProps {
  slug: string;
  onClose: () => void;
  onTailorJob: (url: string, missingRequirements?: string[], extra?: {company: string, role: string, fitLabel?: string}) => void;
  onOpenProfile: (slug: string) => void;
}

export function CompanyPanel({ slug, onClose, onTailorJob, onOpenProfile }: CompanyPanelProps) {
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
  const [digestLoading, setDigestLoading] = useState(true);
  const [priorApps, setPriorApps] = useState<any[]>([]);
  const [isWatched, setIsWatched] = useState(false);
  const [isTogglingWatch, setIsTogglingWatch] = useState(false);
  
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
      
      console.log(`[CompanyPanel] Fetch response status: ${response.status}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
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
                <p className="text-sm text-foreground leading-relaxed">{digest}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">Upload a resume to see your personalized fit summary.</p>
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
                <DollarSign className="h-4 w-4 text-green-600" /> Compensation
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
            ) : data.dsa === null ? (
              <p className="text-sm text-muted-foreground italic">No interview prep data found.</p>
            ) : (
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

                {data.dsa.confidence === 'verified_links' && data.dsa.reported_questions && data.dsa.reported_questions.length > 0 ? (
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
                      {job.fit_score && (
                        <Badge variant={job.fit_score.fit_label === 'strong_match' ? 'default' : job.fit_score.fit_label === 'partial_match' ? 'secondary' : 'outline'}
                          className={cn(
                            "capitalize text-[10px] shrink-0",
                            job.fit_score.fit_label === 'strong_match' ? "bg-green-100 text-green-800 hover:bg-green-100" :
                            job.fit_score.fit_label === 'partial_match' ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100" :
                            "bg-orange-50 text-orange-800 border-orange-200"
                          )}>
                          {job.fit_score.fit_label.replace('_', ' ')}
                        </Badge>
                      )}
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
                          <div className="flex items-start gap-1.5 mt-1 text-muted-foreground">
                            <span className="text-orange-500 font-bold shrink-0">!</span>
                            <span className="line-clamp-2">Missing: {job.fit_score.missing_requirements.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="flex gap-2 w-full mt-1">
                      {job.url && (
                        <>
                          <a 
                            href={job.url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-28 h-8 text-xs shrink-0")}
                          >
                            View <ExternalLink className="ml-1.5 h-3 w-3" />
                          </a>
                          <Button variant="default" size="sm" className="flex-1 h-8 text-xs bg-blue-600 hover:bg-blue-700" 
                            onClick={() => onTailorJob(
                              job.url, 
                              job.fit_score?.missing_requirements,
                              { company: companyName, role: job.title, fitLabel: job.fit_score?.fit_label }
                            )}>
                            Tailor
                          </Button>
                        </>
                      )}
                    </div>
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
