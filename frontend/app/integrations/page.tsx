"use client";

import React, { useState } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { useToast } from "@/components/Toast";
import { 
  FileSpreadsheet, Mail, Sparkles
} from "lucide-react";

export default function IntegrationsPage() {
  const [sheetsStatus, setSheetsStatus] = useState<"connected" | "testing" | "failed" | "unconfigured">("testing");
  const [gmailStatus, setGmailStatus] = useState<"connected" | "testing" | "failed" | "disconnected">("testing");
  const [geminiStatus, setGeminiStatus] = useState<"connected" | "testing" | "failed" | "unconfigured">("testing");
  
  const { toast } = useToast();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const fetchStatuses = async () => {
    // 1. Sheets
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

    // 2. Gmail
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

    // 3. Gemini
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
  };

  React.useEffect(() => {
    fetchStatuses();
  }, []);

  const handleTestSheets = async () => {
    setSheetsStatus("testing");
    toast("Checking connection to Google Sheets API...", "info");
    try {
      const res = await fetch(`${API_URL}/api/v1/integrations/sheets/status`);
      if (res.ok) {
        const data = await res.json();
        setSheetsStatus(data.status || "unconfigured");
        if (data.status === "connected") {
          toast(`Google Sheets connected! ${data.details}`);
        } else {
          toast(`Sheets check failed: ${data.details || "unconfigured"}`, "error");
        }
      } else {
        setSheetsStatus("failed");
        toast("Failed to contact Google Sheets API", "error");
      }
    } catch (e: any) {
      setSheetsStatus("failed");
      toast(`Connection error: ${e.message}`, "error");
    }
  };

  const handleTestGmail = async () => {
    setGmailStatus("testing");
    toast("Validating Gmail OAuth token...", "info");
    try {
      const res = await fetch(`${API_URL}/api/v1/integrations/gmail/status`);
      if (res.ok) {
        const data = await res.json();
        setGmailStatus(data.status || "disconnected");
        if (data.status === "connected") {
          toast(`Gmail API connected! ${data.details}`);
        } else {
          toast(`Gmail OAuth check: ${data.details || "disconnected"}`, "info");
        }
      } else {
        setGmailStatus("failed");
        toast("Failed to contact Gmail API status endpoint", "error");
      }
    } catch (e: any) {
      setGmailStatus("failed");
      toast(`Connection error: ${e.message}`, "error");
    }
  };

  const handleTestGemini = async () => {
    setGeminiStatus("testing");
    toast("Checking connection to Gemini API...", "info");
    try {
      const res = await fetch(`${API_URL}/api/v1/integrations/gemini/status`);
      if (res.ok) {
        const data = await res.json();
        setGeminiStatus(data.status || "unconfigured");
        if (data.status === "connected") {
          toast(`Gemini connected successfully! ${data.details}`);
        } else {
          toast(`Gemini Key check: ${data.details || "unconfigured"}`, "error");
        }
      } else {
        setGeminiStatus("failed");
        toast("Failed to contact Gemini status endpoint", "error");
      }
    } catch (e: any) {
      setGeminiStatus("failed");
      toast(`Connection error: ${e.message}`, "error");
    }
  };

  return (
    <SidebarLayout>
      {/* Title */}
      <div>
        <h2 className="text-lg font-bold text-zinc-950 tracking-tight">System Integrations</h2>
        <p className="text-xs text-zinc-500">Validate third-party API configurations and OAuth access sessions</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Google Sheets */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col justify-between h-64">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              </div>
              
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                sheetsStatus === "connected" 
                  ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                  : sheetsStatus === "testing"
                  ? "bg-indigo-50 border-indigo-100 text-indigo-700 animate-pulse"
                  : "bg-rose-50 border-rose-100 text-rose-700"
              }`}>
                {sheetsStatus}
              </span>
            </div>

            <div>
              <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Google Sheets API</h3>
              <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed font-medium">
                Connects to the campaigns spreadsheet via service-account credentials JSON keyfile.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
            <span className="text-[9px] text-zinc-400 font-mono">sheets_credentials.json</span>
            <button 
              onClick={handleTestSheets}
              disabled={sheetsStatus === "testing"}
              className="px-3 py-1.5 bg-white hover:bg-zinc-50 disabled:opacity-40 text-zinc-700 rounded-lg text-[10px] font-semibold transition-all border border-zinc-200 shadow-sm"
            >
              {sheetsStatus === "testing" ? "Testing..." : "Test Sync"}
            </button>
          </div>
        </div>

        {/* Gmail API */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col justify-between h-64">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center">
                <Mail className="w-5 h-5 text-purple-600" />
              </div>
              
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                gmailStatus === "connected" 
                  ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                  : gmailStatus === "testing"
                  ? "bg-indigo-50 border-indigo-100 text-indigo-700 animate-pulse"
                  : "bg-rose-50 border-rose-100 text-rose-700"
              }`}>
                {gmailStatus}
              </span>
            </div>

            <div>
              <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Gmail API OAuth</h3>
              <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed font-medium">
                Accesses the Gmail client outbox using user OAuth tokens. Enforces DNC lists.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
            <span className="text-[9px] text-zinc-400 font-mono">gmail_token.pkl</span>
            <button 
              onClick={handleTestGmail}
              disabled={gmailStatus === "testing"}
              className="px-3 py-1.5 bg-white hover:bg-zinc-50 disabled:opacity-40 text-zinc-700 rounded-lg text-[10px] font-semibold transition-all border border-zinc-200 shadow-sm"
            >
              {gmailStatus === "testing" ? "Testing..." : "Test OAuth"}
            </button>
          </div>
        </div>

        {/* Gemini API */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col justify-between h-64">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-indigo-600" />
              </div>
              
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                geminiStatus === "connected" 
                  ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                  : geminiStatus === "testing"
                  ? "bg-indigo-50 border-indigo-100 text-indigo-700 animate-pulse"
                  : "bg-rose-50 border-rose-100 text-rose-700"
              }`}>
                {geminiStatus}
              </span>
            </div>

            <div>
              <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Gemini GenAI SDK</h3>
              <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed font-medium">
                Connects to Gemini API models with model failover list logic.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
            <span className="text-[9px] text-zinc-400 font-mono">gemini-3.1-flash-lite</span>
            <button 
              onClick={handleTestGemini}
              disabled={geminiStatus === "testing"}
              className="px-3 py-1.5 bg-white hover:bg-zinc-50 disabled:opacity-40 text-zinc-700 rounded-lg text-[10px] font-semibold transition-all border border-zinc-200 shadow-sm"
            >
              {geminiStatus === "testing" ? "Testing..." : "Test Quota"}
            </button>
          </div>
        </div>

      </div>
    </SidebarLayout>
  );
}
