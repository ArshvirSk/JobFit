"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, LayoutDashboard, Settings, User, Library, Briefcase, Loader2, Menu, X, MessageSquare, ChevronDown, ChevronRight, Plus, Trash2, LogOut } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { setAuthToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChatProvider, useChat } from "@/components/chat/chat-context";
import { ModeToggle } from "@/components/mode-toggle";
import { cn } from "@/lib/utils";
import { RetroactiveModal } from "@/components/onboarding/RetroactiveModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const navigation = [
  { name: "Tailor Resume", href: "/tailor", icon: FileText },
  { name: "Base Resumes", href: "/resumes", icon: Library },
  { name: "App Tracker", href: "/tracker", icon: Briefcase },
];

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function DashboardInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, session, loading, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Chat state from context
  const { threads, deleteThread } = useChat();
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  
  // Retroactive Modal State
  const [showRetroModal, setShowRetroModal] = useState(false);
  const [hasResume, setHasResume] = useState(false);

  const isOnboarding = pathname.startsWith("/onboarding");

  // Sync JWT token to the API client whenever session changes
  useEffect(() => {
    setAuthToken(session?.access_token ?? null);
  }, [session]);

  // Handle onboarding redirects and retroactive modal
  useEffect(() => {
    if (user && !user.onboarding_completed_at && pathname !== "/onboarding") {
      // Check if they are an existing Pro user
      if (user.plan_tier === "pro") {
        const dismissCount = parseInt(localStorage.getItem("retro_modal_dismiss_count") || "0");
        if (dismissCount < 3) {
          // Check if they have a resume
          fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/resume`, {
            headers: { "Authorization": `Bearer ${session?.access_token}` }
          })
          .then(res => res.json())
          .then(data => {
            if (data && data.length > 0) setHasResume(true);
            setShowRetroModal(true);
          })
          .catch(err => console.error("Failed to check resumes:", err));
        }
      } else {
        // Force new free users to onboarding if not completed
        // Only redirect if they are definitively a new user (created in last hour)
        const isNewUser = user.created_at && (new Date().getTime() - new Date(user.created_at).getTime() < 1000 * 60 * 60);
        if (isNewUser) {
          router.replace("/onboarding");
        }
      }
    }
  }, [user, pathname, router, session]);

  const handleCloseRetroModal = () => {
    const currentCount = parseInt(localStorage.getItem("retro_modal_dismiss_count") || "0");
    localStorage.setItem("retro_modal_dismiss_count", (currentCount + 1).toString());
    setShowRetroModal(false);
  };


  // Auth guard: redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !session) {
      router.replace("/login");
    }
  }, [loading, session, router]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (loading || !session) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    setAuthToken(null);
    router.replace("/login");
  };

  const sidebarContent = (
    <>
      <div className="h-16 flex items-center px-6 shrink-0">
        <Link href="/chat" className="flex items-center gap-2 font-bold text-xl tracking-tight text-emerald-600">
          <Briefcase className="h-6 w-6" />
          <span>JobFit</span>
        </Link>
        {/* Close button — only visible on mobile */}
        <button
          className="ml-auto md:hidden p-1 rounded-md hover:bg-accent transition-colors"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={() => {
            router.push("/chat");
            if (window.innerWidth < 768) setSidebarOpen(false);
          }}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
            (pathname === "/chat")
              ? "bg-zinc-200/50 dark:bg-accent text-foreground"
              : "text-muted-foreground hover:bg-zinc-200/50 dark:hover:bg-accent hover:text-foreground"
          )}
        >
          <MessageSquare className="h-4 w-4" />
          New chat
        </button>
      </div>
      
      <nav className="flex-1 py-2 flex flex-col gap-1 px-3 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive 
                  ? "bg-zinc-200/50 dark:bg-accent text-foreground" 
                  : "text-muted-foreground hover:bg-zinc-200/50 dark:hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}

        {/* Recents Section */}
        <div className="mt-6 mb-2 px-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recents</h3>
        </div>
        
        {threads.length === 0 ? (
          <p className="text-xs text-muted-foreground px-6 py-2 italic">No previous chats</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {threads.map(thread => {
              const isThreadActive = pathname === `/chat/${thread.id}`;
              return (
                <div 
                  key={thread.id}
                  onClick={() => {
                    router.push(`/chat/${thread.id}`);
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
                  className={cn(
                    "group flex items-center justify-between px-3 py-2 rounded-md text-sm cursor-pointer transition-colors",
                    isThreadActive 
                      ? "bg-zinc-200/50 dark:bg-accent font-medium text-foreground" 
                      : "text-muted-foreground hover:bg-zinc-200/50 dark:hover:bg-accent hover:text-foreground"
                  )}
                >
                  <div className="flex flex-col flex-1 min-w-0 pr-2">
                    <span className="truncate">{thread.title}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setChatToDelete(thread.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </nav>

      <div className="p-4 shrink-0 flex items-center justify-between group mx-2 rounded-md mb-2 hover:bg-zinc-200/50 dark:hover:bg-accent transition-colors">
        <div 
          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer" 
          onClick={() => {
            router.push('/settings');
            if (window.innerWidth < 768) setSidebarOpen(false);
          }}
        >
          <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-foreground truncate">{user?.name || session.user.email}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button 
            onClick={() => {
              router.push('/settings');
              if (window.innerWidth < 768) setSidebarOpen(false);
            }} 
            className="p-1.5 rounded-md text-muted-foreground hover:bg-zinc-300/50 dark:hover:bg-zinc-800 hover:text-foreground transition-colors"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button 
            onClick={handleLogout} 
            className="p-1.5 rounded-md text-muted-foreground hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — desktop: always visible, mobile: slide-in drawer */}
      {!isOnboarding && (
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-64 bg-zinc-50 dark:bg-card flex flex-col",
            "transform transition-transform duration-200 ease-in-out",
            "md:relative md:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {sidebarContent}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-4 md:px-8 shrink-0">
          {/* Hamburger — only visible on mobile */}
          {!isOnboarding && (
            <button
              className="md:hidden p-2 rounded-md hover:bg-accent transition-colors"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5 text-foreground" />
            </button>
          )}
          <div className="md:hidden" /> {/* spacer */}
          <div className="flex items-center gap-2 ml-auto">
            <ModeToggle />
            <Badge variant={user?.plan_tier === "free" ? "secondary" : "default"}>
              {user?.plan_tier === "free" ? "Free Tier" : "Pro"}
            </Badge>
          </div>
        </header>

        {/* Onboarding Banner */}
        {user && !user.onboarding_completed_at && !isOnboarding && (
          <div className="bg-blue-50 border-b border-blue-100 px-4 py-3 sm:px-6 lg:px-8 flex items-center justify-between shrink-0">
            <p className="text-sm text-blue-700">
              <span className="font-semibold">Setup incomplete.</span> You haven't finished setting up your profile. Some features may be limited.
            </p>
            <Link href="/onboarding?existing=true">
              <Button size="sm" variant="outline" className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50">Complete Setup</Button>
            </Link>
          </div>
        )}

        {/* Make main padding 0 if on chat page to allow edge-to-edge chat UI */}
        <main className={cn(
          "w-full flex-1 flex flex-col min-h-0",
          pathname.startsWith("/chat") ? "p-0" : "p-4 md:p-8 max-w-6xl mx-auto"
        )}>
          {children}
        </main>
      </div>

      {/* Delete Chat Modal */}
      <Dialog open={!!chatToDelete} onOpenChange={(open) => !open && setChatToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Chat</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this chat? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setChatToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (chatToDelete) {
                deleteThread(chatToDelete);
                const isThreadActive = pathname === `/chat/${chatToDelete}`;
                if (isThreadActive) {
                  router.push("/chat");
                }
                setChatToDelete(null);
              }
            }}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
      
      <RetroactiveModal 
        isOpen={showRetroModal} 
        onClose={handleCloseRetroModal} 
        hasResume={hasResume} 
      />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatProvider>
      <DashboardInner>{children}</DashboardInner>
    </ChatProvider>
  );
}
