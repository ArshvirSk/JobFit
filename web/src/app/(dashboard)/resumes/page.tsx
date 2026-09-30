"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Trash2, Plus, FileText, Loader2, Upload } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

interface BaseResume {
  id: string;
  label: string;
  raw_text: string;
  parsed_json: any;
  created_at: string;
}

export default function ResumesPage() {
  const { user } = useAuth();
  const [resumes, setResumes] = useState<BaseResume[]>([]);
  const [loading, setLoading] = useState(true);
  
  // New resume form state
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newText, setNewText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<BaseResume | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reparse state
  const [isReparsing, setIsReparsing] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    try {
      const res = await api.extractResumeText(file);
      setNewText(res.data.raw_text);
      if (!newLabel) {
        setNewLabel(file.name.split(".")[0]);
      }
      toast.success("Text extracted successfully from " + file.name);
    } catch (error) {
      console.error("Failed to extract text:", error);
      toast.error("Failed to extract text from file. Please make sure it's a valid PDF or DOCX.");
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const fetchResumes = async () => {
    try {
      const res = await api.getResumes();
      setResumes(res.data);
    } catch (error) {
      console.error("Failed to fetch resumes:", error);
      toast.error("Failed to load resumes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchResumes();
    }
  }, [user]);

  const handleSaveResume = async () => {
    if (!newLabel.trim() || !newText.trim()) return;
    setIsSaving(true);
    try {
      const res = await api.saveResume(newLabel, newText);
      if (res.data?.parse_confidence === "low") {
        toast.warning("Parse Warning: " + res.data.parse_warnings?.join(", "));
      } else {
        toast.success("Resume saved and parsed successfully!");
      }
      setNewLabel("");
      setNewText("");
      setIsAdding(false);
      await fetchResumes();
    } catch (error) {
      console.error("Failed to save resume:", error);
      toast.error("Failed to save resume. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReparse = async (resumeId: string) => {
    setIsReparsing(resumeId);
    try {
      const res = await api.reparseResume(resumeId);
      if (res.data?.confidence === "low") {
        toast.warning("Parse Warning: " + res.data.warnings?.join(", "));
      } else {
        toast.success("Resume re-parsed successfully!");
      }
      await fetchResumes();
    } catch (error) {
      console.error("Failed to re-parse resume:", error);
      toast.error("Failed to re-parse resume.");
    } finally {
      setIsReparsing(null);
    }
  };

  const handleDeleteResume = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.deleteResume(deleteTarget.id);
      toast.success(`Deleted "${deleteTarget.label}"`);
      setDeleteTarget(null);
      await fetchResumes();
    } catch (error) {
      console.error("Failed to delete resume:", error);
      toast.error("Failed to delete resume.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Base Resumes</h1>
          <p className="text-zinc-500 mt-2">
            Manage your base resumes. These will be available for quick selection when tailoring.
          </p>
        </div>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Resume
          </Button>
        )}
      </div>

      {isAdding && (
        <Card className="border-blue-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-blue-700">Add New Base Resume</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Label (e.g. "Frontend Engineer", "Product Manager")</Label>
              <Input 
                value={newLabel} 
                onChange={(e) => setNewLabel(e.target.value)} 
                placeholder="Resume variant name..."
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Raw Resume Text</Label>
                <div>
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                  />
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 border-blue-200" 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isExtracting}
                  >
                    {isExtracting ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-3 w-3" />
                    )}
                    {isExtracting ? "Extracting text..." : "Upload PDF / DOCX"}
                  </Button>
                </div>
              </div>
              <Textarea 
                value={newText} 
                onChange={(e) => setNewText(e.target.value)} 
                placeholder="Paste your raw resume text here, or upload a file to auto-extract..."
                className="h-48 font-mono text-xs"
                disabled={isExtracting}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2 border-t pt-4">
            <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
            <Button 
              onClick={handleSaveResume} 
              disabled={!newLabel.trim() || !newText.trim() || isSaving}
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Resume
            </Button>
          </CardFooter>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {resumes.map((resume) => (
          <Card key={resume.id} className="flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-zinc-500" />
                {resume.label}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => handleReparse(resume.id)}
                  disabled={isReparsing === resume.id}
                >
                  {isReparsing === resume.id ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <FileText className="h-3 w-3 mr-1" />
                  )}
                  Re-parse
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8"
                  onClick={() => setDeleteTarget(resume)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-xs text-zinc-500 line-clamp-6 font-mono whitespace-pre-wrap">
                {resume.raw_text}
              </p>
            </CardContent>
            <CardFooter className="text-xs text-zinc-400 border-t pt-4">
              Added {new Date(resume.created_at).toLocaleDateString()}
            </CardFooter>
          </Card>
        ))}
        {resumes.length === 0 && !isAdding && (
          <div className="col-span-full py-12 text-center text-zinc-500 border-2 border-dashed rounded-lg">
            No base resumes found. Click "Add Resume" to create your first variant.
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Resume</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>"{deleteTarget?.label}"</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteResume} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
