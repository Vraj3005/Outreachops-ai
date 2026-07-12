"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { useToast } from "@/components/Toast";
import { 
  FileSpreadsheet, Mail, Sparkles, X, Plus, Trash2, Key, Info, RefreshCw, AlertCircle
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function IntegrationsPage() {
  const { toast } = useToast();
  
  // Connection states
  const [sheetsStatus, setSheetsStatus] = useState<any>({ status: "testing", details: "", available_spreadsheets: [] });
  const [gmailStatus, setGmailStatus] = useState<any>({ status: "testing", details: "", connected_account: "", scopes: [] });
  const [geminiStatus, setGeminiStatus] = useState<any>({ status: "testing", details: "", allowed_model: "", fallback_models: [] });

  // Config Modals
  const [activeModal, setActiveModal] = useState<"sheets" | "gemini" | null>(null);

  // Sheets Config states
  const [saJson, setSaJson] = useState("");
  const [savingSheets, setSavingSheets] = useState(false);

  // Gemini Config states
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash-lite");
  const [savingGemini, setSavingGemini] = useState(false);

  const fetchStatuses = async () => {
    // 1. Sheets
    try {
      const res = await fetch(`${API_URL}/api/v1/integrations/sheets/status`);
      if (res.ok) {
        setSheetsStatus(await res.json());
      } else {
        setSheetsStatus({ status: "failed", details: "Failed to get sheets status", available_spreadsheets: [] });
      }
    } catch (e) {
      setSheetsStatus({ status: "failed", details: "Connection error", available_spreadsheets: [] });
    }

    // 2. Gmail
    try {
      const res = await fetch(`${API_URL}/api/v1/integrations/gmail/status`);
      if (res.ok) {
        setGmailStatus(await res.json());
      } else {
        setGmailStatus({ status: "failed", details: "Failed to get Gmail status", connected_account: "", scopes: [] });
      }
    } catch (e) {
      setGmailStatus({ status: "failed", details: "Connection error", connected_account: "", scopes: [] });
    }

    // 3. Gemini
    try {
      const res = await fetch(`${API_URL}/api/v1/integrations/gemini/status`);
      if (res.ok) {
        setGeminiStatus(await res.json());
      } else {
        setGeminiStatus({ status: "failed", details: "Failed to get Gemini status", allowed_model: "", fallback_models: [] });
      }
    } catch (e) {
      setGeminiStatus({ status: "failed", details: "Connection error", allowed_model: "", fallback_models: [] });
    }
  };

  useEffect(() => {
    fetchStatuses();
  }, []);

  // Connect Gmail OAuth
  const handleConnectGmail = async () => {
    setGmailStatus(prev => ({ ...prev, status: "testing" }));
    toast("Starting OAuth redirection flow...", "info");
    try {
      const res = await fetch(`${API_URL}/api/v1/integrations/gmail/connect`, { method: "POST" });
      if (res.ok) {
        toast("Gmail authentication successful!", "success");
        fetchStatuses();
      } else {
        const err = await res.json();
        toast(err.detail || "OAuth flow failed.", "error");
        fetchStatuses();
      }
    } catch (e: any) {
      toast(`OAuth connection error: ${e.message}`, "error");
      fetchStatuses();
    }
  };

  // Revoke Gmail OAuth
  const handleDisconnectGmail = async () => {
    if (!confirm("Are you sure you want to revoke Gmail OAuth permissions?")) return;
    toast("Revoking Gmail token...", "info");
    try {
      const res = await fetch(`${API_URL}/api/v1/integrations/gmail/disconnect`, { method: "POST" });
      if (res.ok) {
        toast("Gmail OAuth disconnected.");
        fetchStatuses();
      } else {
        toast("Failed to revoke permissions.", "error");
      }
    } catch (e) {
      toast("Connection error.", "error");
    }
  };

  // Google Sheets configuration submit
  const handleConfigureSheets = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saJson) {
      toast("Please paste service account JSON key credentials.", "error");
      return;
    }
    setSavingSheets(true);
    toast("Saving key and testing Sheets client connectivity...", "info");

    try {
      const res = await fetch(`${API_URL}/api/v1/integrations/sheets/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_account_json: saJson })
      });

      if (res.ok) {
        toast("Google Sheets Service Account successfully saved!", "success");
        setActiveModal(null);
        setSaJson("");
        fetchStatuses();
      } else {
        const err = await res.json();
        toast(err.detail || "Sheets validation test failed.", "error");
      }
    } catch (err: any) {
      toast(`Connection error: ${err.message}`, "error");
    } finally {
      setSavingSheets(false);
    }
  };

  // Google Sheets disconnect
  const handleDisconnectSheets = async () => {
    if (!confirm("Are you sure you want to remove Google Sheets service account credentials?")) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/integrations/sheets/disconnect`, { method: "POST" });
      if (res.ok) {
        toast("Google Sheets disconnected.");
        fetchStatuses();
      } else {
        toast("Failed to clear sheets configuration.", "error");
      }
    } catch (e) {
      toast("Connection error.", "error");
    }
  };

  // Gemini configuration submit
  const handleConfigureGemini = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!geminiKey) {
      toast("Please provide your custom Gemini API Key.", "error");
      return;
    }
    setSavingGemini(true);
    toast("Saving key and testing Gemini quota models...", "info");

    try {
      const res = await fetch(`${API_URL}/api/v1/integrations/gemini/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: geminiKey,
          allowed_model: geminiModel,
          fallback_models: ["gemini-2.5-flash"]
        })
      });

      if (res.ok) {
        toast("Gemini API key successfully saved and verified!", "success");
        setActiveModal(null);
        setGeminiKey("");
        fetchStatuses();
      } else {
        const err = await res.json();
        toast(err.detail || "Gemini connection check failed.", "error");
      }
    } catch (err: any) {
      toast(`Connection error: ${err.message}`, "error");
    } finally {
      setSavingGemini(false);
    }
  };

  // Gemini disconnect
  const handleDisconnectGemini = async () => {
    if (!confirm("Are you sure you want to remove your custom Gemini API Key?")) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/integrations/gemini/disconnect`, { method: "POST" });
      if (res.ok) {
        toast("Gemini key disconnected.");
        fetchStatuses();
      } else {
        toast("Failed to clear Gemini configurations.", "error");
      }
    } catch (e) {
      toast("Connection error.", "error");
    }
  };

  return (
    <SidebarLayout>
      {/* Title */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-zinc-950 tracking-tight font-sans">System Integrations</h2>
        <p className="text-xs text-zinc-500 font-sans">Configure database connections, service-accounts, and Gemini API keys</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
        
        {/* Google Sheets Card */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col justify-between h-72">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              </div>
              
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                sheetsStatus.status === "connected" 
                  ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                  : sheetsStatus.status === "testing"
                  ? "bg-indigo-50 border-indigo-100 text-indigo-700 animate-pulse"
                  : "bg-rose-50 border-rose-100 text-rose-700"
              }`}>
                {sheetsStatus.status}
              </span>
            </div>

            <div>
              <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Google Sheets API</h3>
              <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed font-medium">
                Connects to the campaigns spreadsheet via service-account credentials JSON keyfile.
              </p>
              
              {sheetsStatus.status === "connected" && sheetsStatus.available_spreadsheets?.length > 0 && (
                <div className="mt-3 text-[10px] text-zinc-400">
                  <span className="font-bold text-zinc-600">Sync spreadsheets:</span> {sheetsStatus.available_spreadsheets.slice(0, 2).join(", ")}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100 flex items-center justify-between gap-2">
            <span className="text-[9px] text-zinc-400 font-mono truncate max-w-[100px]">Service Account Key</span>
            
            <div className="flex gap-2">
              {sheetsStatus.status === "connected" && (
                <button
                  onClick={handleDisconnectSheets}
                  className="px-2.5 py-1.5 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-lg text-[10px] font-semibold transition-all shadow-sm"
                  title="Remove configuration"
                >
                  Disconnect
                </button>
              )}
              <button 
                onClick={() => setActiveModal("sheets")}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-[10px] font-semibold transition-all shadow-sm"
              >
                Configure
              </button>
            </div>
          </div>
        </div>

        {/* Gmail API OAuth Card */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col justify-between h-72">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center">
                <Mail className="w-5 h-5 text-purple-600" />
              </div>
              
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                gmailStatus.status === "connected" 
                  ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                  : gmailStatus.status === "testing"
                  ? "bg-indigo-50 border-indigo-100 text-indigo-700 animate-pulse"
                  : "bg-rose-50 border-rose-100 text-rose-700"
              }`}>
                {gmailStatus.status}
              </span>
            </div>

            <div>
              <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Gmail API OAuth</h3>
              <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed font-medium">
                Accesses the Gmail client outbox using user OAuth tokens. Enforces DNC lists.
              </p>
              
              {gmailStatus.status === "connected" && gmailStatus.connected_account && (
                <div className="mt-3 text-[10px] text-zinc-400 truncate max-w-[200px]" title={gmailStatus.connected_account}>
                  <span className="font-bold text-zinc-600">Connected account:</span> {gmailStatus.connected_account}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100 flex items-center justify-between gap-2">
            <span className="text-[9px] text-zinc-400 font-mono truncate max-w-[100px]">scopes: gmail.send</span>
            
            <div className="flex gap-2">
              {gmailStatus.status === "connected" && (
                <button
                  onClick={handleDisconnectGmail}
                  className="px-2.5 py-1.5 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-lg text-[10px] font-semibold transition-all shadow-sm"
                >
                  Disconnect
                </button>
              )}
              <button 
                onClick={handleConnectGmail}
                disabled={gmailStatus.status === "testing"}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-white rounded-lg text-[10px] font-semibold transition-all shadow-sm"
              >
                {gmailStatus.status === "connected" ? "Reconnect" : "Authenticate"}
              </button>
            </div>
          </div>
        </div>

        {/* Gemini API Card */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col justify-between h-72">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-indigo-600" />
              </div>
              
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                geminiStatus.status === "connected" 
                  ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                  : geminiStatus.status === "testing"
                  ? "bg-indigo-50 border-indigo-100 text-indigo-700 animate-pulse"
                  : "bg-rose-50 border-rose-100 text-rose-700"
              }`}>
                {geminiStatus.status}
              </span>
            </div>

            <div>
              <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Gemini GenAI SDK</h3>
              <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed font-medium">
                Connects to Gemini API models with model failover list logic.
              </p>
              
              {geminiStatus.status === "connected" && (
                <div className="mt-3 text-[10px] text-zinc-400">
                  <span className="font-bold text-zinc-600">Model:</span> {geminiStatus.allowed_model}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100 flex items-center justify-between gap-2">
            <span className="text-[9px] text-zinc-400 font-mono truncate max-w-[100px]">BYO API Key</span>
            
            <div className="flex gap-2">
              {geminiStatus.status === "connected" && (
                <button
                  onClick={handleDisconnectGemini}
                  className="px-2.5 py-1.5 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-lg text-[10px] font-semibold transition-all shadow-sm"
                >
                  Disconnect
                </button>
              )}
              <button 
                onClick={() => setActiveModal("gemini")}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-[10px] font-semibold transition-all shadow-sm"
              >
                Configure
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Google Sheets Configuration Modal */}
      {activeModal === "sheets" && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-lg p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <h3 className="font-bold text-zinc-950 text-sm">Configure Google Sheets Service Account</h3>
              <button onClick={() => setActiveModal(null)} className="text-zinc-400 hover:text-zinc-600"><X className="w-4 h-4" /></button>
            </div>
            
            <form onSubmit={handleConfigureSheets} className="space-y-4 text-xs">
              <div className="flex gap-2 bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-indigo-700">
                <Info className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <p className="leading-normal">
                  Paste the contents of your Google Cloud Service Account JSON file. The key will be stored encrypted. Ensure you share the spreadsheets with the service account client email.
                </p>
              </div>
              
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Service Account credentials JSON</label>
                <textarea 
                  value={saJson}
                  onChange={e => setSaJson(e.target.value)}
                  rows={6}
                  placeholder='{ "type": "service_account", "project_id": ... }'
                  className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 font-mono text-[10px] focus:outline-none focus:border-zinc-950"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 text-xs pt-3 border-t border-zinc-100">
                <button type="button" onClick={() => setActiveModal(null)} className="px-4 py-2 border border-zinc-200 rounded-lg">Cancel</button>
                <button 
                  type="submit" 
                  disabled={savingSheets}
                  className="px-4 py-2 bg-zinc-900 text-white rounded-lg font-bold disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {savingSheets && <RefreshCw className="w-3 h-3 animate-spin" />}
                  Save & Validate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Gemini Configuration Modal */}
      {activeModal === "gemini" && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-lg p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <h3 className="font-bold text-zinc-950 text-sm">Configure Gemini API Provider</h3>
              <button onClick={() => setActiveModal(null)} className="text-zinc-400 hover:text-zinc-600"><X className="w-4 h-4" /></button>
            </div>
            
            <form onSubmit={handleConfigureGemini} className="space-y-4 text-xs">
              <div className="flex gap-2 bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-indigo-700">
                <Key className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <p className="leading-normal">
                  Provide your own Gemini API Key to bypass quota limits. The key is encrypted server-side and never exposed.
                </p>
              </div>
              
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Gemini API Key</label>
                <input 
                  type="password"
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Allowed Model Target</label>
                <select
                  value={geminiModel}
                  onChange={e => setGeminiModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 focus:outline-none"
                >
                  <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite (Fast & light)</option>
                  <option value="gemini-2.5-flash">gemini-2.5-flash (Standard)</option>
                  <option value="gemini-1.5-pro">gemini-1.5-pro (Thorough)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 text-xs pt-3 border-t border-zinc-100">
                <button type="button" onClick={() => setActiveModal(null)} className="px-4 py-2 border border-zinc-200 rounded-lg">Cancel</button>
                <button 
                  type="submit" 
                  disabled={savingGemini}
                  className="px-4 py-2 bg-zinc-900 text-white rounded-lg font-bold disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {savingGemini && <RefreshCw className="w-3 h-3 animate-spin" />}
                  Save API Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </SidebarLayout>
  );
}
