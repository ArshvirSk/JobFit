"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { getPreferences, savePreferences, UserPreferences } from "@/lib/onboarding-api";

export default function PreferencesSettings() {
  const [prefs, setPrefs] = useState<UserPreferences>({
    target_roles: [],
    seniority: "",
    locations: [],
    work_mode: "hybrid",
    target_sectors: []
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchPrefs();
  }, []);

  const fetchPrefs = async () => {
    try {
      setLoading(true);
      const data = await getPreferences();
      if (data) {
        setPrefs(data);
      }
    } catch (err) {
      setError("Failed to load preferences.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await savePreferences(prefs);
      alert("Preferences saved successfully!");
    } catch (err) {
      alert("Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  };

  const arrayToText = (arr: string[] | undefined) => (arr || []).join(", ");
  const textToArray = (txt: string) => txt.split(",").map(s => s.trim()).filter(Boolean);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Preferences</h3>
        <p className="text-sm text-muted-foreground">
          Your target roles, sectors, and work style. We use this to calculate Job Fit scores.
        </p>
      </div>
      <Separator />
      
      {error && <div className="text-red-500 text-sm">{error}</div>}

      <div className="space-y-4 max-w-xl">
        <div className="grid gap-2">
          <Label htmlFor="roles">Target Roles (comma separated)</Label>
          <Input 
            id="roles" 
            value={arrayToText(prefs.target_roles)} 
            onChange={e => setPrefs({...prefs, target_roles: textToArray(e.target.value)})}
            placeholder="e.g. Frontend Engineer, Full Stack Developer" 
          />
        </div>
        
        <div className="grid gap-2">
          <Label htmlFor="seniority">Seniority</Label>
          <Input 
            id="seniority" 
            value={prefs.seniority || ""} 
            onChange={e => setPrefs({...prefs, seniority: e.target.value})}
            placeholder="e.g. Senior, Mid-level, Entry" 
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="sectors">Target Sectors (comma separated)</Label>
          <Input 
            id="sectors" 
            value={arrayToText(prefs.target_sectors)} 
            onChange={e => setPrefs({...prefs, target_sectors: textToArray(e.target.value)})}
            placeholder="e.g. FinTech, Healthcare, SaaS" 
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="locations">Locations (comma separated)</Label>
          <Input 
            id="locations" 
            value={arrayToText(prefs.locations)} 
            onChange={e => setPrefs({...prefs, locations: textToArray(e.target.value)})}
            placeholder="e.g. San Francisco, New York, Remote" 
          />
        </div>

        <div className="pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Preferences
          </Button>
        </div>
      </div>
    </div>
  );
}
