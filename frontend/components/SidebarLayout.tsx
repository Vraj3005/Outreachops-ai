"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { 
  Sparkles, RefreshCw, BarChart3, 
  Settings, Database, Mail, LogOut, Code, Send, Clock, Inbox,
  Menu, X, ChevronLeft, ChevronRight
} from "lucide-react";
import { useToast } from "./Toast";
import { supabase } from "@/lib/supabase";

interface SidebarLayoutProps {
  children: React.ReactNode;
}

interface CachedDiagnosticStatus {
  gmail: string;
  sheets: string;
  gemini: string;
  db: string;
  userEmail: string;
}

let globalDiagnosticsCache: CachedDiagnosticStatus | null = null;

export default function SidebarLayout({ children }: SidebarLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const [checkingAuth, setCheckingAuth] = React.useState(() => {
    return globalDiagnosticsCache ? false : true;
  });
  const [userEmail, setUserEmail] = React.useState(() => globalDiagnosticsCache?.userEmail || "yash69699696@gmail.com");
  const [gmailStatus, setGmailStatus] = React.useState(() => globalDiagnosticsCache?.gmail || "checking");
  const [sheetsStatus, setSheetsStatus] = React.useState(() => globalDiagnosticsCache?.sheets || "checking");
  const [geminiStatus, setGeminiStatus] = React.useState(() => globalDiagnosticsCache?.gemini || "checking");
  const [dbStatus, setDbStatus] = React.useState(() => globalDiagnosticsCache?.db || "checking");
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("sidebar_collapsed");
      if (stored === "true") {
        setIsCollapsed(true);
      }
    }
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const newVal = !prev;
      localStorage.setItem("sidebar_collapsed", String(newVal));
      return newVal;
    });
  };

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

      // 2. Load Diagnostics status indicators from cache if available
      if (globalDiagnosticsCache) {
        setGmailStatus(globalDiagnosticsCache.gmail);
        setSheetsStatus(globalDiagnosticsCache.sheets);
        setGeminiStatus(globalDiagnosticsCache.gemini);
        setDbStatus(globalDiagnosticsCache.db);
        setUserEmail(globalDiagnosticsCache.userEmail);
        return;
      }

      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      let fetchedGmail = "failed";
      let fetchedSheets = "failed";
      let fetchedGemini = "failed";
      let fetchedDb = "failed";
      let currentEmail = userEmail;

      if (supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user?.email) {
            currentEmail = session.user.email;
          }
        } catch (e) {
          // ignore
        }
      }
      
      // Gmail status
      try {
        const res = await fetch(`${API_URL}/api/v1/integrations/gmail/status`);
        if (res.ok) {
          const data = await res.json();
          fetchedGmail = data.status || "disconnected";
        }
      } catch (e) {
        // ignore
      }

      // Sheets status
      try {
        const res = await fetch(`${API_URL}/api/v1/integrations/sheets/status`);
        if (res.ok) {
          const data = await res.json();
          fetchedSheets = data.status || "unconfigured";
        }
      } catch (e) {
        // ignore
      }

      // Gemini status
      try {
        const res = await fetch(`${API_URL}/api/v1/integrations/gemini/status`);
        if (res.ok) {
          const data = await res.json();
          fetchedGemini = data.status || "unconfigured";
        }
      } catch (e) {
        // ignore
      }

      // Database health
      try {
        const res = await fetch(`${API_URL}/api/v1/health`);
        if (res.ok) {
          const data = await res.json();
          fetchedDb = data.database || "failed";
        }
      } catch (e) {
        // ignore
      }

      // Update state
      setGmailStatus(fetchedGmail);
      setSheetsStatus(fetchedSheets);
      setGeminiStatus(fetchedGemini);
      setDbStatus(fetchedDb);
      setUserEmail(currentEmail);

      // Save to static global cache
      globalDiagnosticsCache = {
        gmail: fetchedGmail,
        sheets: fetchedSheets,
        gemini: fetchedGemini,
        db: fetchedDb,
        userEmail: currentEmail
      };
    };

    checkAuthAndDiagnostics();
  }, [router, toast]);

  const navItems = [
    { name: "Dashboard", path: "/dashboard", icon: BarChart3 },
    { name: "Imports", path: "/imports", icon: Database },
    { name: "Leads", path: "/leads", icon: Database },
    { name: "Campaigns", path: "/campaigns", icon: Send },
    { name: "Sequences", path: "/sequences", icon: Sparkles },
    { name: "Drafts", path: "/drafts", icon: Mail },
    { name: "Send Queue", path: "/queue", icon: Clock },
    { name: "Replies", path: "/inbox", icon: Inbox },
    { name: "Analytics", path: "/analytics", icon: BarChart3 },
    { name: "Prompt Studio", path: "/prompt-studio", icon: Code },
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
    const isUnconfigured = status === "unconfigured" || status === "disconnected";
    
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
    } else if (isUnconfigured) {
      return {
        wrapper: "text-zinc-500 bg-zinc-50 border-zinc-200/60",
        dot: "bg-zinc-400"
      };
    } else {
      return {
        wrapper: "text-rose-700 bg-rose-50 border-rose-100",
        dot: "bg-rose-500"
      };
    }
  };

  const renderSidebarContent = (isMobile = false) => {
    const collapsed = isMobile ? false : isCollapsed;
    return (
      <div className="flex flex-col h-full justify-between">
        <div>
          {/* Logo / Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => { router.push("/dashboard"); if (isMobile) setIsMobileOpen(false); }}>
              <div className="w-7 h-7 rounded-lg bg-zinc-900 flex items-center justify-center shadow-sm hover:scale-105 transition-transform">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              {!collapsed && (
                <span className="font-bold text-sm tracking-tight text-zinc-900 bg-gradient-to-r from-zinc-950 to-zinc-700 bg-clip-text text-transparent">
                  OutreachOps AI
                </span>
              )}
            </div>
            {isMobile && (
              <button onClick={() => setIsMobileOpen(false)} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Nav Links */}
          <nav className="space-y-1">
            {navItems.map(item => {
              const isActive = pathname === item.path;
              const Icon = item.icon;
              return (
                <button
                   key={item.path}
                   onClick={() => { router.push(item.path); if (isMobile) setIsMobileOpen(false); }}
                   className={`w-full flex items-center ${collapsed ? "justify-center px-1 py-2.5" : "gap-3 px-3 py-2"} rounded-lg font-medium text-xs transition-all ${
                     isActive 
                       ? "bg-zinc-100 text-zinc-900 font-semibold border border-zinc-200/50 shadow-sm" 
                       : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50/80"
                   }`}
                   title={collapsed ? item.name : undefined}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-zinc-900" : "text-zinc-400"}`} />
                  {!collapsed && <span>{item.name}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Card, Collapse Toggle & Logout */}
        <div className="space-y-3 mt-auto pt-6 border-t border-zinc-100">
          {!collapsed && (
            <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200/80 text-[10px]">
              <div className="text-zinc-400 font-semibold mb-1 uppercase tracking-wider">Account profile</div>
              <div className="font-bold text-zinc-700 truncate">{userEmail}</div>
            </div>
          )}
          
          <button 
            onClick={handleLogout}
            className={`w-full flex items-center ${collapsed ? "justify-center py-2.5" : "gap-3 px-3 py-2"} rounded-lg text-zinc-600 hover:text-rose-600 hover:bg-rose-50 text-xs font-semibold transition-all`}
            title={collapsed ? "Logout" : undefined}
          >
            <LogOut className="w-4 h-4 text-rose-500/80" />
            {!collapsed && <span>Logout</span>}
          </button>

          {/* Collapse button - only for desktop layout */}
          {!isMobile && (
            <button
               onClick={toggleCollapse}
               className="w-full flex items-center justify-center p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-zinc-400 hover:text-zinc-700 transition-all text-[10px]"
               title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <div className="flex items-center gap-1.5"><ChevronLeft className="w-3.5 h-3.5" /> <span>Collapse Menu</span></div>}
            </button>
          )}
        </div>
      </div>
    );
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3 text-zinc-900">
          <RefreshCw className="w-8 h-8 animate-spin" />
          <span className="text-xs font-semibold text-zinc-600">Verifying secure owner session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-zinc-50/50 text-zinc-950 flex font-sans">
      {/* Mobile sidebar drawer overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar slide-over container */}
      <aside className={`fixed top-0 bottom-0 left-0 bg-white z-50 p-6 flex flex-col justify-between border-r border-zinc-200 w-64 transform transition-transform duration-300 md:hidden ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {renderSidebarContent(true)}
      </aside>

      {/* Desktop Navigation Sidebar */}
      <aside className={`hidden md:flex flex-col justify-between border-r border-zinc-200 bg-white shrink-0 z-20 shadow-[1px_0_3px_rgba(0,0,0,0.01)] transition-all duration-300 ${isCollapsed ? "w-20 p-4" : "w-64 p-6"}`}>
        {renderSidebarContent(false)}
      </aside>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="h-16 border-b border-zinc-200 px-4 md:px-8 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Trigger */}
            <button 
              onClick={() => setIsMobileOpen(true)}
              className="p-1.5 rounded-lg border border-zinc-200 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 md:hidden"
            >
              <Menu className="w-4.5 h-4.5" />
            </button>
            
            <span className="text-xs text-zinc-400 font-mono hidden sm:inline">Diagnostics:</span>
            <div className="flex flex-wrap items-center gap-1.5 text-[9px] sm:text-[10px] font-semibold">
              {/* Database Status */}
              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border ${getStatusClasses(dbStatus, "db").wrapper}`}>
                <span className={`h-1 w-1 rounded-full ${getStatusClasses(dbStatus, "db").dot}`}></span>
                DB Link
              </div>
              {/* Gmail status */}
              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border ${getStatusClasses(gmailStatus, "gmail").wrapper}`}>
                <span className={`h-1 w-1 rounded-full ${getStatusClasses(gmailStatus, "gmail").dot}`}></span>
                Gmail API
              </div>
              {/* Sheets status */}
              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border ${getStatusClasses(sheetsStatus, "sheets").wrapper}`}>
                <span className={`h-1 w-1 rounded-full ${getStatusClasses(sheetsStatus, "sheets").dot}`}></span>
                Sheets Sync
              </div>
              {/* Gemini status */}
              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border ${getStatusClasses(geminiStatus, "gemini").wrapper}`}>
                <span className={`h-1 w-1 rounded-full ${getStatusClasses(geminiStatus, "gemini").dot}`}></span>
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
          </div>
        </header>

        <main className="p-4 md:p-8">
          <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
