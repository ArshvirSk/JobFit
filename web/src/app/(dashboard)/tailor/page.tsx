"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, PipelineInput } from "@/lib/api";
import { Loader2, Download, Copy, CheckCircle2, AlertCircle, Zap } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { PDFExport } from "@/components/pdf-export";
import { toast } from "sonner";

function TailorContent() {
  const { user, consumeCredit } = useAuth();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<"input" | "processing" | "results">("input");
  
  // Input State
  const [jdUrl, setJdUrl] = useState(searchParams?.get("jdUrl") || "");
  const [jdText, setJdText] = useState("");
  const [resumeText, setResumeText] = useState("");
  
  // Resumes State
  const [baseResumes, setBaseResumes] = useState<any[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>("custom");

  // Tracker State
  const companyParam = searchParams?.get("company") || "";
  const roleParam = searchParams?.get("role") || "";
  const fitLabelParam = searchParams?.get("fitLabel") || "";

  const [isTrackerOpen, setIsTrackerOpen] = useState(false);
  const [trackCompany, setTrackCompany] = useState(companyParam);
  const [trackRole, setTrackRole] = useState(roleParam);
  const [isTracking, setIsTracking] = useState(false);
  
  const [appId, setAppId] = useState<string | null>(null);
  const [isApplied, setIsApplied] = useState(false);
  
  useEffect(() => {
    if (user) {
      api.getResumes().then(res => {
        setBaseResumes(res.data);
        if (res.data.length > 0) {
          setSelectedResumeId(res.data[0].id);
        }
      });
    }
  }, [user]);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Result State
  const [result, setResult] = useState<any>(null);

  const handleTailor = async () => {
    if (!jdUrl && !jdText) {
      setError("Please provide a Job Description URL or Text.");
      return;
    }
    if (selectedResumeId === "custom" && !resumeText) {
      setError("Please provide your base Resume text.");
      return;
    }
    
    if (!consumeCredit()) {
      setError("You have reached your credit limit for this month. Upgrade to Pro.");
      return;
    }

    setError(null);
    setStep("processing");

    try {
      const payload: PipelineInput = {};
      if (selectedResumeId !== "custom") {
        payload.base_resume_id = selectedResumeId;
      } else {
        payload.resume_text = resumeText;
      }
      if (jdUrl) payload.jd_url = jdUrl;
      if (jdText) payload.jd_text = jdText;

      const gapsParam = searchParams?.get("gaps");
      if (gapsParam) {
        try {
          payload.missing_requirements = JSON.parse(gapsParam);
        } catch (e) {
          console.error("Failed to parse gaps", e);
        }
      }

      const response = await api.tailorResume(payload);
      setResult(response.data);
      
      const resRole = roleParam || response.data.tailored_resume?.role || "";
      setTrackCompany(companyParam || "");
      setTrackRole(resRole);

      // Auto-log to tracker if we know the company
      if (companyParam) {
        try {
          const appRes = await api.saveApplication(
            companyParam, 
            resRole,
            "Materials Generated",
            "",
            {
              job_url: jdUrl,
              resume_version_used: selectedResumeId,
              cover_letter_generated: !!response.data.cover_letter,
              fit_label: fitLabelParam || null
            }
          );
          // Backend returns the inserted row or empty object
          if (appRes.data && appRes.data.id) {
            setAppId(appRes.data.id);
            setIsApplied(false);
          } else if (appRes.data?.id === undefined && appRes.data) {
            // Depending on how backend returns the single object vs list
            setAppId(appRes.data.id || appRes.data); 
          }
        } catch (e) {
          console.error("Failed to auto-log application", e);
        }
      }

      setStep("results");
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError("You have reached your limit of 3 free tailors. Please upgrade to Pro in the Billing section.");
      } else {
        setError(err.response?.data?.detail || err.message || "An error occurred during tailoring.");
      }
      setStep("input");
    }
  };

  const handleCopyCoverLetter = () => {
    if (result?.cover_letter?.text) {
      navigator.clipboard.writeText(result.cover_letter.text);
      toast.success("Cover letter copied to clipboard!");
    }
  };

  const resetFlow = () => {
    setResult(null);
    setAppId(null);
    setIsApplied(false);
    setStep("input");
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* HEADER */}
      <div className="flex items-center justify-between border-b pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tailor Resume</h1>
          <p className="text-muted-foreground">Match your experience to any job in seconds.</p>
        </div>
        {step === "results" && (
          <div className="flex gap-2">
            {appId ? (
              isApplied ? (
                <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100 h-10 px-4 text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Applied
                </Badge>
              ) : (
                <Button variant="default" onClick={async () => {
                  setIsTracking(true);
                  try {
                    // if appId is object fallback
                    const idStr = typeof appId === 'object' ? (appId as any).id : appId;
                    if (idStr) {
                      await api.updateApplicationStatus(idStr, "Applied");
                      setIsApplied(true);
                      toast.success("Marked as applied!");
                    }
                  } catch (e) {
                    toast.error("Failed to update status.");
                  } finally {
                    setIsTracking(false);
                  }
                }} disabled={isTracking}>
                  {isTracking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Mark as applied?
                </Button>
              )
            ) : (
              <Button variant="default" onClick={() => setIsTrackerOpen(true)}>Save to Tracker</Button>
            )}
            <Button variant="outline" onClick={resetFlow}>Start Over</Button>
          </div>
        )}
      </div>

      <Dialog open={isTrackerOpen} onOpenChange={setIsTrackerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save to Tracker</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Company</Label>
              <Input value={trackCompany} onChange={e => setTrackCompany(e.target.value)} placeholder="Acme Corp" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Input value={trackRole} onChange={e => setTrackRole(e.target.value)} placeholder="Software Engineer" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsTrackerOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              setIsTracking(true);
              try {
                await api.saveApplication(trackCompany, trackRole, "Applied");
                setIsTrackerOpen(false);
                toast.success("Saved to Application Tracker!");
              } catch (e) {
                console.error(e);
                toast.error("Failed to save to tracker.");
              } finally {
                setIsTracking(false);
              }
            }} disabled={isTracking || !trackCompany || !trackRole}>
              {isTracking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error && (
        <div className="p-4 rounded-md bg-red-50 text-red-600 border border-red-200 flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
        </div>
      )}

      {/* STEP 1: INPUT */}
      {step === "input" && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>1. Job Description</CardTitle>
              <CardDescription>Paste a link or the raw text of the job posting.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="jdUrl">Job URL (LinkedIn/Indeed)</Label>
                <Input 
                  id="jdUrl" 
                  placeholder="https://linkedin.com/jobs/view/..." 
                  value={jdUrl}
                  onChange={(e) => setJdUrl(e.target.value)}
                />
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or</span></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="jdText">Job Description Text</Label>
                <Textarea 
                  id="jdText" 
                  placeholder="Paste the full job description here..." 
                  className="min-h-[200px]"
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm flex flex-col">
            <CardHeader>
              <CardTitle>2. Base Resume</CardTitle>
              <CardDescription>Select a saved resume or paste a new one.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col space-y-4">
              <Select value={selectedResumeId} onValueChange={(val) => setSelectedResumeId(val as string)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a base resume" />
                </SelectTrigger>
                <SelectContent>
                  {baseResumes.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                  ))}
                  <SelectItem value="custom">Custom (Paste Text)</SelectItem>
                </SelectContent>
              </Select>
              {selectedResumeId === "custom" && (
                <Textarea 
                  placeholder="John Doe\njohndoe@email.com\n\nExperience\nSoftware Engineer at Tech Corp..." 
                  className="flex-1 min-h-[200px]"
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                />
              )}
            </CardContent>
          </Card>

          <div className="md:col-span-2">
            <Button size="lg" className="w-full text-lg h-14" onClick={handleTailor}>
              <Zap className="mr-2 h-5 w-5" /> Generate Tailored Application
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: PROCESSING */}
      {step === "processing" && (
        <Card className="shadow-sm py-20">
          <CardContent className="flex flex-col items-center justify-center space-y-6 text-center">
            <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
            <div className="space-y-2">
              <h3 className="text-2xl font-semibold">Crafting your application...</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Our AI is currently analyzing the job description, extracting keywords, and rewriting your resume to highlight your most relevant experience.
              </p>
            </div>
            
            <div className="w-full max-w-md space-y-3 text-sm text-muted-foreground mt-8 text-left">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Parsing Job Description</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Analyzing Skill Gaps</span>
              </div>
              <div className="flex items-center gap-3 opacity-50 animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Tailoring Resume & Cover Letter</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: RESULTS */}
      {step === "results" && result && (
        <Tabs defaultValue="resume" className="w-full">
          <TabsList className="flex flex-wrap w-full h-auto mb-8 gap-2 justify-start">
            <TabsTrigger value="resume" className="text-base flex-1">Tailored Resume</TabsTrigger>
            <TabsTrigger value="cover-letter" className="text-base flex-1">Cover Letter</TabsTrigger>
            <TabsTrigger value="gaps" className="text-base flex-1">Skill Gaps</TabsTrigger>
            <TabsTrigger value="prep" className="text-base flex-1">Interview Prep</TabsTrigger>
            <TabsTrigger value="ats" className="text-base flex-1">ATS Check</TabsTrigger>
          </TabsList>
          
          <TabsContent value="resume" className="space-y-4">
            <div className="flex justify-end mb-4">
              <PDFExport resume={result.tailored_resume} />
            </div>
            <Card className="shadow-sm">
              <CardContent className="p-8 font-serif">
                {/* Simplified Resume Render for Preview */}
                <div className="text-center mb-8 border-b pb-6">
                  <h1 className="text-3xl font-bold mb-2">{result.tailored_resume.name}</h1>
                  <p className="text-sm text-muted-foreground">{result.tailored_resume.contact_info}</p>
                </div>
                
                <div className="mb-6">
                  <h2 className="text-lg font-bold border-b pb-1 mb-3 uppercase tracking-wider text-foreground">Professional Summary</h2>
                  <p className="text-sm leading-relaxed">{result.tailored_resume.summary}</p>
                </div>
                
                <div className="mb-6">
                  <h2 className="text-lg font-bold border-b pb-1 mb-3 uppercase tracking-wider text-foreground">Experience</h2>
                  <div className="space-y-6">
                    {result.tailored_resume.experience.map((exp: any, i: number) => (
                      <div key={i}>
                        <div className="flex justify-between items-baseline mb-1">
                          <h3 className="font-bold text-base">{exp.role}</h3>
                          <span className="text-sm italic">{exp.start_date} - {exp.end_date || "Present"}</span>
                        </div>
                        <div className="text-sm font-medium mb-2">{exp.company}</div>
                        <ul className="list-disc pl-5 text-sm space-y-1">
                          {exp.bullets.map((b: string, j: number) => (
                            <li key={j} className="leading-relaxed">{b}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="cover-letter">
            <div className="flex justify-end mb-4">
              <Button variant="outline" onClick={handleCopyCoverLetter}>
                <Copy className="mr-2 h-4 w-4" /> Copy to Clipboard
              </Button>
            </div>
            <Card className="shadow-sm">
              <CardContent className="p-8">
                <div className="whitespace-pre-wrap text-sm leading-loose">
                  {result.cover_letter.text}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="gaps">
            <div className="grid gap-4">
              {result.skill_gaps.map((gap: any, i: number) => (
                <Card key={i} className="shadow-sm border-l-4 border-l-amber-400">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center justify-between">
                      {gap.skill_name}
                      <Badge variant="outline">{gap.suggestion_type}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{gap.suggestion_text}</p>
                  </CardContent>
                </Card>
              ))}
              
              {result.skill_gaps.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  Great news! Your resume covers all the critical skills mentioned in the job description.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="prep">
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4">Predicted Interview Questions</h2>
              {user?.plan_tier === "free" ? (
                <div className="p-8 text-center border rounded-md bg-accent/30 border-blue-100 flex flex-col items-center gap-4">
                  <Zap className="h-8 w-8 text-blue-500" />
                  <div>
                    <h3 className="font-bold text-lg text-blue-900 dark:text-blue-300">Upgrade to Pro</h3>
                    <p className="text-blue-700/80 dark:text-blue-400/80 mt-1 max-w-sm mx-auto">Unlock AI-predicted interview questions tailored specifically to this job description and your resume.</p>
                  </div>
                  <Button onClick={() => window.location.href = '/billing'}>View Plans</Button>
                </div>
              ) : result.interview_questions && result.interview_questions.length > 0 ? (
                <div className="grid gap-4">
                  {result.interview_questions.map((q: string, i: number) => (
                    <Card key={i} className="shadow-sm">
                      <CardContent className="p-4">
                        <p className="font-medium text-foreground"><span className="text-blue-500 mr-2 font-bold">Q{i+1}.</span>{q}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground border rounded-md">
                  No interview questions could be predicted for this role.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="ats">
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4">ATS Compatibility Check</h2>
              {user?.plan_tier === "free" ? (
                <div className="p-8 text-center border rounded-md bg-accent/30 border-blue-100 flex flex-col items-center gap-4">
                  <Zap className="h-8 w-8 text-blue-500" />
                  <div>
                    <h3 className="font-bold text-lg text-blue-900 dark:text-blue-300">Upgrade to Pro</h3>
                    <p className="text-blue-700/80 dark:text-blue-400/80 mt-1 max-w-sm mx-auto">Get an automated ATS compatibility check to ensure your resume won't get filtered out by formatting issues.</p>
                  </div>
                  <Button onClick={() => window.location.href = '/billing'}>View Plans</Button>
                </div>
              ) : result.ats_issues && result.ats_issues.length > 0 ? (
                <div className="grid gap-4">
                  {result.ats_issues.map((issue: string, i: number) => (
                    <Card key={i} className="shadow-sm border-l-4 border-l-red-500 bg-destructive/10">
                      <CardContent className="p-4 flex gap-3">
                        <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-foreground leading-relaxed">{issue}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-md flex flex-col items-center gap-2">
                  <CheckCircle2 className="h-8 w-8" />
                  <p className="font-medium">Great! No major ATS compatibility issues detected in your base resume.</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export default function TailorPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>}>
      <TailorContent />
    </Suspense>
  );
}
