"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { useToast } from "@/components/Toast";
import { 
  Play, Pause, RefreshCw, Sliders, 
  Clock, ShieldCheck, Send, Save, Plus,
  Copy, Trash2, Archive, ArrowRight, ArrowLeft,
  Sparkles, Check, Info, FileText
} from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  campaign_type: string;
  status: string;
  daily_send_limit: number;
  delay_seconds: number;
  preset?: string;
  objective?: string;
  description?: string;
  offer?: string;
  value_proposition?: string;
  proof_points?: string;
  required_facts?: string;
  prohibited_claims?: string;
  target_industry?: string;
  target_roles?: string;
  countries?: string;
  tags?: string[];
  min_lead_fit_score?: number;
  selected_leads?: string[];
  tone?: string;
  email_length?: string;
  language?: string;
  CTA?: string;
  required_content?: string[];
  banned_content?: string[];
  prompt_template_id?: string;
  sequence_id?: string;
  timezone?: string;
  send_spacing_seconds?: number;
  sending_window_start?: string;
  sending_window_end?: string;
  start_date?: string;
  approval_mode?: string;
  cloned_from_id?: string;
}

interface SummaryStats {
  sent_today: number;
  failed_today: number;
  remaining_today: number;
  approved_drafts: number;
}

interface PreviewDraft {
  subject: string;
  body: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const PRESET_OPTIONS = [
  "Introduce a service",
  "Offer a product",
  "Book a demo",
  "Request a partnership",
  "Recruitment outreach",
  "Event invitation",
  "Re-engagement",
  "Custom"
];

const TONE_OPTIONS = [
  "professional",
  "casual",
  "formal",
  "bold",
  "premium-simple",
  "academic",
  "friendly"
];

const LENGTH_OPTIONS = [
  { value: "short", label: "Short (60-90 words)" },
  { value: "medium", label: "Medium (100-150 words)" },
  { value: "long", label: "Long (150+ words)" }
];

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  
  // Wizard Modal State
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [previewDrafts, setPreviewDrafts] = useState<PreviewDraft[]>([]);
  const [loadingPreviews, setLoadingPreviews] = useState(false);
  
  // Wizard Form fields state
  const [wizardName, setWizardName] = useState("");
  const [wizardPreset, setWizardPreset] = useState("Introduce a service");
  const [wizardObjective, setWizardObjective] = useState("");
  const [wizardCustomObjective, setWizardCustomObjective] = useState("");
  const [wizardDescription, setWizardDescription] = useState("");
  
  const [wizardOffer, setWizardOffer] = useState("");
  const [wizardValProp, setWizardValProp] = useState("");
  const [wizardProofPoints, setWizardProofPoints] = useState("");
  const [wizardRequiredFacts, setWizardRequiredFacts] = useState("");
  const [wizardProhibitedClaims, setWizardProhibitedClaims] = useState("");
  
  const [wizardIndustry, setWizardIndustry] = useState("");
  const [wizardRoles, setWizardRoles] = useState("");
  const [wizardCountries, setWizardCountries] = useState("");
  const [wizardTagsInput, setWizardTagsInput] = useState("");
  const [wizardMinScore, setWizardMinScore] = useState(0);
  
  const [wizardTone, setWizardTone] = useState("professional");
  const [wizardLength, setWizardLength] = useState("medium");
  const [wizardLanguage, setWizardLanguage] = useState("en");
  const [wizardCTA, setWizardCTA] = useState("");
  const [wizardReqInput, setWizardReqInput] = useState("");
  const [wizardBannedInput, setWizardBannedInput] = useState("");
  const [wizardPromptId, setWizardPromptId] = useState("");
  
  const [wizardSequenceId, setWizardSequenceId] = useState("");
  
  const [wizardTimezone, setWizardTimezone] = useState("UTC");
  const [wizardDailyLimit, setWizardDailyLimit] = useState(50);
  const [wizardSpacing, setWizardSpacing] = useState(60);
  const [wizardWindowStart, setWizardWindowStart] = useState("09:00");
  const [wizardWindowEnd, setWizardWindowEnd] = useState("17:00");
  const [wizardStartDate, setWizardStartDate] = useState("");
  const [wizardApprovalMode, setWizardApprovalMode] = useState("manual");

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

  const fetchCampaignsAndTelemetry = async () => {
    setLoading(true);
    try {
      // 1. Fetch campaigns list
      const listRes = await fetch(`${API_URL}/api/v1/campaigns`);
      if (listRes.ok) {
        const listData = await listRes.json();
        // filter out archived for main display or display them at bottom
        setCampaigns(listData || []);
        
        // Find first active campaign
        const active = listData.find((c: Campaign) => c.status === "active");
        if (active) {
          setActiveCampaign(active);
        } else if (listData.length > 0) {
          // Default to first paused if none active
          setActiveCampaign(listData[0]);
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
      toast("Error fetching campaigns data from backend", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaignsAndTelemetry();
  }, []);

  const handleSendAllApproved = async () => {
    if (telemetry.approved_drafts === 0) {
      toast("No approved drafts available to send.", "error");
      return;
    }
    setSendingAll(true);
    toast("Starting bulk send of approved emails...", "info");
    try {
      const res = await fetch(`${API_URL}/api/v1/emails/send-approved`, {
        method: "POST"
      });
      if (res.ok) {
        toast("Bulk dispatch initiated successfully.", "success");
        setTimeout(fetchCampaignsAndTelemetry, 1500);
      } else {
        const err = await res.json();
        toast(err.detail || "Failed to start send", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Network error during bulk dispatch", "error");
    } finally {
      setSendingAll(false);
    }
  };

  const handlePauseCampaign = async (id: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/campaigns/${id}/pause`, { method: "POST" });
      if (res.ok) {
        toast("Campaign paused successfully.", "info");
        fetchCampaignsAndTelemetry();
      } else {
        toast("Failed to pause campaign", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Connection error", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResumeCampaign = async (id: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/campaigns/${id}/resume`, { method: "POST" });
      if (res.ok) {
        toast("Campaign activated and running.", "success");
        fetchCampaignsAndTelemetry();
      } else {
        toast("Failed to activate campaign", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Connection error", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloneCampaign = async (id: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/campaigns/${id}/clone`, { method: "POST" });
      if (res.ok) {
        toast("Campaign cloned successfully into draft copy.", "success");
        fetchCampaignsAndTelemetry();
      } else {
        toast("Failed to clone campaign", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Connection error", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchiveCampaign = async (id: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/campaigns/${id}/archive`, { method: "POST" });
      if (res.ok) {
        toast("Campaign archived.", "info");
        fetchCampaignsAndTelemetry();
      } else {
        toast("Failed to archive campaign", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Connection error", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Generate previews inside Wizard step 7
  const generateWizardPreviews = async () => {
    setLoadingPreviews(true);
    try {
      const parsedReq = {
        objective: wizardPreset === "Custom" ? wizardCustomObjective : wizardPreset,
        offer: wizardOffer,
        value_proposition: wizardValProp,
        tone: wizardTone,
        email_length: wizardLength,
        CTA: wizardCTA,
        banned_content: wizardBannedInput.split(",").map(t => t.trim()).filter(Boolean)
      };
      
      const res = await fetch(`${API_URL}/api/v1/campaigns/preview-drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedReq)
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewDrafts(data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPreviews(false);
    }
  };

  const handleNextStep = () => {
    if (wizardStep === 6) {
      generateWizardPreviews();
    }
    setWizardStep(prev => Math.min(prev + 1, 7));
  };

  const handlePrevStep = () => {
    setWizardStep(prev => Math.max(prev - 1, 1));
  };

  // Save campaign from Wizard
  const handleSaveCampaign = async (activateImmediately: boolean) => {
    setActionLoading(true);
    try {
      const objectiveText = wizardPreset === "Custom" ? wizardCustomObjective : wizardPreset;
      const tagsList = wizardTagsInput.split(",").map(t => t.trim()).filter(Boolean);
      const reqList = wizardReqInput.split(",").map(t => t.trim()).filter(Boolean);
      const bannedList = wizardBannedInput.split(",").map(t => t.trim()).filter(Boolean);

      const campaignPayload = {
        name: wizardName || "Generic outreach campaign",
        campaign_type: "generic",
        status: activateImmediately ? "active" : "paused",
        daily_send_limit: wizardDailyLimit,
        delay_seconds: 5,
        preset: wizardPreset,
        objective: objectiveText,
        description: wizardDescription,
        offer: wizardOffer,
        value_proposition: wizardValProp,
        proof_points: wizardProofPoints,
        required_facts: wizardRequiredFacts,
        prohibited_claims: wizardProhibitedClaims,
        target_industry: wizardIndustry,
        target_roles: wizardRoles,
        countries: wizardCountries,
        tags: tagsList,
        min_lead_fit_score: wizardMinScore,
        tone: wizardTone,
        email_length: wizardLength,
        language: wizardLanguage,
        CTA: wizardCTA,
        required_content: reqList,
        banned_content: bannedList,
        prompt_template_id: wizardPromptId || null,
        sequence_id: wizardSequenceId || null,
        timezone: wizardTimezone,
        send_spacing_seconds: wizardSpacing,
        sending_window_start: wizardWindowStart,
        sending_window_end: wizardWindowEnd,
        start_date: wizardStartDate || null,
        approval_mode: wizardApprovalMode
      };

      const res = await fetch(`${API_URL}/api/v1/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaignPayload)
      });

      if (res.ok) {
        toast(`Campaign '${wizardName}' created successfully!`, "success");
        setShowWizard(false);
        setWizardStep(1);
        // Reset states
        setWizardName("");
        setWizardObjective("");
        setWizardOffer("");
        setWizardValProp("");
        setWizardCTA("");
        fetchCampaignsAndTelemetry();
      } else {
        const err = await res.json();
        toast(err.detail || "Failed to create campaign", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Error saving wizard campaign", "error");
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
          <h2 className="text-lg font-bold text-zinc-950 tracking-tight">Generic Campaigns Manager</h2>
          <p className="text-xs text-zinc-500">Launch outreach wizards, clone configurations, and manage queues</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowWizard(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            New Campaign
          </button>
          <button 
            onClick={fetchCampaignsAndTelemetry}
            disabled={loading}
            className="p-2 rounded bg-white border border-zinc-200 text-zinc-400 hover:text-zinc-600 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Campaigns List */}
        <div className="space-y-4 lg:col-span-2">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Outreach Campaigns ({campaigns.length})</span>
              <Sliders className="w-3.5 h-3.5 text-zinc-400" />
            </div>

            {loading ? (
              <div className="p-12 text-center text-xs text-zinc-400 font-semibold animate-pulse">
                Fetching campaigns database...
              </div>
            ) : campaigns.length === 0 ? (
              <div className="p-12 text-center text-xs text-zinc-400 font-semibold">
                No campaigns configured yet. Launch the wizard above!
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {campaigns.map((camp) => (
                  <div key={camp.id} className="p-6 hover:bg-zinc-50 transition-colors space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-zinc-900 text-sm flex items-center gap-2">
                          {camp.name}
                          <span className={`text-[8px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                            camp.status === "active"
                              ? "bg-emerald-50 border-emerald-100 text-emerald-700 font-extrabold animate-pulse"
                              : camp.status === "paused"
                              ? "bg-amber-50 border-amber-100 text-amber-700"
                              : "bg-zinc-100 border-zinc-200 text-zinc-500"
                          }`}>
                            {camp.status}
                          </span>
                        </h4>
                        <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">Objective: {camp.objective || "Generic Outreach"}</p>
                      </div>
                      
                      {/* Action buttons */}
                      <div className="flex gap-1.5">
                        {camp.status !== "active" ? (
                          <button
                            onClick={() => handleResumeCampaign(camp.id)}
                            disabled={actionLoading}
                            className="p-1.5 bg-zinc-100 text-zinc-700 hover:bg-zinc-900 hover:text-white rounded transition-all shadow-sm"
                            title="Activate / Resume"
                          >
                            <Play className="w-3 h-3 fill-current" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handlePauseCampaign(camp.id)}
                            disabled={actionLoading}
                            className="p-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded transition-all"
                            title="Pause"
                          >
                            <Pause className="w-3 h-3 fill-current" />
                          </button>
                        )}
                        <button
                          onClick={() => handleCloneCampaign(camp.id)}
                          disabled={actionLoading}
                          className="p-1.5 bg-zinc-50 text-zinc-500 hover:bg-zinc-100 rounded transition-all border border-zinc-200"
                          title="Clone campaign"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        {camp.status !== "archived" && (
                          <button
                            onClick={() => handleArchiveCampaign(camp.id)}
                            disabled={actionLoading}
                            className="p-1.5 bg-zinc-50 text-zinc-400 hover:text-zinc-600 rounded transition-all border border-zinc-200"
                            title="Archive campaign"
                          >
                            <Archive className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-zinc-500 bg-zinc-50/50 p-2.5 rounded border border-zinc-100">
                      <div>
                        <span className="font-semibold text-zinc-400">Offer:</span> {camp.offer || "None"}
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-400">Timezone:</span> {camp.timezone || "UTC"}
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-400">Spacing:</span> {camp.send_spacing_seconds || 60}s
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-400">Daily Cap:</span> {camp.daily_send_limit || 50}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Telemetry Metrics */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-6">
          <div>
            <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Runner Telemetry</h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">Live status details for active outreach processes</p>
          </div>

          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 flex items-center justify-between">
              <span className="text-zinc-500 font-semibold">Active Campaign:</span>
              <span className={`font-bold uppercase text-[9px] tracking-wider px-2.5 py-0.5 rounded-full border ${
                isRunning 
                  ? "bg-emerald-50 border-emerald-100 text-emerald-700 animate-pulse" 
                  : activeCampaign?.status === "paused"
                  ? "bg-amber-50 border-amber-100 text-amber-700"
                  : "bg-zinc-100 border-zinc-200 text-zinc-500"
              }`}>
                {activeCampaign ? activeCampaign.name : "Idle"}
              </span>
            </div>

            {/* Run statistics */}
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

            {activeCampaign && (
              <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-semibold">Daily Cap Used:</span>
                  <span className="font-bold text-zinc-800">{telemetry.sent_today} / {activeCampaign.daily_send_limit} sent</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-zinc-950 transition-all duration-300" 
                    style={{ width: `${Math.min(100, (telemetry.sent_today / activeCampaign.daily_send_limit) * 100)}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 7-Step Campaign Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-zinc-200 shadow-xl flex flex-col">
            
            {/* Header / Step Bar */}
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-zinc-900 text-base">Generic Outreach Campaign Wizard</h3>
                <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mt-1">Step {wizardStep} of 7: {
                  wizardStep === 1 ? "Identity" :
                  wizardStep === 2 ? "Offer" :
                  wizardStep === 3 ? "Audience" :
                  wizardStep === 4 ? "Writing" :
                  wizardStep === 5 ? "Sequence" :
                  wizardStep === 6 ? "Controls" : "Preview & Verification"
                }</p>
              </div>
              <button 
                onClick={() => setShowWizard(false)}
                className="text-zinc-400 hover:text-zinc-600 text-xs font-bold"
              >
                Close
              </button>
            </div>

            {/* Stepper Progress bar */}
            <div className="w-full h-1 bg-zinc-100">
              <div 
                className="h-full bg-zinc-900 transition-all duration-300"
                style={{ width: `${(wizardStep / 7) * 100}%` }}
              ></div>
            </div>

            {/* Wizard Body content */}
            <div className="p-6 flex-1 space-y-4">
              
              {/* STEP 1: Campaign Identity */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Campaign Name</label>
                    <input 
                      type="text"
                      value={wizardName}
                      onChange={e => setWizardName(e.target.value)}
                      placeholder="e.g. Q3 Partnership Outreach"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Campaign Preset</label>
                    <select
                      value={wizardPreset}
                      onChange={e => setWizardPreset(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all"
                    >
                      {PRESET_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>

                  {wizardPreset === "Custom" ? (
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Custom Objective</label>
                      <input 
                        type="text"
                        value={wizardCustomObjective}
                        onChange={e => setWizardCustomObjective(e.target.value)}
                        placeholder="e.g. pitch custom consulting audits"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Campaign Objective</label>
                      <input 
                        type="text"
                        value={wizardPreset}
                        disabled
                        className="w-full px-3 py-2 rounded-lg bg-zinc-100 border border-zinc-200 text-zinc-400 text-xs font-semibold cursor-not-allowed"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Description (Optional)</label>
                    <textarea 
                      value={wizardDescription}
                      onChange={e => setWizardDescription(e.target.value)}
                      placeholder="Enter brief description of this campaign..."
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                    />
                  </div>
                </div>
              )}

              {/* STEP 2: Offer details */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">What is being offered?</label>
                    <input 
                      type="text"
                      value={wizardOffer}
                      onChange={e => setWizardOffer(e.target.value)}
                      placeholder="e.g. 15-minute workflow auditing checklist"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Value Proposition</label>
                    <textarea 
                      value={wizardValProp}
                      onChange={e => setWizardValProp(e.target.value)}
                      placeholder="e.g. reduce coordination overhead by 30% through automated notifications..."
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Key Proof Points (Case Studies / Stats)</label>
                    <input 
                      type="text"
                      value={wizardProofPoints}
                      onChange={e => setWizardProofPoints(e.target.value)}
                      placeholder="e.g. helped 12 managers save 8 hours a week"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Required Facts</label>
                      <input 
                        type="text"
                        value={wizardRequiredFacts}
                        onChange={e => setWizardRequiredFacts(e.target.value)}
                        placeholder="e.g. 100% free of charge"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Prohibited Claims</label>
                      <input 
                        type="text"
                        value={wizardProhibitedClaims}
                        onChange={e => setWizardProhibitedClaims(e.target.value)}
                        placeholder="e.g. do not guarantee direct sales increases"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Target Audience */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Target Industry</label>
                      <input 
                        type="text"
                        value={wizardIndustry}
                        onChange={e => setWizardIndustry(e.target.value)}
                        placeholder="e.g. construction, SaaS, HVAC"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Target Roles</label>
                      <input 
                        type="text"
                        value={wizardRoles}
                        onChange={e => setWizardRoles(e.target.value)}
                        placeholder="e.g. CTO, Owner, Project Manager"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Target Countries</label>
                    <input 
                      type="text"
                      value={wizardCountries}
                      onChange={e => setWizardCountries(e.target.value)}
                      placeholder="e.g. US, Canada, UK"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Tags filter (comma separated)</label>
                      <input 
                        type="text"
                        value={wizardTagsInput}
                        onChange={e => setWizardTagsInput(e.target.value)}
                        placeholder="e.g. warm, follow-up"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Minimum Lead Fit Score</label>
                      <input 
                        type="number"
                        value={wizardMinScore}
                        onChange={e => setWizardMinScore(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: Writing instructions */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Tone</label>
                      <select
                        value={wizardTone}
                        onChange={e => setWizardTone(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all"
                      >
                        {TONE_OPTIONS.map(tone => (
                          <option key={tone} value={tone}>{tone}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Email Length</label>
                      <select
                        value={wizardLength}
                        onChange={e => setWizardLength(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all"
                      >
                        {LENGTH_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Language</label>
                      <input 
                        type="text"
                        value={wizardLanguage}
                        onChange={e => setWizardLanguage(e.target.value)}
                        placeholder="en"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Call to Action (CTA)</label>
                    <input 
                      type="text"
                      value={wizardCTA}
                      onChange={e => setWizardCTA(e.target.value)}
                      placeholder="e.g. Would you be open to a brief chat next week?"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Required content (comma separated)</label>
                      <input 
                        type="text"
                        value={wizardReqInput}
                        onChange={e => setWizardReqInput(e.target.value)}
                        placeholder="e.g. mention workflow system, add signature"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Banned phrases (comma separated)</label>
                      <input 
                        type="text"
                        value={wizardBannedInput}
                        onChange={e => setWizardBannedInput(e.target.value)}
                        placeholder="e.g. guaranteed, risk-free"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 5: Sequence selection */}
              {wizardStep === 5 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Sequence Template ID (Optional)</label>
                    <input 
                      type="text"
                      value={wizardSequenceId}
                      onChange={e => setWizardSequenceId(e.target.value)}
                      placeholder="e.g. seq-123-abc"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-mono"
                    />
                    <p className="text-[10px] text-zinc-400 mt-1 flex items-center gap-1">
                      <Info className="w-3.5 h-3.5" />
                      Select or create sequence steps to dispatch multiple outreach templates sequentially.
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 6: Sending Controls */}
              {wizardStep === 6 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Allowed Timezone</label>
                      <input 
                        type="text"
                        value={wizardTimezone}
                        onChange={e => setWizardTimezone(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Daily Cap Limit</label>
                      <input 
                        type="number"
                        value={wizardDailyLimit}
                        onChange={e => setWizardDailyLimit(parseInt(e.target.value) || 50)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Send Spacing Bounds (s)</label>
                      <input 
                        type="number"
                        value={wizardSpacing}
                        onChange={e => setWizardSpacing(parseInt(e.target.value) || 60)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Allowed Hours Start</label>
                      <input 
                        type="text"
                        value={wizardWindowStart}
                        onChange={e => setWizardWindowStart(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Allowed Hours End</label>
                      <input 
                        type="text"
                        value={wizardWindowEnd}
                        onChange={e => setWizardWindowEnd(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Start Date</label>
                      <input 
                        type="date"
                        value={wizardStartDate}
                        onChange={e => setWizardStartDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Approval Mode</label>
                      <select
                        value={wizardApprovalMode}
                        onChange={e => setWizardApprovalMode(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all"
                      >
                        <option value="manual">Manual human review (Required)</option>
                        <option value="semi-auto">Semi-autonomous approval bounds</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 7: Preview Drafts & Warnings */}
              {wizardStep === 7 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 text-xs space-y-1">
                    <h4 className="font-bold text-zinc-800 uppercase text-[9px] tracking-wider mb-2">Campaign Identity Summary</h4>
                    <div><span className="font-semibold text-zinc-400">Name:</span> {wizardName || "Generic Campaign"}</div>
                    <div><span className="font-semibold text-zinc-400">Objective:</span> {wizardPreset === "Custom" ? wizardCustomObjective : wizardPreset}</div>
                    <div><span className="font-semibold text-zinc-400">Target Industry:</span> {wizardIndustry || "All"}</div>
                    <div><span className="font-semibold text-zinc-400">Tone:</span> {wizardTone} ({wizardLength} length)</div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-zinc-400 block">Sample Email Draft Previews (3)</label>
                    {loadingPreviews ? (
                      <div className="p-6 text-center text-xs text-zinc-400 animate-pulse font-semibold">
                        Generating preview copies...
                      </div>
                    ) : previewDrafts.length === 0 ? (
                      <div className="p-4 text-center text-xs text-zinc-400 border border-dashed rounded-lg border-zinc-200">
                        No drafts preview generated. Check campaign target values.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {previewDrafts.map((draft, idx) => (
                          <div key={idx} className="p-4 rounded-lg border border-zinc-200 bg-white shadow-sm space-y-1">
                            <div className="text-xs font-bold text-zinc-800"><span className="text-zinc-400">Subject:</span> {draft.subject}</div>
                            <div className="text-[10px] text-zinc-600 whitespace-pre-wrap pt-2 border-t border-zinc-100 mt-2 font-mono">{draft.body}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Stepper Footer Action triggers */}
            <div className="p-6 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between">
              <div>
                {wizardStep > 1 && (
                  <button 
                    onClick={handlePrevStep}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 rounded-lg text-xs font-bold transition-all shadow-sm"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                {wizardStep < 7 ? (
                  <button 
                    onClick={handleNextStep}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                  >
                    Next
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={() => handleSaveCampaign(false)}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 rounded-lg text-xs font-bold transition-all shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save as Draft
                    </button>
                    <button 
                      onClick={() => handleSaveCampaign(true)}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Activate Campaign
                    </button>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

    </SidebarLayout>
  );
}
