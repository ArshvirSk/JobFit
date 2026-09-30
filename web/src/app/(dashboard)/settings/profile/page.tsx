"use client";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { FileText } from "lucide-react";

export default function ProfileSettings() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Profile</h3>
        <p className="text-sm text-muted-foreground">
          Manage your public profile and base information.
        </p>
      </div>
      <Separator />
      
      <div className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" defaultValue={user?.name || ""} disabled className="max-w-md" />
          <p className="text-[10px] text-muted-foreground">Your name is synced with your authentication provider.</p>
        </div>
        
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" defaultValue={user?.email || ""} disabled className="max-w-md" />
        </div>

        <div className="grid gap-2 pt-4">
          <Label htmlFor="linkedin">LinkedIn Profile URL</Label>
          <Input id="linkedin" placeholder="https://linkedin.com/in/username" className="max-w-md" />
          <p className="text-[10px] text-muted-foreground">Your LinkedIn URL helps us fetch richer background context.</p>
          <div className="mt-2">
            <Button size="sm" variant="secondary">Save LinkedIn URL</Button>
          </div>
        </div>

        <div className="grid gap-2 pt-6">
          <h4 className="text-sm font-medium">Base Resume</h4>
          <p className="text-sm text-muted-foreground mb-2">
            Your base resume is used to automatically tailor applications to specific job descriptions.
          </p>
          <Link href="/resumes">
            <Button variant="outline" className="w-fit gap-2">
              <FileText className="h-4 w-4" />
              Manage Base Resumes
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
