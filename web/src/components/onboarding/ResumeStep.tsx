import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Upload, FileText } from "lucide-react";

export function ResumeStep({ 
  onNext, 
  resumeId, 
  setResumeId 
}: { 
  onNext: () => void, 
  resumeId: string | null,
  setResumeId: (id: string) => void 
}) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [rawText, setRawText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    try {
      const res = await api.extractResumeText(file);
      setRawText(res.data.raw_text);
      setShowPaste(true); // Show the text area so they can review it
      toast.success("Text extracted successfully from " + file.name);
    } catch (error: any) {
      console.error("Failed to extract text:", error);
      const errMsg = error.response?.data?.detail || "Failed to extract text from file.";
      toast.error(errMsg + " Please paste your resume text manually.");
      setShowPaste(true);
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSave = async () => {
    if (!rawText.trim()) {
      toast.error("Please provide your resume text.");
      return;
    }
    
    setIsSaving(true);
    try {
      const res = await api.saveResume("Base Resume", rawText);
      setResumeId(res.data.id);
      
      if (res.data.parse_confidence === "low") {
        toast.warning("Parse Warning: " + res.data.parse_warnings?.join(", "));
      } else {
        toast.success("Resume saved successfully!");
      }
    } catch (error) {
      console.error("Failed to save resume:", error);
      toast.error("Failed to save resume. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full justify-between">
      <div>
        <h2 className="text-2xl font-semibold mb-4 text-slate-800">1. Upload your resume</h2>
        <p className="text-slate-600 mb-6">
          This is the core input JobFit uses to personalize your experience, score your fit against jobs, and generate tailored materials.
        </p>

        {!showPaste ? (
          <div className="space-y-4">
            <div 
              className="border-2 border-dashed border-slate-300 rounded-xl p-10 flex flex-col items-center justify-center text-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
              onClick={() => !isExtracting && fileInputRef.current?.click()}
            >
              <input
                type="file"
                accept=".pdf,.docx,.doc"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <div className="bg-blue-100 text-blue-600 p-3 rounded-full mb-4">
                {isExtracting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
              </div>
              <span className="text-sm font-medium text-slate-700">
                {isExtracting ? "Extracting text..." : "Click to upload or drag and drop"}
              </span>
              <span className="text-xs text-slate-500 mt-1">PDF or DOCX (max 5MB)</span>
            </div>
            
            <div className="text-center">
              <span className="text-sm text-slate-500">or</span>
            </div>
            
            <Button variant="outline" className="w-full" onClick={() => setShowPaste(true)}>
              <FileText className="mr-2 h-4 w-4" /> Paste Text Manually
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-700">Review & Edit Raw Text</span>
              <Button variant="ghost" size="sm" onClick={() => setShowPaste(false)} className="h-8 text-xs">
                Back to Upload
              </Button>
            </div>
            <Textarea 
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste your resume text here..."
              className="h-64 font-mono text-xs"
            />
            {!resumeId ? (
              <Button onClick={handleSave} disabled={isSaving || !rawText.trim()} className="w-full">
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Parse & Save Resume
              </Button>
            ) : (
              <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-md flex items-center justify-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                Resume saved!
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-10 flex justify-end">
        <Button onClick={onNext} disabled={!resumeId} className="px-8">
          Next Step
        </Button>
      </div>
    </div>
  );
}
