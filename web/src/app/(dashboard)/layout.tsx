"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, LayoutDashboard, Settings, User, Library, Briefcase, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { setAuthToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, session, loading, logout } = useAuth();

  // Sync JWT token to the API client whenever session changes
  useEffect(() => {
    setAuthToken(session?.access_token ?? null);
  }, [session]);

  // Auth guard: redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !session) {
      router.replace("/login");
    }
  }, [loading, session, router]);

  // Show loading spinner while checking auth
  if (loading || !session) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Tailor Resume", href: "/tailor", icon: FileText },
    { name: "Base Resumes", href: "/resumes", icon: Library },
    { name: "App Tracker", href: "/tracker", icon: Briefcase },
    { name: "Billing & Plans", href: "/billing", icon: Settings },
  ];

  const handleLogout = async () => {
    await logout();
    setAuthToken(null);
    router.replace("/login");
  };

  return (
    <div className="flex h-screen bg-zinc-50">
      {/* Sidebar */}
      <div className="w-64 border-r bg-white flex flex-col">
        <div className="h-16 flex items-center px-6 border-b">
          <Link href="/" className="font-bold text-xl tracking-tight text-blue-600">
            JobFit
          </Link>
        </div>
        
        <nav className="flex-1 py-4 flex flex-col gap-1 px-3">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-blue-50 text-blue-700" 
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-full bg-zinc-200 flex items-center justify-center">
              <User className="h-4 w-4 text-zinc-600" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-zinc-900">{user?.name || session.user.email}</span>
              <span className="text-xs text-zinc-500 capitalize">{user?.plan_tier || "free"} Plan</span>
            </div>
          </div>
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-zinc-500">Credits used</span>
              <span className="font-medium">{user?.credits_used ?? 0} / {user?.credits_limit ?? 3}</span>
            </div>
            <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 rounded-full" 
                style={{ width: `${((user?.credits_used || 0) / (user?.credits_limit || 1)) * 100}%` }}
              />
            </div>
          </div>
          <Button variant="outline" className="w-full text-xs h-8" onClick={handleLogout}>
            Sign Out
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <header className="h-16 flex items-center justify-end px-8 border-b bg-white">
          <Badge variant={user?.plan_tier === "free" ? "secondary" : "default"}>
            {user?.plan_tier === "free" ? "Free Tier" : "Pro"}
          </Badge>
        </header>
        <main className="p-8 max-w-6xl mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
