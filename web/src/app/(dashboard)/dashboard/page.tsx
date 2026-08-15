"use client";

import { useAuth } from "@/components/auth-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Briefcase, Plus, TrendingUp } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { session } = useAuth();

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
          Welcome back, {session?.user?.user_metadata?.full_name?.split(' ')[0] || 'User'}!
        </h1>
        <p className="text-zinc-500 mt-2">
          Here's what's happening with your job search today.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-sm border-zinc-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-600">Total Tailored Resumes</CardTitle>
            <FileText className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-900">0</div>
            <p className="text-xs text-zinc-500 mt-1">Start tailoring to see stats</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-600">Tracked Applications</CardTitle>
            <Briefcase className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-900">0</div>
            <p className="text-xs text-zinc-500 mt-1">No applications yet</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200 bg-blue-50/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-700">Interview Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">--%</div>
            <p className="text-xs text-blue-600/70 mt-1">Unlock insights by applying</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-sm border-zinc-200 flex flex-col">
          <CardHeader>
            <CardTitle>Recent Resumes</CardTitle>
            <CardDescription>You haven't tailored any resumes yet.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <div className="bg-zinc-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                <FileText className="h-8 w-8 text-zinc-400" />
              </div>
              <h3 className="font-medium text-zinc-900">No resumes found</h3>
              <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                Get started by tailoring your first resume to a specific job description.
              </p>
              <Link href="/tailor">
                <Button className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  Tailor a Resume
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200 flex flex-col">
          <CardHeader>
            <CardTitle>Recent Applications</CardTitle>
            <CardDescription>Your active job applications.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <div className="bg-zinc-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                <Briefcase className="h-8 w-8 text-zinc-400" />
              </div>
              <h3 className="font-medium text-zinc-900">No applications</h3>
              <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                Start tracking your applications to keep your job search organized.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
