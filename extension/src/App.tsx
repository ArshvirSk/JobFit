import { useState, useEffect } from 'react'
import { FileText, Loader2, Zap, AlertCircle, Copy, ExternalLink, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import axios from 'axios'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'

// Remove static mock user; we will fetch it

// Mock Base Resume (since we don't have Supabase linked yet)
const MOCK_BASE_RESUME = `
Arshvir Singh Kalsi
Software Engineer
johndoe@example.com

Experience:
Software Engineer at TechCorp (2020 - Present)
- Built web applications using React and Node.js
- Improved performance by 30%

Education:
B.S. Computer Science, State University
`

type Step = 'detecting' | 'input' | 'processing' | 'results'

function App() {
  const [step, setStep] = useState<Step>('detecting')
  const [jd, setJd] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  
  // Resumes State
  const [baseResumes, setBaseResumes] = useState<any[]>([])
  const [selectedResumeId, setSelectedResumeId] = useState<string>('custom')
  const [resumeText, setResumeText] = useState(MOCK_BASE_RESUME)
  
  // Auth state
  const [session, setSession] = useState<Session | null>(null)
  const [authEmail, setAuthEmail] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [authLoading, setAuthLoading] = useState(false)
  
  // Fallback state
  const [manualJdText, setManualJdText] = useState('')

  // Tracker State
  const [isTrackerOpen, setIsTrackerOpen] = useState(false)
  const [trackCompany, setTrackCompany] = useState("")
  const [trackRole, setTrackRole] = useState("")
  const [isTracking, setIsTracking] = useState(false)

  useEffect(() => {
    // Check session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (s?.access_token) {
        fetchInitialData(s.access_token)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s?.access_token) {
        fetchInitialData(s.access_token)
      } else {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchInitialData = async (token: string) => {
    try {
      // Fetch user profile
      const userRes = await axios.get('http://localhost:8000/api/user/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
      setUser(userRes.data)

      // Fetch base resumes
      const resumesRes = await axios.get('http://localhost:8000/api/resume', {
        headers: { Authorization: `Bearer ${token}` }
      })
      setBaseResumes(resumesRes.data)
      if (resumesRes.data.length > 0) {
        setSelectedResumeId(resumesRes.data[0].id)
      }
    } catch (err) {
      console.error("Failed to fetch initial data", err)
    }
  }

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_ACTIVE_JD' }, (response) => {
      if (response && response.text) {
        setJd(response)
        setStep('input')
      } else {
        setStep('input')
      }
    })

    // Listen for updates from background
    const listener = (message: any) => {
      if (message.type === 'JD_UPDATED') {
        setJd(message.payload)
        if (step !== 'processing' && step !== 'results') {
          setStep('input')
        }
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [step])

  const handleTailor = async () => {
    const jdTextToUse = jd?.text || manualJdText
    if (!jdTextToUse) {
      setError("Please navigate to a job or paste a description.")
      return
    }

    if (selectedResumeId === 'custom' && !resumeText) {
      setError("Please provide your base Resume text.")
      return
    }

    setStep('processing')
    setError(null)

    try {
      const payload: any = {
        jd_text: jdTextToUse,
        jd_url: jd?.url
      }
      
      if (selectedResumeId !== 'custom') {
        payload.base_resume_id = selectedResumeId
      } else {
        payload.resume_text = resumeText
      }

      const response = await axios.post('http://localhost:8000/api/tailor', payload, {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      })
      setResult(response.data)
      setTrackCompany(jd?.company || "")
      setTrackRole(response.data.tailored_resume?.role || "")
      // Refresh user to update credits
      if (session?.access_token) {
        fetchInitialData(session.access_token)
      }
      setStep('results')
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError("Limit reached (3/3). Please upgrade to Pro in the Web App to continue.")
      } else {
        setError(err.response?.data?.detail || err.message || "Tailoring failed.")
      }
      setStep('input')
    }
  }

  const copyCoverLetter = () => {
    if (result?.cover_letter?.text) {
      navigator.clipboard.writeText(result.cover_letter.text)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
    if (error) setError(error.message)
    setAuthLoading(false)
  }

  if (!session) {
    return (
      <div className="flex flex-col h-full bg-zinc-50 p-6 items-center justify-center">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <Zap className="h-10 w-10 text-blue-600 fill-current mx-auto" />
            <h1 className="text-2xl font-bold text-zinc-900">Sign in to JobFit</h1>
            <p className="text-zinc-500 text-sm">Please sign in to access your resumes.</p>
          </div>
          {error && (
            <div className="p-3 rounded bg-red-50 text-red-600 text-sm border border-red-200">
              {error}
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={authLoading}>
              {authLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sign In
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b shrink-0">
        <div className="flex items-center gap-2 text-blue-600 font-bold">
          <Zap className="h-5 w-5 fill-current" />
          JobFit
        </div>
        <div className="flex items-center gap-2 text-xs">
          {user && (
            <>
              <Badge variant="secondary" className="capitalize">{user.plan_tier}</Badge>
              {user.plan_tier === 'free' && (
                <span className="text-zinc-500">{user.credits_limit - user.credits_used} left</span>
              )}
            </>
          )}
          <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()} className="ml-2 h-6 text-[10px] px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
            Sign out
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 rounded bg-red-50 text-red-600 text-sm border border-red-200 flex gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {step === 'detecting' && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Looking for job postings...</p>
          </div>
        )}

        {step === 'input' && jd && (
          <div className="space-y-4 animate-in fade-in">
            <Card className="border-blue-100 shadow-sm bg-blue-50/30">
              <CardHeader className="pb-2">
                <CardDescription className="text-blue-600 font-medium">Detected Job Posting</CardDescription>
                <CardTitle className="text-lg leading-tight">{jd.title}</CardTitle>
                <p className="text-sm text-zinc-500">{jd.company}</p>
              </CardHeader>
            </Card>

            <div className="p-3 bg-white border rounded-md shadow-sm space-y-3">
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Base Resume</p>
              <Select value={selectedResumeId} onValueChange={(val) => val && setSelectedResumeId(val)}>
                <SelectTrigger className="w-full h-8 text-sm">
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
                  placeholder="Paste your resume here..." 
                  className="h-24 text-xs"
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                />
              )}
            </div>

            <Button className="w-full h-12 text-base shadow-md" onClick={handleTailor}>
              <Zap className="mr-2 h-4 w-4" /> 1-Click Tailor
            </Button>
          </div>
        )}

        {step === 'input' && !jd && (
          <div className="space-y-4 text-center mt-8">
            <FileText className="h-12 w-12 text-zinc-300 mx-auto" />
            <h3 className="font-semibold text-lg text-zinc-900">No Job Detected</h3>
            <p className="text-sm text-zinc-500 px-4">
              Open a job posting on LinkedIn or Indeed, or paste the description below.
            </p>
            
            <div className="pt-4 text-left">
              <Textarea 
                placeholder="Paste Job Description here..." 
                className="h-32 mb-4 bg-white"
                value={manualJdText}
                onChange={(e) => setManualJdText(e.target.value)}
              />
              <Button className="w-full" onClick={handleTailor} disabled={!manualJdText}>
                Tailor from Text
              </Button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center h-full space-y-6 pt-12">
            <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
            <div className="text-center space-y-2">
              <h3 className="font-semibold text-zinc-900">Crafting Application</h3>
              <p className="text-sm text-zinc-500">Analyzing skills & rewriting bullets...</p>
            </div>
            
            <div className="w-full max-w-[200px] space-y-2 text-xs text-zinc-600 mt-4">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-green-500"/> Parsing JD</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-green-500"/> Analyzing Gaps</div>
              <div className="flex items-center gap-2 opacity-50"><Loader2 className="h-3 w-3 animate-spin"/> Rewriting Resume</div>
            </div>
          </div>
        )}

        {step === 'results' && result && (
          <div className="space-y-4 animate-in slide-in-from-right-4 duration-300 pb-4">
            <div className="bg-green-50 text-green-700 p-3 rounded-md border border-green-200 text-sm flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4" /> Application Tailored!
            </div>

            <Card className="shadow-sm">
              <CardHeader className="py-3 px-4 border-b bg-zinc-50/50">
                <CardTitle className="text-sm flex justify-between items-center">
                  Cover Letter
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={copyCoverLetter}>
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="text-xs leading-relaxed text-zinc-600 line-clamp-6 relative">
                  {result.cover_letter.text}
                  <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent" />
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Skill Gaps</h4>
              {result.skill_gaps.slice(0, 2).map((gap: any, i: number) => (
                <div key={i} className="text-xs p-3 border rounded-md bg-white shadow-sm border-l-2 border-l-amber-400">
                  <span className="font-semibold block mb-1">{gap.skill_name}</span>
                  <span className="text-zinc-600 leading-relaxed">{gap.suggestion_text}</span>
                </div>
              ))}
              {result.skill_gaps.length === 0 && (
                <div className="text-xs p-3 border rounded-md bg-white text-zinc-500 text-center">
                  No critical skill gaps found!
                </div>
              )}
            </div>

            {user?.plan_tier === 'free' ? (
              <div className="space-y-2 mt-4 p-4 border rounded-md bg-blue-50/50 flex flex-col items-center text-center gap-2">
                <Zap className="h-6 w-6 text-blue-500" />
                <div>
                  <h4 className="text-xs font-bold text-blue-900">Upgrade to Pro</h4>
                  <p className="text-[10px] text-blue-700/80 mt-1">Unlock AI-predicted interview questions & ATS checks.</p>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs w-full" onClick={() => window.open('http://localhost:3000/billing', '_blank')}>
                  View Plans
                </Button>
              </div>
            ) : (
              <>
                {result.interview_questions && result.interview_questions.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex justify-between items-center">
                      Interview Prep <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-zinc-200">PRO</Badge>
                    </h4>
                    {result.interview_questions.slice(0, 2).map((q: string, i: number) => (
                      <div key={i} className="text-xs p-3 border rounded-md bg-white shadow-sm">
                        <span className="text-blue-500 font-bold mr-1">Q.</span>
                        <span className="text-zinc-700 leading-relaxed">{q}</span>
                      </div>
                    ))}
                  </div>
                )}

                {result.ats_issues && result.ats_issues.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex justify-between items-center">
                      ATS Warnings <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-zinc-200">PRO</Badge>
                    </h4>
                    {result.ats_issues.slice(0, 2).map((issue: string, i: number) => (
                      <div key={i} className="text-xs p-3 border rounded-md bg-white shadow-sm border-l-2 border-l-red-500 flex gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0" />
                        <span className="text-zinc-700 leading-relaxed">{issue}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="pt-2 space-y-2">
              <Button className="w-full" variant="default" onClick={() => setIsTrackerOpen(true)}>
                Save to Tracker
              </Button>
              <Button className="w-full" variant="outline" onClick={() => window.open('http://localhost:3000/tailor', '_blank')}>
                View Full Results in Web App <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Tracker Dialog */}
      <Dialog open={isTrackerOpen} onOpenChange={setIsTrackerOpen}>
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle>Save to Tracker</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Company</Label>
              <Input value={trackCompany} onChange={e => setTrackCompany(e.target.value)} placeholder="Acme Corp" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Input value={trackRole} onChange={e => setTrackRole(e.target.value)} placeholder="Software Engineer" />
            </div>
          </div>
          <DialogFooter className="flex-row justify-end space-x-2">
            <Button variant="ghost" onClick={() => setIsTrackerOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              setIsTracking(true)
              try {
                await axios.post('http://localhost:8000/api/applications', {
                  company: trackCompany,
                  role: trackRole,
                  status: 'Applied',
                  notes: ''
                }, {
                  headers: { Authorization: `Bearer ${session.access_token}` }
                })
                setIsTrackerOpen(false)
              } catch (e) {
                console.error(e)
              } finally {
                setIsTracking(false)
              }
            }} disabled={isTracking || !trackCompany || !trackRole}>
              {isTracking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default App
