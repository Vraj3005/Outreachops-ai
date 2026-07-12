"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { 
  Sparkles, RefreshCw, BarChart3, 
  Settings, Database, Mail, LogOut, Code, Send
} from "lucide-react";
import { useToast } from "./Toast";
import { supabase } from "@/lib/supabase";

interface SidebarLayoutProps {
  children: React.ReactNode;
}

export default function SidebarLayout({ children }: SidebarLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const [checkingAuth, setCheckingAuth] = React.useState(true);
  const [userEmail, setUserEmail] = React.useState("yash69699696@gmail.com");
  const [gmailStatus, setGmailStatus] = React.useState("checking");
  const [sheetsStatus, setSheetsStatus] = React.useState("checking");
  const [geminiStatus, setGeminiStatus] = React.useState("checking");
  const [dbStatus, setDbStatus] = React.useState("checking");

  React.useEffect(() => {
    const checkAuthAndDiagnostics = async () => {
      // 1. Secure Layout Route Protection
      if (supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            router.push("/");
            return;
          }
          const email = session.user?.email || "";
          const ownerEmail = process.env.NEXT_PUBLIC_OWNER_EMAIL || "yash69699696@gmail.com";
          
          if (email.toLowerCase() !== ownerEmail.toLowerCase()) {
            toast("Access denied: You are not the authorized owner of this workspace.", "error");
            await supabase.auth.signOut();
            router.push("/");
            return;
          }
          setUserEmail(email);
        } catch (e) {
          console.error("Owner validation exception: ", e);
          router.push("/");
          return;
        }
      }
      setCheckingAuth(false);

      // 2. Load Diagnostics status indicators
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      
      // Gmail status
      try {
        const res = await fetch(`${API_URL}/api/v1/integrations/gmail/status`);
        if (res.ok) {
          const data = await res.json();
          setGmailStatus(data.status || "disconnected");
        } else {
          setGmailStatus("failed");
        }
      } catch (e) {
        setGmailStatus("failed");
      }

      // Sheets status
      try {
        const res = await fetch(`${API_URL}/api/v1/integrations/sheets/status`);
        if (res.ok) {
          const data = await res.json();
          setSheetsStatus(data.status || "unconfigured");
        } else {
          setSheetsStatus("failed");
        }
      } catch (e) {
        setSheetsStatus("failed");
      }

      // Gemini status
      try {
        const res = await fetch(`${API_URL}/api/v1/integrations/gemini/status`);
        if (res.ok) {
          const data = await res.json();
          setGeminiStatus(data.status || "unconfigured");
        } else {
          setGeminiStatus("failed");
        }
      } catch (e) {
        setGeminiStatus("failed");
      }

      // Database health
      try {
        const res = await fetch(`${API_URL}/api/v1/health`);
        if (res.ok) {
          const data = await res.json();
          setDbStatus(data.database?.status || "failed");
        } else {
          setDbStatus("failed");
        }
      } catch (e) {
        setDbStatus("failed");
      }
    };

    checkAuthAndDiagnostics();
  }, [router, toast]);

  const navItems = [
    { name: "Dashboard", path: "/dashboard", icon: BarChart3 },
    { name: "Leads Database", path: "/leads", icon: Database },
    { name: "Email Drafts", path: "/drafts", icon: Mail },
    { name: "Campaigns", path: "/campaigns", icon: Send },
    { name: "Prompt Studio", path: "/prompt-studio", icon: Code },
    { name: "Analytics", path: "/analytics", icon: BarChart3 },
    { name: "Integrations", path: "/integrations", icon: RefreshCw },
    { name: "Settings", path: "/settings", icon: Settings },
  ];

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    toast("Logged out successfully", "info");
    router.push("/");
  };

  const getStatusClasses = (status: string, defaultType: "gmail" | "sheets" | "gemini" | "db") => {
    const isSuccess = status === "connected";
    const isWarning = status === "expired" || status === "testing";
    const isChecking = status === "checking";
    
    if (isSuccess) {
      return {
        wrapper: defaultType === "gemini" 
          ? "text-indigo-700 bg-indigo-50 border-indigo-100" 
          : "text-emerald-700 bg-emerald-50 border-emerald-100",
        dot: defaultType === "gemini" ? "bg-indigo-500" : "bg-emerald-500"
      };
    } else if (isWarning) {
      return {
        wrapper: "text-amber-700 bg-amber-50 border-amber-100",
        dot: "bg-amber-500 animate-pulse"
      };
    } else if (isChecking) {
      return {
        wrapper: "text-zinc-400 bg-zinc-50 border-zinc-200/60",
        dot: "bg-zinc-300 animate-pulse"
      };
    } else {
      return {
        wrapper: "text-rose-700 bg-rose-50 border-rose-100",
        dot: "bg-rose-500"
      };
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3 text-indigo-600">
          <RefreshCw className="w-8 h-8 animate-spin" />
          <span className="text-xs font-semibold text-zinc-600">Verifying secure owner session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/50 text-zinc-950 flex font-sans">
      {/* Navigation Sidebar */}
      <aside className="w-64 border-r border-zinc-200 bg-white flex flex-col justify-between p-6 shrink-0 z-20 shadow-[1px_0_3px_rgba(0,0,0,0.01)]">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-2 mb-8 cursor-pointer" onClick={() => router.push("/dashboard")}>
            <div className="w-7 h-7 rounded-lg bg-zinc-900 flex items-center justify-center shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-sm tracking-tight text-zinc-900">OutreachOps AI</span>
          </div>

          {/* Nav Links */}
          <nav className="space-y-1">
            {navItems.map(item => {
              const isActive = pathname === item.path;
              const Icon = item.icon;
              return (
                <button
                   key={item.path}
                   onClick={() => router.push(item.path)}
                   className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-xs transition-all ${
                     isActive 
                       ? "bg-zinc-100 text-zinc-900 font-semibold border border-zinc-200/50 shadow-sm" 
                       : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50/80"
                   }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-zinc-900" : "text-zinc-400"}`} />
                  {item.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Card & Logout */}
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200/80 text-[10px]">
            <div className="text-zinc-400 font-semibold mb-1 uppercase tracking-wider">Account profile</div>
            <div className="font-bold text-zinc-700 truncate">{userEmail}</div>
          </div>
          
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-600 hover:text-rose-600 hover:bg-rose-50 text-xs font-semibold transition-all"
          >
            <LogOut className="w-4 h-4 text-rose-500/80" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="h-16 border-b border-zinc-200 px-8 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <span className="text-xs text-zinc-400 font-mono">Diagnostics:</span>
            <div className="flex items-center gap-3 text-[10px] font-semibold">
              {/* Database Status */}
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${getStatusClasses(dbStatus, "db").wrapper}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${getStatusClasses(dbStatus, "db").dot}`}></span>
                Database
              </div>
              {/* Gmail status */}
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${getStatusClasses(gmailStatus, "gmail").wrapper}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${getStatusClasses(gmailStatus, "gmail").dot}`}></span>
                Gmail API
              </div>
              {/* Sheets status */}
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${getStatusClasses(sheetsStatus, "sheets").wrapper}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${getStatusClasses(sheetsStatus, "sheets").dot}`}></span>
                Sheets Sync
              </div>
              {/* Gemini status */}
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${getStatusClasses(geminiStatus, "gemini").wrapper}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${getStatusClasses(geminiStatus, "gemini").dot}`}></span>
                Gemini API
              </div>
            </div>
          </div>
          
          <div className="text-[10px] font-medium flex items-center gap-2">
            {!supabase && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white font-bold animate-pulse text-[9px]">
                DEMO MODE
              </span>
            )}
            <span className="text-zinc-500">Tenant: Pitbull Corporations</span>
          </div>
        </header>

        <main className="p-8">
          <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
