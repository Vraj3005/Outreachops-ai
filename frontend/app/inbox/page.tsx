"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { useToast } from "@/components/Toast";
import { 
  Inbox, RefreshCw, AlertCircle, CheckCircle, 
  HelpCircle, Shield, Calendar, Filter, Send
} from "lucide-react";

interface ReplyEvent {
  id: string;
  user_id: string;
  campaign_id: string;
  lead_id: string;
  gmail_message_id: string;
  subject: string;
  body: string;
  category: string;
  confidence: number;
  rule_model_used: string;
  explanation?: string;
  manual_override: number;
  replied_at: string;
}

const CATEGORIES = [
  "positive/interested",
  "meeting request",
  "not interested",
  "not now",
  "unsubscribe",
  "wrong person",
  "referral",
  "out of office",
  "bounce/delivery failure",
  "unclear"
];

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function InboxPage() {
  const [replies, setReplies] = useState<ReplyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const { toast } = useToast();

  const fetchReplies = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/analytics/replies`);
      if (res.ok) {
        const data = await res.json();
        setReplies(data || []);
      } else {
        toast("Failed to load email outcomes.", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Connection error", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReplies();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/analytics/sync-replies`, {
        method: "POST"
      });
      if (res.ok) {
        toast("Inbox synchronization completed.", "success");
        fetchReplies();
      } else {
        toast("Sync failed.", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Sync timeout or error", "error");
    } finally {
      setSyncing(false);
    }
  };

  const handleOverride = async (id: string, newCategory: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/analytics/replies/${id}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: newCategory })
      });
      if (res.ok) {
        toast("Classification overridden successfully.", "success");
        fetchReplies();
      } else {
        toast("Failed to override category.", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Error submitting override", "error");
    }
  };

  const filteredReplies = replies.filter(r => {
    if (categoryFilter === "all") return true;
    return r.category === categoryFilter;
  });

  const getCategoryStyles = (category: string) => {
    const cat = category.toLowerCase();
    if (cat.includes("interested") || cat.includes("meeting")) {
      return "bg-emerald-50 border-emerald-100 text-emerald-700";
    } else if (cat.includes("unsubscribe") || cat.includes("bounce")) {
      return "bg-rose-50 border-rose-100 text-rose-700";
    } else if (cat.includes("office")) {
      return "bg-amber-50 border-amber-100 text-amber-700";
    } else if (cat.includes("not")) {
      return "bg-zinc-100 border-zinc-200 text-zinc-600";
    } else {
      return "bg-indigo-50 border-indigo-100 text-indigo-700";
    }
  };

  return (
    <SidebarLayout>
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-950 tracking-tight">Inbox Outcomes</h2>
          <p className="text-xs text-zinc-500">Monitor incoming replies, check sentiment classifications, and override errors</p>
        </div>
        <button 
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-900 text-white hover:bg-zinc-800 transition-colors text-xs font-bold shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Inbox"}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
        
        {/* Header and Filter */}
        <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Privacy-Safe Inbox Excerpts ({filteredReplies.length})</span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-zinc-400" />
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1 bg-white border border-zinc-200 rounded text-xs font-semibold text-zinc-700 focus:outline-none"
            >
              <option value="all">All Outcomes</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-zinc-400 font-semibold animate-pulse">
            Fetching inbox logs...
          </div>
        ) : filteredReplies.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-400 font-semibold italic">
            No prospect replies detected or matching filter criteria.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {filteredReplies.map((reply) => (
              <div key={reply.id} className="p-6 hover:bg-zinc-50/30 transition-colors flex flex-col md:flex-row md:items-start justify-between gap-6">
                
                {/* Left: Sender, Subject and Excerpt Body */}
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-xs text-zinc-900">{reply.lead_id}</span>
                    <span className="text-[10px] text-zinc-400 font-mono">({new Date(reply.replied_at).toLocaleString()})</span>
                  </div>
                  
                  <div className="text-xs font-semibold text-indigo-600 truncate">{reply.subject}</div>
                  
                  <div className="p-3 bg-zinc-50 border border-zinc-100 rounded-lg text-zinc-600 text-xs italic font-serif leading-relaxed relative max-w-3xl">
                    &ldquo;{reply.body}&rdquo;
                    <span className="absolute bottom-1 right-2 text-[8px] text-zinc-400 font-mono not-italic uppercase tracking-widest flex items-center gap-0.5">
                      <Shield className="w-2 h-2 text-emerald-500" /> PII-Redacted
                    </span>
                  </div>

                  {reply.explanation && (
                    <div className="p-4 bg-indigo-50/30 border border-indigo-100/60 rounded-lg text-zinc-800 text-xs max-w-3xl space-y-1">
                      <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-indigo-500" /> Suggested Response Draft
                      </div>
                      <p className="font-mono whitespace-pre-line leading-relaxed text-zinc-700">{reply.explanation}</p>
                    </div>
                  )}
                </div>

                {/* Right: Classification parameters and Override selector */}
                <div className="md:w-64 space-y-3 shrink-0">
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Classification</div>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${getCategoryStyles(reply.category)}`}>
                        {reply.category}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400 font-bold">
                        {Math.round(reply.confidence * 100)}%
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Method Used</div>
                    <div className="text-[10px] text-zinc-600 font-semibold font-mono">
                      {reply.rule_model_used}
                    </div>
                  </div>

                  {/* Manual Override Option */}
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Manual Override</div>
                    <select
                      value={reply.category}
                      onChange={e => handleOverride(reply.id, e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-zinc-200 rounded text-[10px] font-semibold text-zinc-700 focus:outline-none"
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                </div>

              </div>
            ))}
          </div>
        )}

      </div>
    </SidebarLayout>
  );
}
