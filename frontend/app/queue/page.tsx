"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { 
  Clock, RefreshCw, AlertTriangle, CheckCircle, 
  XCircle, RotateCcw, Ban, Activity, Filter,
  Play, Pause, Cpu, Database, AlertCircle, ShieldAlert,
  Trash2, Calendar, Zap, X, Square, CheckSquare
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
  sequence_step_id?: string | number | null;
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
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [controlsLoading, setControlsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();

  // Selection and Rescheduling states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleStrategy, setRescheduleStrategy] = useState<"staggered" | "immediate" | "delayed">("staggered");
  const [rescheduleInterval, setRescheduleInterval] = useState(1);
  const [rescheduleDelay, setRescheduleDelay] = useState(5);
  const [rescheduleStartTime, setRescheduleStartTime] = useState("");
  const [rescheduleTarget, setRescheduleTarget] = useState<"selected" | "all">("selected");

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

  const handleToggleSelectAll = (filteredQueue: ScheduledEmail[]) => {
    const selectable = filteredQueue.filter(item => item.status === "pending" || item.status === "retry" || item.status === "failed");
    if (selectedIds.size === selectable.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectable.map(item => item.id)));
    }
  };

  const handleBulkReschedule = async () => {
    const idsToReschedule = rescheduleTarget === "selected" 
      ? Array.from(selectedIds) 
      : queue.filter(item => item.status === "pending" || item.status === "retry" || item.status === "failed").map(item => item.id);

    if (idsToReschedule.length === 0) {
      toast("No eligible queue items to reschedule.", "error");
      return;
    }

    setActionLoading("bulk-reschedule");
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/api/v1/emails/queue/bulk-reschedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          queue_ids: idsToReschedule,
          strategy: rescheduleStrategy,
          start_time_iso: rescheduleStartTime || null,
          stagger_interval_minutes: rescheduleInterval,
          delay_minutes: rescheduleDelay
        })
      });

      if (res.ok) {
        const data = await res.json();
        toast(data.message || `Successfully rescheduled ${idsToReschedule.length} emails.`, "success");
        setShowRescheduleModal(false);
        setSelectedIds(new Set());
        fetchQueueAndHealth();
      } else {
        const err = await res.json();
        toast(err.detail || "Failed to bulk reschedule.", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Connection error during bulk reschedule.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const getAuthToken = async (): Promise<string> => {
    let token = "mock-owner-token"; // Default for demo mode bypass
    try {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          token = data.session.access_token;
        }
      } else {
        // Scrape localStorage for active JWT tokens
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes("auth-token")) {
            const val = localStorage.getItem(key);
            if (val) {
              const parsed = JSON.parse(val);
              if (parsed.access_token) {
                token = parsed.access_token;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Could not retrieve active session token:", e);
    }
    return token;
  };

  const fetchQueueAndHealth = async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const headers: Record<string, string> = {
        "Authorization": `Bearer ${token}`
      };

      // 1. Fetch Queue items
      const qRes = await fetch(`${API_URL}/api/v1/emails/queue`, { headers });
      if (qRes.ok) {
        const qData = await qRes.json();
        setQueue(qData || []);
      }

      // 2. Fetch Detailed Diagnostics
      const diagRes = await fetch(`${API_URL}/api/v1/health/diagnostics`, { headers });
      if (diagRes.ok) {
        const diagData = await diagRes.json();
        setDiagnostics(diagData);
        setHealth(diagData.workers.sending_worker);
      } else {
        // Fallback to simple health endpoint if diagnostics is not authorized
        const hRes = await fetch(`${API_URL}/api/v1/emails/worker-health`, { headers });
        if (hRes.ok) {
          const hData = await hRes.json();
          setHealth(hData);
        } else {
          setHealth({ status: "offline", reason: "API health check failed" });
        }
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
    // Poll every 15 seconds for live status changes (diagnostics endpoint is heavy)
    const interval = setInterval(fetchQueueAndHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async (id: string) => {
    setActionLoading(id);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/api/v1/emails/queue/${id}/retry`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
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
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/api/v1/emails/queue/${id}/cancel`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
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

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this email from the sending queue?")) {
      return;
    }
    setActionLoading(id);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/api/v1/emails/queue/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.ok) {
        toast("Email queue item deleted.", "info");
        fetchQueueAndHealth();
      } else {
        toast("Failed to delete queue item.", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Connection error", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const toggleWorkerControl = async (field: string, currentValue: boolean) => {
    setControlsLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/api/v1/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          [field]: !currentValue
        })
      });
      if (res.ok) {
        toast("Worker controls updated.", "success");
        fetchQueueAndHealth();
      } else {
        toast("Failed to update worker controls.", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Connection error", "error");
    } finally {
      setControlsLoading(false);
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
          <h2 className="text-lg font-bold text-zinc-950 tracking-tight">Outbox & Worker Control Dashboard</h2>
          <p className="text-xs text-zinc-500">Monitor queue depth, pause/resume processes, and view real-time engine diagnostics</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setRescheduleTarget("all");
              setShowRescheduleModal(true);
            }}
            className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-bold flex items-center gap-1 transition-all shadow-sm"
            title="Bulk reschedule all pending/failed items"
          >
            <Calendar className="w-3.5 h-3.5" />
            Reschedule All
          </button>
          <button 
            onClick={fetchQueueAndHealth}
            disabled={loading}
            className="p-2 rounded bg-white border border-zinc-200 text-zinc-400 hover:text-zinc-600 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
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
                      <th className="p-4 w-10">
                        <button
                          type="button"
                          onClick={() => handleToggleSelectAll(filteredQueue)}
                          className="text-zinc-400 hover:text-zinc-650 transition-colors"
                        >
                          {selectedIds.size > 0 && selectedIds.size === filteredQueue.filter(item => item.status === "pending" || item.status === "retry" || item.status === "failed").length ? (
                            <CheckSquare className="w-4 h-4 text-zinc-900" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
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
                        <td className="p-4">
                          <button
                            type="button"
                            onClick={() => handleToggleSelectRow(item.id)}
                            disabled={!(item.status === "pending" || item.status === "retry" || item.status === "failed")}
                            className="text-zinc-400 hover:text-zinc-650 transition-colors disabled:opacity-30"
                          >
                            {selectedIds.has(item.id) ? (
                              <CheckSquare className="w-4 h-4 text-zinc-900" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>
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
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {(item.status === "pending" || item.status === "retry" || item.status === "failed") && (
                              <button
                                onClick={() => handleCancel(item.id)}
                                disabled={actionLoading !== null}
                                className="p-1 text-rose-600 hover:bg-rose-50 border border-zinc-200 bg-white rounded shadow-sm transition-all"
                                title="Cancel dispatch"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(item.id)}
                              disabled={actionLoading !== null}
                              className="p-1 text-rose-700 hover:bg-rose-100 border border-zinc-200 bg-white rounded shadow-sm transition-all"
                              title="Delete from queue"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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

        {/* Right 1 Column: Diagnostics Panel */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Section: Operational Controls */}
          <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
            <div>
              <h3 className="text-xs font-extrabold text-zinc-800 uppercase tracking-wider">Engine Controls</h3>
              <p className="text-[10px] text-zinc-400">Pause background workers or enable queue draining</p>
            </div>

            <div className="space-y-3.5 pt-2">
              {/* Control: Sending Worker */}
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-700">Outbox Dispatcher</span>
                <button
                  onClick={() => toggleWorkerControl("sending_worker_paused", !!diagnostics?.controls?.sending_worker_paused)}
                  disabled={controlsLoading}
                  className={`px-3 py-1.5 rounded-lg border font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm ${
                    diagnostics?.controls?.sending_worker_paused
                      ? "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100"
                      : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  {diagnostics?.controls?.sending_worker_paused ? (
                    <>
                      <Pause className="w-3 h-3" /> Paused
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3" /> Running
                    </>
                  )}
                </button>
              </div>

              {/* Control: Generation Worker */}
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-700">AI Draft Generator</span>
                <button
                  onClick={() => toggleWorkerControl("generation_worker_paused", !!diagnostics?.controls?.generation_worker_paused)}
                  disabled={controlsLoading}
                  className={`px-3 py-1.5 rounded-lg border font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm ${
                    diagnostics?.controls?.generation_worker_paused
                      ? "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100"
                      : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  {diagnostics?.controls?.generation_worker_paused ? (
                    <>
                      <Pause className="w-3 h-3" /> Paused
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3" /> Running
                    </>
                  )}
                </button>
              </div>

              {/* Control: Queue Drain */}
              <div className="flex items-center justify-between text-xs border-t border-zinc-100 pt-3">
                <div className="flex flex-col">
                  <span className="font-semibold text-zinc-700">Queue Draining</span>
                  <span className="text-[9px] text-zinc-400">Finish existing, block new</span>
                </div>
                <button
                  onClick={() => toggleWorkerControl("queue_drain_enabled", !!diagnostics?.controls?.queue_drain_enabled)}
                  disabled={controlsLoading}
                  className={`px-3 py-1.5 rounded-lg border font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm ${
                    diagnostics?.controls?.queue_drain_enabled
                      ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 animate-pulse"
                      : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  {diagnostics?.controls?.queue_drain_enabled ? "Enabled" : "Disabled"}
                </button>
              </div>
            </div>
          </div>

          {/* Section: Worker Heartbeats */}
          <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
            <div>
              <h3 className="text-xs font-extrabold text-zinc-800 uppercase tracking-wider">Worker Heartbeats</h3>
              <p className="text-[10px] text-zinc-400">Real-time status of backend tasks</p>
            </div>

            <div className="space-y-3 text-xs">
              {/* Sending Worker status */}
              <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-lg space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-zinc-600 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-indigo-500" /> Outbox Daemon
                  </span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                    diagnostics?.workers?.sending_worker?.status === "healthy"
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                      : "bg-rose-100 text-rose-800 border border-rose-200"
                  }`}>
                    {diagnostics?.workers?.sending_worker?.status === "healthy" ? "Online" : "Offline"}
                  </span>
                </div>
                {diagnostics?.workers?.sending_worker?.last_heartbeat && (
                  <div className="text-[9px] font-mono text-zinc-400">
                    Last Tick: {new Date(diagnostics.workers.sending_worker.last_heartbeat).toLocaleTimeString()}
                  </div>
                )}
              </div>

              {/* Generation Worker status */}
              <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-lg space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-zinc-600 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-blue-500" /> Gen Daemon
                  </span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                    diagnostics?.workers?.generation_worker?.status === "healthy"
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                      : "bg-rose-100 text-rose-800 border border-rose-200"
                  }`}>
                    {diagnostics?.workers?.generation_worker?.status === "healthy" ? "Online" : "Offline"}
                  </span>
                </div>
                {diagnostics?.workers?.generation_worker?.last_heartbeat && (
                  <div className="text-[9px] font-mono text-zinc-400">
                    Last Tick: {new Date(diagnostics.workers.generation_worker.last_heartbeat).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section: Service Pings */}
          <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
            <div>
              <h3 className="text-xs font-extrabold text-zinc-800 uppercase tracking-wider">Services Integration</h3>
              <p className="text-[10px] text-zinc-400">Status of third-party APIs and connections</p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-zinc-50">
                <span className="text-zinc-600 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-zinc-400" /> Database Link
                </span>
                <span className={`font-bold ${diagnostics?.database?.status === "connected" ? "text-emerald-600" : "text-rose-600 animate-pulse"}`}>
                  {diagnostics?.database?.status === "connected" ? "Connected" : "Disconnected"}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-zinc-50">
                <span className="text-zinc-600 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-zinc-400" /> Gmail API Auth
                </span>
                <span className={`font-bold ${diagnostics?.gmail?.status === "connected" ? "text-emerald-600" : "text-rose-600"}`}>
                  {diagnostics?.gmail?.status === "connected" ? "Authenticated" : "Disconnected"}
                </span>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-zinc-600 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-zinc-400" /> Gemini AI Service
                </span>
                <span className={`font-bold ${
                  diagnostics?.gemini?.status === "connected" 
                    ? "text-emerald-600" 
                    : diagnostics?.gemini?.status === "unconfigured" 
                    ? "text-zinc-400" 
                    : "text-rose-600"
                }`}>
                  {diagnostics?.gemini?.status === "connected" ? "Active" : diagnostics?.gemini?.status === "unconfigured" ? "Unconfigured" : "Failed"}
                </span>
              </div>
            </div>
          </div>

          {/* Section: Queue Metrics & DLQ */}
          <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
            <div>
              <h3 className="text-xs font-extrabold text-zinc-800 uppercase tracking-wider">Metrics & Alerts</h3>
              <p className="text-[10px] text-zinc-400">Queue health depth and dead-letter counts</p>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-zinc-50 p-2.5 rounded-lg border border-zinc-100">
                  <div className="text-lg font-black text-zinc-800">
                    {diagnostics?.queues?.send_queue_pending || 0}
                  </div>
                  <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wide">Outbox Pending</div>
                </div>
                <div className="bg-zinc-50 p-2.5 rounded-lg border border-zinc-100">
                  <div className="text-lg font-black text-zinc-800">
                    {diagnostics?.queues?.generation_queue_pending || 0}
                  </div>
                  <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wide">Gen Pending</div>
                </div>
              </div>

              {/* DLQ alerts if failures exist */}
              {((diagnostics?.retries_and_failures?.dead_letter_count || 0) > 0 || (diagnostics?.stuck_jobs?.send_stuck_count || 0) > 0) ? (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg space-y-2">
                  <div className="flex items-center gap-1.5 text-rose-800 font-extrabold text-[10px] uppercase">
                    <ShieldAlert className="w-4 h-4 text-rose-600" /> Action Required
                  </div>
                  <div className="text-[10px] text-rose-700 font-semibold space-y-1">
                    {diagnostics?.retries_and_failures?.dead_letter_count > 0 && (
                      <div>• {diagnostics.retries_and_failures.dead_letter_count} permanently failed items in Dead Letter.</div>
                    )}
                    {(diagnostics?.stuck_jobs?.send_stuck_count > 0 || diagnostics?.stuck_jobs?.generation_stuck_count > 0) && (
                      <div>• Stuck jobs detected: send={diagnostics.stuck_jobs.send_stuck_count}, gen={diagnostics.stuck_jobs.generation_stuck_count}.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-lg flex items-center gap-2 text-[10px] text-emerald-800 font-bold">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  All queue operations healthy. No stuck items.
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md border border-zinc-200/80 px-6 py-3 rounded-full shadow-xl z-30 flex items-center gap-4 animate-fade-in text-xs font-semibold text-zinc-800">
          <span>{selectedIds.size} items selected</span>
          <div className="h-4 w-px bg-zinc-200" />
          <button
            onClick={() => {
              setRescheduleTarget("selected");
              setShowRescheduleModal(true);
            }}
            className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-full font-bold flex items-center gap-1 transition-all"
          >
            <Calendar className="w-3.5 h-3.5" />
            Custom Reschedule
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-zinc-500 hover:text-zinc-800"
          >
            Clear Selection
          </button>
        </div>
      )}

      {/* Reschedule Modal */}
      {showRescheduleModal && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-zinc-200 shadow-2xl overflow-hidden animate-fade-in text-left">
            <div className="p-6 border-b border-zinc-100 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-zinc-950">Bulk Custom Reschedule</h3>
                <p className="text-[10px] text-zinc-500">Stagger, delay, or send queue items immediately.</p>
              </div>
              <button 
                onClick={() => setShowRescheduleModal(false)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs font-medium text-zinc-700">
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1.5">Reschedule Strategy</span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRescheduleStrategy("staggered")}
                    className={`py-2 px-3 rounded-lg border text-center font-bold transition-all ${rescheduleStrategy === "staggered" ? "border-zinc-950 bg-zinc-50 text-zinc-950" : "border-zinc-200 hover:bg-zinc-50 text-zinc-500"}`}
                  >
                    Staggered
                  </button>
                  <button
                    type="button"
                    onClick={() => setRescheduleStrategy("immediate")}
                    className={`py-2 px-3 rounded-lg border text-center font-bold transition-all ${rescheduleStrategy === "immediate" ? "border-zinc-950 bg-zinc-50 text-zinc-950" : "border-zinc-200 hover:bg-zinc-50 text-zinc-500"}`}
                  >
                    Immediate
                  </button>
                  <button
                    type="button"
                    onClick={() => setRescheduleStrategy("delayed")}
                    className={`py-2 px-3 rounded-lg border text-center font-bold transition-all ${rescheduleStrategy === "delayed" ? "border-zinc-950 bg-zinc-50 text-zinc-950" : "border-zinc-200 hover:bg-zinc-50 text-zinc-500"}`}
                  >
                    Delay Offset
                  </button>
                </div>
              </div>

              {rescheduleStrategy === "staggered" && (
                <div className="space-y-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Starting Time (UTC/Local ISO)</label>
                    <input
                      type="text"
                      value={rescheduleStartTime}
                      onChange={e => setRescheduleStartTime(e.target.value)}
                      placeholder="e.g. 2026-07-16T15:00:00 (Blank for Now)"
                      className="w-full px-2.5 py-1.5 rounded border border-zinc-200 text-xs font-mono bg-white text-zinc-800 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Interval Spacing (Minutes)</label>
                    <input
                      type="number"
                      value={rescheduleInterval}
                      onChange={e => setRescheduleInterval(parseInt(e.target.value) || 1)}
                      min={1}
                      className="w-full px-2.5 py-1.5 rounded border border-zinc-200 text-xs font-mono bg-white text-zinc-800 focus:outline-none"
                    />
                    <span className="text-[9px] text-zinc-400 block mt-1">Emails will be scheduled at {rescheduleInterval}-minute intervals from start time.</span>
                  </div>
                </div>
              )}

              {rescheduleStrategy === "delayed" && (
                <div className="space-y-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Delay Duration (Minutes)</label>
                    <input
                      type="number"
                      value={rescheduleDelay}
                      onChange={e => setRescheduleDelay(parseInt(e.target.value) || 0)}
                      min={1}
                      className="w-full px-2.5 py-1.5 rounded border border-zinc-200 text-xs font-mono bg-white text-zinc-800 focus:outline-none"
                    />
                    <span className="text-[9px] text-zinc-400 block mt-1">Emails will be offset by {rescheduleDelay} minutes from now.</span>
                  </div>
                </div>
              )}

              {rescheduleStrategy === "immediate" && (
                <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 text-[10px] text-zinc-500 font-medium">
                  Queue items will be marked as pending with a schedule date set to &quot;Now&quot; and attempts set to 0. They will dispatch on the next worker run ticks.
                </div>
              )}
            </div>

            <div className="p-6 bg-zinc-50 border-t border-zinc-100 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowRescheduleModal(false)}
                className="px-4 py-2 border border-zinc-200 hover:bg-zinc-100 text-zinc-700 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkReschedule}
                className="px-4 py-2 bg-zinc-950 hover:bg-zinc-850 text-white rounded-lg text-xs font-bold font-sans"
              >
                Apply Reschedule
              </button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
