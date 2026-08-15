import re

with open('extension/src/App.tsx', 'r') as f:
    content = f.read()

# 1. Imports
imports = """import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import axios from 'axios'"""
content = content.replace("import axios from 'axios'", imports)

# 2. State
state_old = """  const [result, setResult] = useState<any>(null)
  
  // Fallback state
  const [manualJdText, setManualJdText] = useState('')"""
state_new = """  const [result, setResult] = useState<any>(null)
  
  // Resumes State
  const [baseResumes, setBaseResumes] = useState<any[]>([])
  const [selectedResumeId, setSelectedResumeId] = useState<string>('custom')
  const [manualResumeText, setManualResumeText] = useState('')

  // Tracker State
  const [isTrackerOpen, setIsTrackerOpen] = useState(false)
  const [trackCompany, setTrackCompany] = useState('')
  const [trackRole, setTrackRole] = useState('')
  const [isTracking, setIsTracking] = useState(false)

  // Fallback state
  const [manualJdText, setManualJdText] = useState('')"""
content = content.replace(state_old, state_new)

# 3. Effect
effect_old = """  useEffect(() => {
    // Ask background script if there is an active JD"""
effect_new = """  useEffect(() => {
    // Fetch resumes
    axios.get('http://localhost:8000/api/resume?user_id=usr_mock_123').then(res => {
      setBaseResumes(res.data)
      if (res.data.length > 0) {
        setSelectedResumeId(res.data[0].id)
      }
    }).catch(console.error)

    // Ask background script if there is an active JD"""
content = content.replace(effect_old, effect_new)

# 4. handleTailor logic
handle_old = """      const payload = {
        resume_text: MOCK_BASE_RESUME,
        jd_text: jdTextToUse,
        jd_url: jd?.url
      }

      const response = await axios.post('http://localhost:8000/api/tailor', payload)
      setResult(response.data)
      setStep('results')"""
handle_new = """      const payload: any = {
        jd_text: jdTextToUse,
        jd_url: jd?.url
      }
      if (selectedResumeId !== 'custom') {
        payload.base_resume_id = selectedResumeId
      } else {
        payload.resume_text = manualResumeText
      }

      const response = await axios.post('http://localhost:8000/api/tailor', payload)
      setResult(response.data)
      setTrackCompany(jd?.company || '')
      setTrackRole(response.data.tailored_resume?.role || '')
      setStep('results')"""
content = content.replace(handle_old, handle_new)

# 5. UI Base Resume
ui_old = """            <div className="p-3 bg-white border rounded-md shadow-sm">
              <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wider">Using Base Resume</p>
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-blue-600" />
                Default Software Engineer
              </div>
            </div>

            <Button className="w-full h-12 text-base shadow-md" onClick={handleTailor}>
              <Zap className="mr-2 h-4 w-4" /> 1-Click Tailor
            </Button>"""
ui_new = """            <div className="p-3 bg-white border rounded-md shadow-sm space-y-2">
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Using Base Resume</p>
              <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select Resume" />
                </SelectTrigger>
                <SelectContent>
                  {baseResumes.map(r => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                  <SelectItem value="custom">Custom (Paste Text)</SelectItem>
                </SelectContent>
              </Select>
              {selectedResumeId === 'custom' && (
                <Textarea 
                  placeholder="Paste resume text..." 
                  className="h-32 text-xs"
                  value={manualResumeText}
                  onChange={e => setManualResumeText(e.target.value)}
                />
              )}
            </div>

            <Button className="w-full h-12 text-base shadow-md" onClick={handleTailor} disabled={selectedResumeId === 'custom' && !manualResumeText}>
              <Zap className="mr-2 h-4 w-4" /> 1-Click Tailor
            </Button>"""
content = content.replace(ui_old, ui_new)

# 6. Results UI Success Message
success_old = """            <div className="bg-green-50 text-green-700 p-3 rounded-md border border-green-200 text-sm flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4" /> Application Tailored!
            </div>"""
success_new = """            <div className="bg-green-50 text-green-700 p-3 rounded-md border border-green-200 text-sm flex items-center justify-between font-medium">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Tailored!
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs bg-white text-zinc-700" onClick={() => setIsTrackerOpen(true)}>Save to Tracker</Button>
            </div>"""
content = content.replace(success_old, success_new)

# 7. Dialog HTML
dialog_html = """
        <Dialog open={isTrackerOpen} onOpenChange={setIsTrackerOpen}>
          <DialogContent className="max-w-[320px]">
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
                  await axios.post('http://localhost:8000/api/applications', { company: trackCompany, role: trackRole, status: 'Applied', notes: '', user_id: 'usr_mock_123' })
                  setIsTrackerOpen(false);
                } catch (e) {
                  console.error(e);
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
      </div>
    </div>
"""
content = content.replace("      </div>\n    </div>\n  )\n}", dialog_html + "  )\n}")

with open('extension/src/App.tsx', 'w') as f:
    f.write(content)
