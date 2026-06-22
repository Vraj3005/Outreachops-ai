"use client";

import React, { useState, useEffect, useCallback } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { useToast } from "@/components/Toast";
import { 
  Mail, Sparkles, RefreshCw, CheckCircle2, XCircle, 
  Edit3, Send, Save, AlertCircle, X, ExternalLink,
  Square, CheckSquare, ShieldAlert
} from "lucide-react";
import { useRouter } from "next/navigation";

interface Draft {
  id: string;
  lead_id: string;
  email_type: string;
  subject: string | null;
  body: string | null;
  status: string;
  ai_model: string | null;
  quality_score: number | null;
  warnings?: string[] | null;
  lead_company?: string;
  lead_website?: string;
  lead_email?: string;
}

interface Lead {
  id: string;
  company_name: string | null;
  website: string;
  contact_email: string | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType] = useState<"website" | "erp" | "follow_up">("erp");
  const { toast } = useToast();
  const router = useRouter();

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Edit Mode Modal state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [refiningId, setRefiningId] = useState<string | null>(null);

  // Send Confirmation Modal state
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendTarget, setSendTarget] = useState<{ type: "single" | "bulk"; id?: string; count: number } | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Load drafts and map lead details
  const fetchDraftsAndLeads = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch leads map to resolve company names
      const leadsRes = await fetch(`${API_URL}/api/v1/leads`);
      let leadsMap: Record<string, Lead> = {};
      if (leadsRes.ok) {
        const leadsData: Lead[] = await leadsRes.json();
        leadsData.forEach(l => {
          leadsMap[l.id] = l;
        });
      }

      // 2. Fetch drafts filtered by active type
      const draftsRes = await fetch(`${API_URL}/api/v1/drafts?email_type=${activeType}`);
      if (draftsRes.ok) {
        const draftsData: Draft[] = await draftsRes.json();
        
        // Map lead details into draft objects
        const resolved = draftsData.map(d => {
          const lead = leadsMap[d.lead_id];
          return {
            ...d,
            lead_company: lead ? (lead.company_name || lead.website.split(".")[0].toUpperCase()) : "Prospect",
            lead_website: lead ? lead.website : "unknown-mock.com",
            lead_email: lead ? (lead.contact_email || "") : ""
          };
        });
        setDrafts(resolved);
      } else {
        toast("Failed to load drafts queue", "error");
      }
    } catch (e) {
      console.error("API Connection Error: ", e);
      toast("Error connecting to API server", "error");
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, [activeType, toast]);

  useEffect(() => {
    fetchDraftsAndLeads();
    setSelectedIds(new Set());
  }, [fetchDraftsAndLeads]);

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === drafts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(drafts.map(d => d.id)));
    }
  };

  const handleStartEdit = (draft: Draft) => {
    setEditingId(draft.id);
    setEditSubject(draft.subject || "");
    setEditBody(draft.body || "");
  };

  const handleSaveEdit = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: editSubject,
          body: editBody
        })
      });

      if (res.ok) {
        toast("Draft content saved successfully");
        setEditingId(null);
        fetchDraftsAndLeads();
      } else {
        toast("Failed to save changes", "error");
      }
    } catch (e) {
      console.error("API Connection Error: ", e);
      toast("Network connection error", "error");
    }
  };

  const handleRegenerate = async (draft: Draft) => {
    setRegeneratingId(draft.id);
    toast("Generating fresh prompt copy using Gemini API...", "info");

    try {
      const res = await fetch(`${API_URL}/api/v1/drafts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: draft.lead_id,
          email_type: draft.email_type,
          regenerate: true
        })
      });

      if (res.ok) {
        toast("Draft copy regenerated successfully");
        fetchDraftsAndLeads();
      } else {
        const err = await res.json();
        toast(err.detail || err.message || "Failed to regenerate", "error");
      }
    } catch (e) {
      console.error("API Connection Error: ", e);
      toast("Gemini API connection error", "error");
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleRefine = async (id: string, action: string) => {
    setRefiningId(id);
    toast(`Refining draft with Gemini: ${action.replace("_", " ")}...`, "info");
    
    try {
      const res = await fetch(`${API_URL}/api/v1/drafts/${id}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      
      if (res.ok) {
        toast("Draft successfully refined!");
        fetchDraftsAndLeads();
      } else {
        const err = await res.json();
        toast(err.detail || err.message || "Failed to refine draft", "error");
      }
    } catch (e) {
      console.error("API Connection Error: ", e);
      toast("Error connecting to refinement API", "error");
    } finally {
      setRefiningId(null);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/drafts/${id}/approve`, { method: "POST" });
      if (res.ok) {
        toast("Draft marked as APPROVED");
        fetchDraftsAndLeads();
      } else {
        toast("Failed to approve draft", "error");
      }
    } catch (e) {
      console.error("API Connection Error: ", e);
      toast("Error connecting to API", "error");
    }
  };

  const handleReject = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/drafts/${id}/reject`, { method: "POST" });
      if (res.ok) {
        toast("Draft marked as REJECTED", "info");
        fetchDraftsAndLeads();
      } else {
        toast("Failed to reject draft", "error");
      }
    } catch (e) {
      console.error("API Connection Error: ", e);
      toast("Error connecting to API", "error");
    }
  };

  const handleSendNowTrigger = (id: string) => {
    setSendTarget({ type: "single", id, count: 1 });
    setShowSendModal(true);
  };

  const handleBulkSendTrigger = () => {
    const approvedSelected = drafts.filter(d => selectedIds.has(d.id) && d.status === "approved");
    if (approvedSelected.length === 0) {
      toast("No APPROVED drafts selected. Please approve drafts first.", "error");
      return;
    }
    setSendTarget({ type: "bulk", count: approvedSelected.length });
    setShowSendModal(true);
  };

  const executeSending = async () => {
    if (!sendTarget) return;
    setIsSending(true);
    
    if (sendTarget.type === "single" && sendTarget.id) {
      toast("Dispatching email via Gmail API...", "info");
      try {
        const res = await fetch(`${API_URL}/api/v1/drafts/${sendTarget.id}/send`, { method: "POST" });
        if (res.ok) {
          toast("Email successfully sent via Gmail!");
          fetchDraftsAndLeads();
        } else {
          const err = await res.json();
          toast(err.detail || err.message || "Failed to send email", "error");
        }
      } catch (e) {
        console.error("API Connection Error: ", e);
        toast("Gmail API transmission timeout", "error");
      }
    } else {
      // Bulk approved sends
      const approvedSelected = drafts.filter(d => selectedIds.has(d.id) && d.status === "approved");
      toast(`Starting bulk transmission for ${approvedSelected.length} emails...`, "info");
      
      let success = 0;
      let failure = 0;
      
      for (const d of approvedSelected) {
        try {
          const res = await fetch(`${API_URL}/api/v1/drafts/${d.id}/send`, { method: "POST" });
          if (res.ok) {
            success++;
          } else {
            failure++;
          }
        } catch (e) {
          failure++;
        }
      }
      
      toast(`Bulk sending completed: ${success} sent, ${failure} failed.`);
      setSelectedIds(new Set());
      fetchDraftsAndLeads();
    }
    
    setIsSending(false);
    setShowSendModal(false);
    setSendTarget(null);
  };

  const handleBulkApprove = async () => {
    const draftSelected = drafts.filter(d => selectedIds.has(d.id) && d.status === "draft");
    if (draftSelected.length === 0) {
      toast("No PENDING drafts selected.", "error");
      return;
    }
    
    toast(`Approving ${draftSelected.length} drafts...`, "info");
    let success = 0;
    
    for (const d of draftSelected) {
      try {
        const res = await fetch(`${API_URL}/api/v1/drafts/${d.id}/approve`, { method: "POST" });
        if (res.ok) success++;
      } catch (e) {
        console.error(e);
      }
    }
    
    toast(`Successfully approved ${success} drafts.`);
    setSelectedIds(new Set());
    fetchDraftsAndLeads();
  };

  const handleApproveAll = async () => {
    toast("Approving all pending drafts...", "info");
    try {
      const res = await fetch(`${API_URL}/api/v1/drafts/approve-all`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        toast(`Success: Approved ${data.approved_count} pending drafts!`);
        fetchDraftsAndLeads();
      } else {
        toast("Failed to approve all drafts", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Error connecting to server", "error");
    }
  };

  const handleSendAllApproved = async () => {
    toast("Starting bulk sending process...", "info");
    try {
      const res = await fetch(`${API_URL}/api/v1/emails/send-approved`, {
        method: "POST"
      });
      if (res.ok) {
        toast("Bulk mailing queue started in background!");
        fetchDraftsAndLeads();
      } else {
        const err = await res.json();
        toast(err.detail || "Failed to start bulk send queue", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Error starting mailing process", "error");
    }
  };

  return (
    <SidebarLayout>
      {/* Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-950 tracking-tight">Email Drafts Queue</h2>
          <p className="text-xs text-zinc-500">Review, refine, and approve AI emails prior to Gmail API sends</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={handleApproveAll}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Approve All Pending Drafts
          </button>
          
          <button 
            onClick={handleSendAllApproved}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-all shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            Send All Approved
          </button>
          
          {drafts.length > 0 && (
            <button 
              onClick={handleToggleSelectAll}
              className="text-xs font-semibold text-zinc-400 hover:text-zinc-600 transition-colors ml-2"
            >
              {selectedIds.size === drafts.length ? "Deselect All" : "Select All"}
            </button>
          )}
        </div>
      </div>

      {/* Safety Box Guardrail */}
      <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
        <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <div className="font-extrabold text-amber-800 uppercase tracking-wide">Manual approval required before sending</div>
          <p className="text-amber-700 leading-relaxed font-medium">
            This workspace operates with human-in-the-loop safety constraints. AI-generated emails are never sent immediately. 
            Review drafts, run quick-action tone refinements, approve them, and send manually or bulk dispatch approved batches.
          </p>
        </div>
      </div>



      {/* Draft Cards List */}
      <div className="space-y-6">
        {loading ? (
          /* Skeleton Loader list */
          <div className="space-y-6">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm animate-pulse space-y-4">
                <div className="flex justify-between items-center border-b border-zinc-100 pb-4">
                  <div className="space-y-2">
                    <div className="h-4 w-36 bg-zinc-200 rounded"></div>
                    <div className="h-3 w-48 bg-zinc-100 rounded"></div>
                  </div>
                  <div className="h-6 w-20 bg-zinc-200 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-12 bg-zinc-200 rounded"></div>
                  <div className="h-4 w-64 bg-zinc-100 rounded"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-16 bg-zinc-200 rounded"></div>
                  <div className="h-20 w-full bg-zinc-50 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        ) : drafts.length === 0 ? (
          /* Empty State */
          <div className="bg-white border border-zinc-200 p-16 rounded-xl text-center shadow-sm max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center border border-zinc-200 mx-auto">
              <Mail className="w-5 h-5 text-zinc-500" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-zinc-900">Queue is empty</h3>
              <p className="text-xs text-zinc-500 leading-relaxed font-medium">Generate drafts from the Leads Database page to review, edit, and approve campaign dispatches here.</p>
            </div>
            <button 
              onClick={() => router.push("/leads")}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              Go to Leads Database
            </button>
          </div>
        ) : (
          drafts.map(draft => {
            // Quality score configuration
            const scoreVal = draft.quality_score || 85;
            const scoreColor = scoreVal >= 80 ? "bg-emerald-500" : scoreVal >= 55 ? "bg-amber-500" : "bg-rose-500";
            
            return (
              <div 
                key={draft.id} 
                className={`bg-white p-6 rounded-xl border transition-all flex gap-4 ${
                  draft.status === "approved" 
                    ? "border-emerald-200 bg-emerald-50/[0.1] shadow-[0_1px_3px_rgba(0,0,0,0.01)]" 
                    : draft.status === "rejected"
                    ? "border-rose-200 bg-rose-50/[0.1] shadow-[0_1px_3px_rgba(0,0,0,0.01)]"
                    : draft.status === "sent"
                    ? "border-teal-200 bg-teal-50/[0.1] shadow-[0_1px_3px_rgba(0,0,0,0.01)]"
                    : "border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
                }`}
              >
                {/* Checkbox column */}
                <div className="pt-1 select-none">
                  <button 
                    onClick={() => handleToggleSelectRow(draft.id)}
                    disabled={draft.status === "sent"}
                    className="text-zinc-400 hover:text-zinc-600 transition-colors disabled:opacity-30"
                  >
                    {selectedIds.has(draft.id) ? (
                      <CheckSquare className="w-4.5 h-4.5 text-zinc-900" />
                    ) : (
                      <Square className="w-4.5 h-4.5" />
                    )}
                  </button>
                </div>

                {/* Main Card Content */}
                <div className="flex-1 space-y-4">
                  {/* Card Header info */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-900 text-sm">{draft.lead_company}</span>
                        <span className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
                          ({draft.lead_website})
                          <a href={`https://${draft.lead_website}`} target="_blank" className="hover:text-zinc-600"><ExternalLink className="w-2.5 h-2.5 inline" /></a>
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-1 font-medium flex items-center gap-1">
                        <Mail className="w-3 h-3 text-zinc-400" /> {draft.lead_email || "No email available"}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Quality rating badge */}
                      <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 px-3 py-1 rounded-lg">
                        <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Quality</span>
                        <div className="w-16 h-1.5 rounded-full bg-zinc-200 overflow-hidden">
                          <div className={`h-full ${scoreColor}`} style={{ width: `${scoreVal}%` }}></div>
                        </div>
                        <span className="text-[10px] font-bold text-zinc-700 font-mono">{scoreVal}%</span>
                      </div>

                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                        draft.status === "approved" 
                          ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                          : draft.status === "rejected"
                          ? "bg-rose-50 border-rose-100 text-rose-700"
                          : draft.status === "sent"
                          ? "bg-teal-50 border-teal-100 text-teal-700"
                          : "bg-zinc-100 border-zinc-200 text-zinc-500"
                      }`}>
                        {draft.status}
                      </span>
                    </div>
                  </div>

                  {/* Subject & Body */}
                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-[9px] uppercase font-bold text-zinc-400 block">Subject</span>
                      <div className="text-xs font-bold text-zinc-900 mt-1">Subject: {draft.subject}</div>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase font-bold text-zinc-400 block">Body Copy</span>
                      <p className="text-xs text-zinc-700 mt-1 leading-relaxed whitespace-pre-line bg-zinc-50/50 p-4 rounded-lg border border-zinc-100/60 font-mono">{draft.body}</p>
                    </div>
                  </div>

                  {/* Warnings List */}
                  {draft.warnings && draft.warnings.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Email Quality Warnings ({draft.warnings.length})</span>
                      </div>
                      <ul className="list-disc pl-4 text-[10px] text-amber-700/80 space-y-0.5 font-medium">
                        {draft.warnings.map((warn, i) => (
                          <li key={i}>{warn}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Actions Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-4 mt-6 pt-4 border-t border-zinc-100">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleStartEdit(draft)}
                        disabled={draft.status === "sent"}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-zinc-50 disabled:opacity-40 text-zinc-700 border border-zinc-200 rounded-lg text-[10px] font-semibold shadow-sm transition-all"
                      >
                        <Edit3 className="w-3 h-3 text-zinc-400" /> Edit Copy
                      </button>

                      <button 
                        onClick={() => handleRegenerate(draft)}
                        disabled={regeneratingId === draft.id || draft.status === "sent"}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-zinc-50 disabled:opacity-40 text-zinc-700 border border-zinc-200 rounded-lg text-[10px] font-semibold transition-all shadow-sm"
                      >
                        {regeneratingId === draft.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 text-indigo-500" />}
                        Regenerate
                      </button>

                      {/* Refinement Actions */}
                      {draft.status !== "sent" && (
                        <div className="flex items-center gap-1.5 border-l border-zinc-200 pl-3">
                          <span className="text-[9px] uppercase font-bold text-zinc-400 mr-1">Refine:</span>
                          <button
                            onClick={() => handleRefine(draft.id, "make_shorter")}
                            disabled={refiningId !== null}
                            className="px-2 py-1 bg-zinc-50 hover:bg-zinc-100 disabled:opacity-40 text-zinc-700 rounded border border-zinc-200 text-[9px] font-semibold transition-colors"
                          >
                            Shorter
                          </button>
                          <button
                            onClick={() => handleRefine(draft.id, "make_direct")}
                            disabled={refiningId !== null}
                            className="px-2 py-1 bg-zinc-50 hover:bg-zinc-100 disabled:opacity-40 text-zinc-700 rounded border border-zinc-200 text-[9px] font-semibold transition-colors"
                          >
                            Direct
                          </button>
                          <button
                            onClick={() => handleRefine(draft.id, "less_salesy")}
                            disabled={refiningId !== null}
                            className="px-2 py-1 bg-zinc-50 hover:bg-zinc-100 disabled:opacity-40 text-zinc-700 rounded border border-zinc-200 text-[9px] font-semibold transition-colors"
                          >
                            Less Salesy
                          </button>
                          <button
                            onClick={() => handleRefine(draft.id, "change_cta")}
                            disabled={refiningId !== null}
                            className="px-2 py-1 bg-zinc-50 hover:bg-zinc-100 disabled:opacity-40 text-zinc-700 rounded border border-zinc-200 text-[9px] font-semibold transition-colors"
                          >
                            Change CTA
                          </button>
                          {refiningId === draft.id && (
                            <RefreshCw className="w-3 h-3 text-indigo-500 animate-spin ml-1" />
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleReject(draft.id)}
                        disabled={draft.status === "rejected" || draft.status === "sent"}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-100 hover:bg-rose-100/50 disabled:opacity-40 text-rose-700 rounded-lg text-[10px] font-semibold transition-all"
                      >
                        <XCircle className="w-3 h-3" /> Reject
                      </button>

                      <button 
                        onClick={() => handleApprove(draft.id)}
                        disabled={draft.status === "approved" || draft.status === "sent"}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100/50 disabled:opacity-40 text-emerald-700 rounded-lg text-[10px] font-bold transition-all"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Approve
                      </button>

                      <button 
                        onClick={() => handleSendNowTrigger(draft.id)}
                        disabled={draft.status !== "approved"}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:bg-zinc-100 disabled:text-zinc-400 text-white rounded-lg text-[10px] font-bold transition-all shadow-sm"
                      >
                        <Send className="w-3 h-3" /> Send Now
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border border-zinc-200 px-6 py-3 rounded-full shadow-lg z-30 flex items-center gap-4 animate-fade-in">
          <span className="text-xs font-semibold text-zinc-600">
            <span className="text-zinc-950 font-bold">{selectedIds.size}</span> drafts selected
          </span>
          
          <div className="flex gap-2">
            <button 
              onClick={handleBulkApprove}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 rounded-full text-xs font-bold shadow-sm transition-all"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Approve
            </button>
            
            <button 
              onClick={handleBulkSendTrigger}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-full text-xs font-bold transition-all shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              Send Approved
            </button>
          </div>
          
          <button 
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-zinc-400 hover:text-zinc-600 font-semibold px-1"
          >
            Clear
          </button>
        </div>
      )}

      {/* Overlay Modal Editor */}
      {editingId !== null && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-lg animate-fade-in flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="font-bold text-zinc-950 text-sm">Edit Email Pitch Draft</h3>
              <button onClick={() => setEditingId(null)} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Email Subject Line</label>
                <input 
                  type="text" 
                  value={editSubject} 
                  onChange={e => setEditSubject(e.target.value)} 
                  className="w-full px-3 py-2.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 transition-all font-semibold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Email Body Copy</label>
                <textarea 
                  value={editBody} 
                  onChange={e => setEditBody(e.target.value)} 
                  rows={12}
                  className="w-full px-3 py-2.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 transition-all font-mono leading-relaxed"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3 bg-zinc-50/50">
              <button 
                onClick={() => setEditingId(null)}
                className="px-4 py-2 border border-zinc-200 text-zinc-500 hover:bg-zinc-50 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleSaveEdit(editingId)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold shadow-sm"
              >
                Save Pitch Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Confirmation Dialog Modal */}
      {showSendModal && sendTarget && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-lg p-6 space-y-4 animate-fade-in">
            <div className="flex items-center gap-3 text-zinc-900">
              <ShieldAlert className="w-6 h-6 shrink-0 text-indigo-600" />
              <h3 className="font-bold text-zinc-900 text-base">Outbox Dispatch Confirmation</h3>
            </div>

            <div className="text-xs text-zinc-600 space-y-3 leading-relaxed">
              <p>
                You are about to send <span className="text-zinc-950 font-extrabold text-sm">{sendTarget.count}</span> email{sendTarget.count > 1 ? "s" : ""} immediately via your authorized Gmail API outbox.
              </p>
              <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-200 text-zinc-500">
                <strong>Safety checks verified:</strong> recipient list DNC exclusion check will be triggered, and daily limits will be respected before transmission.
              </div>
              <p className="font-semibold text-zinc-900">Do you wish to continue and trigger sending?</p>
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-zinc-100">
              <button 
                onClick={() => !isSending && setShowSendModal(false)}
                disabled={isSending}
                className="px-4 py-2 border border-zinc-200 text-zinc-500 hover:bg-zinc-50 rounded-lg text-xs font-semibold transition-colors"
              >
                Abort
              </button>
              <button 
                onClick={executeSending}
                disabled={isSending}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
              >
                {isSending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Confirm and Send
              </button>
            </div>
          </div>
        </div>
      )}

    </SidebarLayout>
  );
}
