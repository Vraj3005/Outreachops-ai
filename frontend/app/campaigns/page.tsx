"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { useToast } from "@/components/Toast";
import { 
  Play, Pause, RefreshCw, Sliders, 
  Clock, ShieldCheck, Send, Save
} from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  campaign_type: string;
  status: string;
  daily_send_limit: number;
  delay_seconds: number;
}

interface SummaryStats {
  sent_today: number;
  failed_today: number;
  remaining_today: number;
  approved_drafts: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function CampaignsPage() {
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  
  // Settings Form State
  const [campaignName, setCampaignName] = useState("Inbound Contractors Q3");
  const [campaignType, setCampaignType] = useState("erp");
  const [dailyLimit, setDailyLimit] = useState(50);
  const [delaySeconds, setDelaySeconds] = useState(60);
  const [sendOnlyApproved, setSendOnlyApproved] = useState(true);

  // Telemetry Metrics
  const [telemetry, setTelemetry] = useState<SummaryStats>({
    sent_today: 0,
    failed_today: 0,
    remaining_today: 50,
    approved_drafts: 0
  });

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const { toast } = useToast();

  const handleSendAllApproved = async () => {
    if (telemetry.approved_drafts === 0) {
      toast("No approved drafts available to send.", "error");
      return;
    }
    
    setSendingAll(true);
    toast("Starting bulk send of all approved emails...", "info");
    try {
      const res = await fetch(`${API_URL}/api/v1/emails/send-approved`, {
        method: "POST"
      });
      if (res.ok) {
        toast("Bulk dispatch initialized. Check logs/analytics for progress.", "success");
        setTimeout(fetchActiveCampaignAndTelemetry, 1500);
      } else {
        const err = await res.json();
        toast(err.detail || "Failed to start bulk send", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Network error during bulk dispatch request", "error");
    } finally {
      setSendingAll(false);
    }
  };

  const fetchActiveCampaignAndTelemetry = async () => {
    setLoading(true);
    try {
      // 1. Fetch active campaign
      const campRes = await fetch(`${API_URL}/api/v1/campaigns/active`);
      if (campRes.ok) {
        const campData: Campaign = await campRes.json();
        if (campData) {
          setActiveCampaign(campData);
          setCampaignName(campData.name);
          setCampaignType(campData.campaign_type);
          setDailyLimit(campData.daily_send_limit);
          setDelaySeconds(campData.delay_seconds);
        }
      }

      // 2. Fetch telemetry
      const telRes = await fetch(`${API_URL}/api/v1/analytics/summary`);
      if (telRes.ok) {
        const telData = await telRes.json();
        setTelemetry({
          sent_today: telData.sent_today,
          failed_today: telData.failed_today,
          remaining_today: telData.remaining_today,
          approved_drafts: telData.approved_drafts
        });
      }
    } catch (e) {
      console.error(e);
      toast("Error fetching campaign details from backend", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveCampaignAndTelemetry();
  }, []);

  const handleStartCampaign = async () => {
    setActionLoading(true);
    try {
      let res;
      if (activeCampaign) {
        // Update existing campaign to active status
        res = await fetch(`${API_URL}/api/v1/campaigns/${activeCampaign.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: campaignName,
            campaign_type: campaignType,
            daily_send_limit: dailyLimit,
            delay_seconds: delaySeconds,
            status: "active"
          })
        });
      } else {
        // Create new active campaign
        res = await fetch(`${API_URL}/api/v1/campaigns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: campaignName,
            campaign_type: campaignType,
            daily_send_limit: dailyLimit,
            delay_seconds: delaySeconds,
            status: "active",
            user_id: "d3b07384-d113-4ec2-a72d-86284f1837b2" // Default demo user
          })
        });
      }

      if (res.ok) {
        const camp: Campaign = await res.json();
        setActiveCampaign(camp);
        
        // Trigger background approved dispatcher
        const dispatcherRes = await fetch(`${API_URL}/api/v1/emails/send-approved`, { method: "POST" });
        
        if (dispatcherRes.ok) {
          toast(`Campaign '${campaignName}' is now active and approved dispatch loop has started.`);
        } else {
          toast(`Campaign activated but failed to spawn queue thread.`, "error");
        }
        
        fetchActiveCampaignAndTelemetry();
      } else {
        toast("Failed to activate campaign settings", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Connection error on campaign start", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePauseCampaign = async () => {
    if (!activeCampaign) return;
    setActionLoading(true);
    
    try {
      const res = await fetch(`${API_URL}/api/v1/campaigns/${activeCampaign.id}/pause`, { method: "POST" });
      if (res.ok) {
        const camp = await res.json();
        setActiveCampaign(camp);
        toast(`Campaign '${campaignName}' paused successfully. dispatches halted.`, "info");
        fetchActiveCampaignAndTelemetry();
      } else {
        toast("Failed to pause campaign runner", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Error communicating with campaign router", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopCampaign = async () => {
    if (!activeCampaign) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/campaigns/${activeCampaign.id}/pause`, { method: "POST" });
      if (res.ok) {
        const camp = await res.json();
        setActiveCampaign(camp);
        toast(`Campaign runner stopped.`, "info");
        fetchActiveCampaignAndTelemetry();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setActionLoading(true);
    try {
      let res;
      if (activeCampaign) {
        // Update existing campaign parameters without status changes
        res = await fetch(`${API_URL}/api/v1/campaigns/${activeCampaign.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: campaignName,
            campaign_type: campaignType,
            daily_send_limit: dailyLimit,
            delay_seconds: delaySeconds
          })
        });
      } else {
        // Create new campaign with paused status
        res = await fetch(`${API_URL}/api/v1/campaigns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: campaignName,
            campaign_type: campaignType,
            daily_send_limit: dailyLimit,
            delay_seconds: delaySeconds,
            status: "paused",
            user_id: "d3b07384-d113-4ec2-a72d-86284f1837b2"
          })
        });
      }

      if (res.ok) {
        const camp = await res.json();
        setActiveCampaign(camp);
        toast("Campaign parameters saved successfully.", "success");
        fetchActiveCampaignAndTelemetry();
      } else {
        const err = await res.json();
        toast(err.detail || "Failed to save campaign parameters", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Error saving campaign parameters", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const isRunning = activeCampaign?.status === "active";

  return (
    <SidebarLayout>
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-950 tracking-tight">Campaign Scheduler</h2>
          <p className="text-xs text-zinc-500">Configure background queue runners to dispatch approved drafts</p>
        </div>
        <button 
          onClick={fetchActiveCampaignAndTelemetry}
          disabled={loading}
          className="p-2 rounded bg-white border border-zinc-200 text-zinc-400 hover:text-zinc-600 transition-colors shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Configuration settings form */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-6 lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-4">
            <Sliders className="w-4 h-4 text-zinc-500" />
            <h3 className="font-bold text-zinc-900 text-sm">Campaign Runner Parameters</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Campaign Identifier</label>
              <input 
                type="text" 
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
                placeholder="e.g. Q3 HVAC Outreach"
                className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
              />
            </div>

            <div className="pb-1.5 select-none">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-zinc-600 font-medium">
                <input 
                  type="checkbox" 
                  checked={sendOnlyApproved}
                  onChange={e => setSendOnlyApproved(e.target.checked)}
                  disabled
                  className="rounded bg-white border border-zinc-200 text-zinc-900 focus:ring-0 w-4 h-4 cursor-not-allowed"
                />
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-4.5 h-4.5 text-emerald-600" />
                  Send only approved drafts (Enforced)
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Daily Send Limit Cap</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={dailyLimit}
                    onChange={e => setDailyLimit(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-mono"
                  />
                  <span className="text-[9px] text-zinc-400 absolute right-3 top-3 font-semibold uppercase">emails / day</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Inter-Send Spacing delay</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={delaySeconds}
                    onChange={e => setDelaySeconds(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-mono"
                  />
                  <span className="text-[9px] text-zinc-400 absolute right-3 top-3 font-semibold uppercase">seconds</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action triggers */}
          <div className="pt-6 border-t border-zinc-100 flex gap-3">
            {!isRunning ? (
              <button 
                onClick={handleStartCampaign}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {activeCampaign ? "Resume Campaign" : "Start Campaign"}
              </button>
            ) : (
              <button 
                onClick={handlePauseCampaign}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-all"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                Pause Campaign
              </button>
            )}

            {isRunning && (
              <button 
                onClick={handleStopCampaign}
                disabled={actionLoading}
                className="px-4 py-2 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition-all shadow-sm"
              >
                Stop Runner
              </button>
            )}

            <button 
              onClick={handleSaveSettings}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 px-4 py-2 border border-zinc-200 bg-white hover:bg-zinc-50 disabled:opacity-40 text-zinc-700 rounded-lg text-xs font-bold transition-all shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              Save Settings
            </button>
          </div>
        </div>

        {/* Status display widgets */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-6">
          <div>
            <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Runner Telemetry Status</h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">Live updates of back-end queue processes</p>
          </div>

          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 flex items-center justify-between">
              <span className="text-zinc-500 font-semibold">Current Status:</span>
              <span className={`font-bold uppercase text-[9px] tracking-wider px-2.5 py-0.5 rounded-full border ${
                isRunning 
                  ? "bg-emerald-50 border-emerald-100 text-emerald-700 animate-pulse" 
                  : activeCampaign?.status === "paused"
                  ? "bg-amber-50 border-amber-100 text-amber-700"
                  : "bg-zinc-100 border-zinc-200 text-zinc-500"
              }`}>
                {activeCampaign ? activeCampaign.status : "Idle"}
              </span>
            </div>

            {/* Campaign Run metrics */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-zinc-50 border border-zinc-200 p-2.5 rounded text-center">
                <div className="text-[8px] uppercase font-bold text-zinc-400">Sent Today</div>
                <div className="text-xs font-mono font-extrabold text-emerald-700 mt-0.5">{telemetry.sent_today}</div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 p-2.5 rounded text-center">
                <div className="text-[8px] uppercase font-bold text-zinc-400">Failed Today</div>
                <div className="text-xs font-mono font-extrabold text-rose-700 mt-0.5">{telemetry.failed_today}</div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 p-2.5 rounded text-center">
                <div className="text-[8px] uppercase font-bold text-zinc-400">Approved Left</div>
                <div className="text-xs font-mono font-extrabold text-indigo-700 mt-0.5">{telemetry.approved_drafts}</div>
              </div>
            </div>

            <button
              onClick={handleSendAllApproved}
              disabled={sendingAll || telemetry.approved_drafts === 0}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white font-bold rounded-lg text-xs transition-all shadow-sm font-semibold"
            >
              <Send className="w-3.5 h-3.5" />
              {sendingAll ? "Sending..." : `Send All ${telemetry.approved_drafts} Approved Emails`}
            </button>

            <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-zinc-500 font-semibold">Daily Cap Used:</span>
                <span className="font-bold text-zinc-800">{telemetry.sent_today} / {dailyLimit} sent</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-zinc-950 transition-all duration-300" 
                  style={{ width: `${Math.min(100, (telemetry.sent_today / dailyLimit) * 100)}%` }}
                ></div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-zinc-500 font-semibold">Queue delay spacing:</span>
                <span className="font-bold text-zinc-800 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  {delaySeconds}s delay
                </span>
              </div>
              <div className="flex justify-between border-t border-zinc-100 pt-1.5 mt-1.5">
                <span className="text-zinc-500 font-semibold">Remaining capacity:</span>
                <span className="font-bold text-indigo-600">{telemetry.remaining_today} emails</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </SidebarLayout>
  );
}
