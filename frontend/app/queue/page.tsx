"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { useToast } from "@/components/Toast";
import { 
  Clock, RefreshCw, AlertTriangle, CheckCircle, 
  XCircle, RotateCcw, Ban, Activity, Filter, HelpCircle
} from "lucide-react";

interface ScheduledEmail {
  id: string;
  user_id: string;
  draft_id: string;
  campaign_id: string;
  lead_id: string;
  scheduled_at: string;
  scheduled_for?: string;
  status: string;
  attempts: number;
  last_error?: string;
  gmail_message_id?: string;
  gmail_thread_id?: string;
  created_at: string;
  updated_at: string;
}

interface WorkerHealth {
  status: string;
  last_heartbeat?: string;
  reason?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function QueuePage() {
  const [queue, setQueue] = useState<ScheduledEmail[]>([]);
  const [health, setHealth] = useState<WorkerHealth>({ status: "checking" });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();

  const fetchQueueAndHealth = async () => {
    setLoading(true);
    try {
      // 1. Fetch Queue items
      const qRes = await fetch(`${API_URL}/api/v1/emails/queue`);
      if (qRes.ok) {
        const qData = await qRes.json();
        setQueue(qData || []);
      }

      // 2. Fetch Worker Health
      const hRes = await fetch(`${API_URL}/api/v1/emails/worker-health`);
      if (hRes.ok) {
        const hData = await hRes.json();
        setHealth(hData);
      } else {
        setHealth({ status: "offline", reason: "API health check failed" });
      }
    } catch (e) {
      console.error(e);
      toast("Failed to retrieve outbox queue logs.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueueAndHealth();
    // Poll every 5 seconds for live status changes
    const interval = setInterval(fetchQueueAndHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/emails/queue/${id}/retry`, {
        method: "POST"
      });
      if (res.ok) {
        toast("Email scheduled for retry.", "success");
        fetchQueueAndHealth();
      } else {
        toast("Failed to schedule retry.", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Connection error", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/emails/queue/${id}/cancel`, {
        method: "POST"
      });
      if (res.ok) {
        toast("Email schedule cancelled.", "info");
        fetchQueueAndHealth();
      } else {
        toast("Failed to cancel dispatch.", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Connection error", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const filteredQueue = queue.filter(item => {
    if (statusFilter === "all") return true;
    if (statusFilter === "pending") return item.status === "pending" || item.status === "retry";
    return item.status === statusFilter;
  });

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === "sent") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-emerald-100 bg-emerald-50 text-emerald-700 font-extrabold text-[10px]">
          <CheckCircle className="w-3 h-3" /> Sent
        </span>
      );
    } else if (s === "processing" || s === "sending") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-blue-100 bg-blue-50 text-blue-700 font-extrabold text-[10px] animate-pulse">
          <Activity className="w-3 h-3 animate-spin" /> Sending
        </span>
      );
    } else if (s === "failed") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-rose-100 bg-rose-50 text-rose-700 font-extrabold text-[10px]">
          <XCircle className="w-3 h-3" /> Failed
        </span>
      );
    } else if (s === "cancelled") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-zinc-200 bg-zinc-100 text-zinc-600 font-bold text-[10px]">
          <Ban className="w-3 h-3" /> Cancelled
        </span>
      );
    } else if (s === "retry") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-amber-100 bg-amber-50 text-amber-700 font-bold text-[10px]">
          <RotateCcw className="w-3 h-3 animate-spin" /> Retrying
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-zinc-200 bg-zinc-50 text-zinc-600 font-bold text-[10px]">
          <Clock className="w-3 h-3" /> Scheduled
        </span>
      );
    }
  };

  return (
    <SidebarLayout>
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-950 tracking-tight">Outbox Dispatch Queue</h2>
          <p className="text-xs text-zinc-500">Monitor active worker claims, retry failures, and check heartbeats</p>
        </div>
        <button 
          onClick={fetchQueueAndHealth}
          disabled={loading}
          className="p-2 rounded bg-white border border-zinc-200 text-zinc-400 hover:text-zinc-600 transition-colors shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left 3 Columns: Queue list */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
            
            {/* Filter Bar */}
            <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Outbox Queue List ({filteredQueue.length})</span>
              
              <div className="flex items-center gap-2 text-xs">
                <Filter className="w-3.5 h-3.5 text-zinc-400" />
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1 bg-white border border-zinc-200 rounded text-xs font-semibold text-zinc-700 focus:outline-none"
                >
                  <option value="all">All Items</option>
                  <option value="pending">Pending / Retrying</option>
                  <option value="processing">Sending</option>
                  <option value="sent">Sent Successfully</option>
                  <option value="failed">Failed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {loading && queue.length === 0 ? (
              <div className="p-12 text-center text-xs text-zinc-400 font-semibold animate-pulse">
                Fetching queue from server...
              </div>
            ) : filteredQueue.length === 0 ? (
              <div className="p-12 text-center text-xs text-zinc-400 font-semibold italic">
                No scheduled emails found matching the selected filter.
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-100 text-zinc-400 font-bold uppercase text-[9px] tracking-wider">
                      <th className="p-4">Lead / Campaign</th>
                      <th className="p-4">Step</th>
                      <th className="p-4">Scheduled For</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Attempts</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredQueue.map((item) => (
                      <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="p-4 space-y-0.5">
                          <div className="font-bold text-zinc-900 truncate max-w-[150px]" title={item.lead_id}>
                            {item.lead_id}
                          </div>
                          <div className="text-[10px] text-zinc-400 truncate max-w-[150px]" title={item.campaign_id}>
                            {item.campaign_id}
                          </div>
                        </td>
                        <td className="p-4 font-mono font-bold text-zinc-500">
                          Step {item.sequence_step_id || "1"}
                        </td>
                        <td className="p-4 text-zinc-600 font-semibold font-mono">
                          {item.scheduled_for ? new Date(item.scheduled_for).toLocaleString() : new Date(item.scheduled_at).toLocaleString()}
                        </td>
                        <td className="p-4">
                          {getStatusBadge(item.status)}
                          {item.last_error && (
                            <div className="text-[9px] text-rose-500 font-bold max-w-[180px] truncate mt-1 flex items-center gap-1" title={item.last_error}>
                              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                              {item.last_error}
                            </div>
                          )}
                        </td>
                        <td className="p-4 font-mono font-bold text-zinc-700">
                          {item.attempts}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            {item.status === "failed" && (
                              <button
                                onClick={() => handleRetry(item.id)}
                                disabled={actionLoading !== null}
                                className="p-1 text-indigo-600 hover:bg-indigo-50 border border-zinc-200 bg-white rounded shadow-sm transition-all"
                                title="Retry dispatch"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            )}
                            {(item.status === "pending" || item.status === "retry" || item.status === "failed") && (
                              <button
                                onClick={() => handleCancel(item.id)}
                                disabled={actionLoading !== null}
                                className="p-1 text-rose-600 hover:bg-rose-50 border border-zinc-200 bg-white rounded shadow-sm transition-all"
                                title="Cancel dispatch"
                              >
                                <Ban className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </div>

        {/* Right 1 Column: Health Card */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-6 self-start">
          <div>
            <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Worker Health</h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">Live diagnostics of the background dispatch process</p>
          </div>

          <div className="space-y-4 text-xs">
            <div className={`p-4 rounded-lg border flex items-center justify-between font-bold ${
              health.status === "healthy" 
                ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                : "bg-rose-50 border-rose-100 text-rose-700 animate-pulse"
            }`}>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${health.status === "healthy" ? "bg-emerald-500" : "bg-rose-500"}`}></span>
                Worker Status:
              </div>
              <span className="uppercase text-[10px] tracking-wider">
                {health.status === "healthy" ? "Online" : "Offline"}
              </span>
            </div>

            {health.status === "healthy" ? (
              <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-lg space-y-1.5 text-[10px] font-mono text-zinc-500">
                <div><span className="font-semibold text-zinc-400">Heartbeat:</span> {new Date(health.last_heartbeat || "").toLocaleTimeString()}</div>
                <div><span className="font-semibold text-zinc-400">Environment:</span> {process.env.NODE_ENV || "development"}</div>
              </div>
            ) : (
              <div className="p-3 bg-rose-50/50 border border-rose-100 rounded-lg text-[10px] font-semibold text-rose-700 space-y-1">
                <div className="flex items-start gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Durable sending daemon process is not running. Launch it using:</span>
                </div>
                <div className="bg-zinc-900 text-zinc-200 p-2 rounded mt-2 font-mono text-[9px] select-all">
                  python -m app.services.durable_sending_worker
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </SidebarLayout>
  );
}
