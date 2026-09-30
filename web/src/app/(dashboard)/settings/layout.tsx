"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { User, Sliders, Link as LinkIcon, CreditCard, Settings as SettingsIcon } from "lucide-react";

const sidebarNavItems = [
  {
    title: "Profile",
    href: "/settings/profile",
    icon: User,
  },
  {
    title: "Preferences",
    href: "/settings/preferences",
    icon: Sliders,
  },
  {
    title: "Connected Accounts",
    href: "/settings/connectors",
    icon: LinkIcon,
  },
  {
    title: "Billing & Subscription",
    href: "/settings/billing",
    icon: CreditCard,
  },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-8 w-full pb-16">
      <div className="space-y-0.5">
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Manage your account settings and preferences.
        </p>
      </div>
      <div className="flex flex-col space-y-8 md:flex-row md:space-x-12 md:space-y-0">
        <aside className="w-full md:w-64 shrink-0">
          <nav className="flex space-x-2 overflow-x-auto md:flex-col md:space-x-0 md:space-y-1">
            {sidebarNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground",
                  pathname === item.href
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.title}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="flex-1 w-full max-w-4xl">{children}</div>
      </div>
    </div>
  );
}
