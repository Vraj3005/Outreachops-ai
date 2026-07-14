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
  const [editCampaignId, setEditCampaignId] = useState<string | null>(null);
  
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
  const [wizardSteps, setWizardSteps] = useState([
    { name: "Initial Outreach", step_number: 1, delay_amount: 0, delay_unit: "hours", require_manual_approval: true, custom_instructions: "" },
    { name: "Follow-up", step_number: 2, delay_amount: 3, delay_unit: "days", require_manual_approval: true, custom_instructions: "" },
    { name: "Final Follow-up", step_number: 3, delay_amount: 7, delay_unit: "days", require_manual_approval: true, custom_instructions: "" }
  ]);
  
  const [activeSequenceSteps, setActiveSequenceSteps] = useState<any[]>([]);
  const [activeTimeline, setActiveTimeline] = useState<any[]>([]);
  const [promptVersions, setPromptVersions] = useState<any[]>([]);
  
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

  const fetchCampaignSequenceAndTimeline = async (campaignId: string) => {
    try {
      const seqRes = await fetch(`${API_URL}/api/v1/campaigns/${campaignId}/sequence`);
      if (seqRes.ok) {
        const seqData = await seqRes.json();
        setActiveSequenceSteps(seqData.steps || []);
      }
      const timelineRes = await fetch(`${API_URL}/api/v1/campaigns/${campaignId}/timeline`);
      if (timelineRes.ok) {
        const timelineData = await timelineRes.json();
        setActiveTimeline(timelineData || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPromptVersions = async () => {
    try {
      const promptsRes = await fetch(`${API_URL}/api/v1/prompts`);
      if (promptsRes.ok) {
        const promptsData = await promptsRes.json();
        let versions: any[] = [];
        for (const pt of promptsData) {
          const vRes = await fetch(`${API_URL}/api/v1/prompts/${pt.id}/versions`);
          if (vRes.ok) {
            const vData = await vRes.json();
            versions = [...versions, ...vData.map((v: any) => ({ ...v, template_name: pt.name }))];
          }
        }
        setPromptVersions(versions);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchCampaignsAndTelemetry();
    fetchPromptVersions();
  }, []);

  useEffect(() => {
    if (activeCampaign?.id) {
      fetchCampaignSequenceAndTimeline(activeCampaign.id);
    } else {
      setActiveSequenceSteps([]);
      setActiveTimeline([]);
    }
  }, [activeCampaign?.id]);

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

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this campaign? This will remove all associated statistics, sequence steps, and dispatch settings. This cannot be undone.")) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/campaigns/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast("Campaign deleted successfully.", "success");
        if (activeCampaign?.id === id) {
          setActiveCampaign(null);
        }
        fetchCampaignsAndTelemetry();
      } else {
        toast("Failed to delete campaign", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Connection error", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditCampaignClick = (camp: Campaign) => {
    setEditCampaignId(camp.id);
    setWizardStep(1);
    
    // Pre-populate fields
    setWizardName(camp.name || "");
    setWizardPreset(camp.preset || "Introduce a service");
    if (camp.preset === "Custom") {
      setWizardCustomObjective(camp.objective || "");
      setWizardObjective("");
    } else {
      setWizardObjective(camp.objective || "");
      setWizardCustomObjective("");
    }
    setWizardDescription(camp.description || "");
    setWizardOffer(camp.offer || "");
    setWizardValProp(camp.value_proposition || "");
    setWizardProofPoints(camp.proof_points || "");
    setWizardRequiredFacts(camp.required_facts || "");
    setWizardProhibitedClaims(camp.prohibited_claims || "");
    setWizardIndustry(camp.target_industry || "");
    setWizardRoles(camp.target_roles || "");
    setWizardCountries(camp.countries || "");
    setWizardTagsInput(camp.tags ? camp.tags.join(", ") : "");
    setWizardMinScore(camp.min_lead_fit_score || 0);
    setWizardTone(camp.tone || "professional");
    setWizardLength(camp.email_length || "medium");
    setWizardLanguage(camp.language || "en");
    setWizardCTA(camp.CTA || "");
    setWizardReqInput(camp.required_content ? camp.required_content.join(", ") : "");
    setWizardBannedInput(camp.banned_content ? camp.banned_content.join(", ") : "");
    setWizardPromptId(camp.prompt_template_id || "");
    setWizardSequenceId(camp.sequence_id || "");
    setWizardTimezone(camp.timezone || "UTC");
    setWizardDailyLimit(camp.daily_send_limit || 50);
    setWizardSpacing(camp.send_spacing_seconds || 60);
    setWizardWindowStart(camp.sending_window_start || "09:00");
    setWizardWindowEnd(camp.sending_window_end || "17:00");
    setWizardStartDate(camp.start_date || "");
    setWizardApprovalMode(camp.approval_mode || "manual");

    // Fetch sequence steps dynamically
    fetch(`${API_URL}/api/v1/campaigns/${camp.id}/sequence`)
      .then(res => res.json())
      .then(data => {
        if (data && data.steps && data.steps.length > 0) {
          setWizardSteps(data.steps.map((s: any) => ({
            name: s.name,
            step_number: s.step_number,
            delay_amount: s.delay_amount,
            delay_unit: s.delay_unit,
            require_manual_approval: s.require_manual_approval,
            custom_instructions: s.custom_instructions || ""
          })));
        } else {
          // Keep defaults
          setWizardSteps([
            { name: "Initial Outreach", step_number: 1, delay_amount: 0, delay_unit: "hours", require_manual_approval: true, custom_instructions: "" },
            { name: "Follow-up", step_number: 2, delay_amount: 3, delay_unit: "days", require_manual_approval: true, custom_instructions: "" },
            { name: "Final Follow-up", step_number: 3, delay_amount: 7, delay_unit: "days", require_manual_approval: true, custom_instructions: "" }
          ]);
        }
      })
      .catch(err => {
        console.error("Failed to load sequence for edit:", err);
      });
    
    setShowWizard(true);
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

      const saveUrl = editCampaignId 
        ? `${API_URL}/api/v1/campaigns/${editCampaignId}`
        : `${API_URL}/api/v1/campaigns`;
      
      const saveMethod = editCampaignId ? "PATCH" : "POST";

      const res = await fetch(saveUrl, {
        method: saveMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaignPayload)
      });

      if (res.ok) {
        const savedCampaign = await res.json();
        
        // Save sequence steps configuration
        try {
          const stepsRes = await fetch(`${API_URL}/api/v1/campaigns/${savedCampaign.id}/sequence/steps`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ steps: wizardSteps })
          });
          if (!stepsRes.ok) {
            toast("Campaign saved but failed to update custom sequence steps.", "info");
          }
        } catch (stepErr) {
          console.error("Sequence steps save failure:", stepErr);
        }

        const msg = editCampaignId 
          ? `Campaign '${wizardName}' updated successfully!`
          : `Campaign '${wizardName}' created successfully!`;
        toast(msg, "success");
        
        setShowWizard(false);
        setWizardStep(1);
        setEditCampaignId(null);
        // Reset states
        setWizardName("");
        setWizardObjective("");
        setWizardOffer("");
        setWizardValProp("");
        setWizardCTA("");
        fetchCampaignsAndTelemetry();
      } else {
        const err = await res.json();
        toast(err.detail || "Failed to save campaign", "error");
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
            onClick={() => {
              setEditCampaignId(null);
              // Reset all states
              setWizardName("");
              setWizardPreset("Introduce a service");
              setWizardObjective("");
              setWizardCustomObjective("");
              setWizardDescription("");
              setWizardOffer("");
              setWizardValProp("");
              setWizardProofPoints("");
              setWizardRequiredFacts("");
              setWizardProhibitedClaims("");
              setWizardIndustry("");
              setWizardRoles("");
              setWizardCountries("");
              setWizardTagsInput("");
              setWizardMinScore(0);
              setWizardTone("professional");
              setWizardLength("medium");
              setWizardLanguage("en");
              setWizardCTA("");
              setWizardReqInput("");
              setWizardBannedInput("");
              setWizardPromptId("");
              setWizardSequenceId("");
              setWizardTimezone("UTC");
              setWizardDailyLimit(50);
              setWizardSpacing(60);
              setWizardWindowStart("09:00");
              setWizardWindowEnd("17:00");
              setWizardStartDate("");
              setWizardApprovalMode("manual");
              setWizardSteps([
                { name: "Initial Outreach", step_number: 1, delay_amount: 0, delay_unit: "hours", require_manual_approval: true, custom_instructions: "" },
                { name: "Follow-up", step_number: 2, delay_amount: 3, delay_unit: "days", require_manual_approval: true, custom_instructions: "" },
                { name: "Final Follow-up", step_number: 3, delay_amount: 7, delay_unit: "days", require_manual_approval: true, custom_instructions: "" }
              ]);
              setWizardStep(1);
              setShowWizard(true);
            }}
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
                          onClick={() => handleEditCampaignClick(camp)}
                          disabled={actionLoading}
                          className="p-1.5 bg-zinc-50 text-zinc-500 hover:bg-zinc-100 rounded transition-all border border-zinc-200"
                          title="Edit campaign settings"
                        >
                          <Sliders className="w-3 h-3" />
                        </button>
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
                        <button
                          onClick={() => handleDeleteCampaign(camp.id)}
                          disabled={actionLoading}
                          className="p-1.5 bg-zinc-50 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all border border-zinc-200"
                          title="Delete campaign permanently"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
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

        {/* Active Sequence Configuration Card */}
        {activeCampaign && (
          <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
            <div>
              <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Sequence Steps ({activeSequenceSteps.length})</h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">Custom follow-up steps for this campaign</p>
            </div>
            
            {activeSequenceSteps.length === 0 ? (
              <p className="text-[10px] text-zinc-400 font-semibold italic">No sequence configured or loading...</p>
            ) : (
              <div className="space-y-3">
                {activeSequenceSteps.map((step, idx) => (
                  <div key={idx} className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg flex flex-col gap-1 text-[11px]">
                    <div className="flex justify-between items-center font-bold text-zinc-800">
                      <span>{step.step_number}. {step.name}</span>
                      <span className="text-[8px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-700 font-extrabold">
                        {step.delay_amount} {step.delay_unit} delay
                      </span>
                    </div>
                    {step.custom_instructions && (
                      <div className="text-[10px] text-zinc-400 italic font-semibold">
                        &ldquo;{step.custom_instructions}&rdquo;
                      </div>
                    )}
                    <div className="text-[9px] text-zinc-500 flex items-center gap-1.5 mt-1 font-semibold">
                      <span className={`w-1.5 h-1.5 rounded-full ${step.require_manual_approval ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                      {step.require_manual_approval ? 'Requires approval before send' : 'Pre-approved / Auto-send'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Campaign Lead Timeline Progress Card */}
        {activeCampaign && (
          <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
            <div>
              <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Campaign Timeline Progress</h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">Detailed step status of enrolled leads</p>
            </div>

            {activeTimeline.length === 0 ? (
              <p className="text-[10px] text-zinc-400 font-semibold italic text-center py-4">No prospects enrolled in sequence yet.</p>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {activeTimeline.map((item, idx) => (
                  <div key={idx} className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <div className="font-bold text-zinc-800 text-[11px] truncate max-w-[135px]">
                        {item.lead_id}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-semibold">
                        Current Step: <span className="font-bold text-zinc-700">{item.current_sequence_step}</span>
                      </div>
                    </div>

                    <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold border ${
                      item.status === 'sent' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                      item.status === 'scheduled' ? 'bg-indigo-50 border-indigo-100 text-indigo-700' :
                      item.status === 'awaiting_approval' ? 'bg-amber-50 border-amber-100 text-amber-700 animate-pulse' :
                      item.status === 'awaiting_generation' ? 'bg-blue-50 border-blue-100 text-blue-700 animate-pulse' :
                      item.status === 'waiting' ? 'bg-purple-50 border-purple-100 text-purple-700' :
                      item.status === 'replied' ? 'bg-emerald-500 border-emerald-600 text-white' :
                      item.status === 'stopped' ? 'bg-rose-50 border-rose-100 text-rose-700' :
                      item.status === 'completed' ? 'bg-teal-50 border-teal-100 text-teal-700 font-extrabold' :
                      'bg-zinc-100 border-zinc-200 text-zinc-500'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* 7-Step Campaign Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-zinc-200 shadow-xl flex flex-col">
            
            {/* Header / Step Bar */}
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-zinc-900 text-base">
                  {editCampaignId ? "Edit Outreach Campaign Settings" : "Generic Outreach Campaign Wizard"}
                </h3>
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

              {/* STEP 5: Sequence Steps Editor */}
              {wizardStep === 5 && (
                <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                  <div className="flex justify-between items-center border-b border-zinc-100 pb-2">
                    <div>
                      <h4 className="text-xs font-bold text-zinc-800">Sequence Steps Configuration</h4>
                      <p className="text-[10px] text-zinc-500">Configure ordered delays, template overrides, and manual approval gates.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setWizardSteps(prev => [
                          ...prev,
                          {
                            name: `Follow-up Step ${prev.length + 1}`,
                            step_number: prev.length + 1,
                            delay_amount: 3,
                            delay_unit: "days",
                            require_manual_approval: true,
                            custom_instructions: ""
                          }
                        ])
                      }}
                      className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-[10px] font-bold flex items-center gap-1 transition-all shadow-sm"
                    >
                      <Plus className="w-3 h-3" />
                      Add Step
                    </button>
                  </div>

                  <div className="space-y-4">
                    {wizardSteps.map((step, idx) => (
                      <div key={idx} className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 space-y-3 relative text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-black text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded">
                            Step {step.step_number}
                          </span>
                          
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const filtered = wizardSteps.filter((_, sIdx) => sIdx !== idx);
                                const mapped = filtered.map((s, sIdx) => ({ ...s, step_number: sIdx + 1 }));
                                setWizardSteps(mapped);
                              }}
                              className="text-rose-500 hover:text-rose-700 text-[10px] font-bold"
                            >
                              Delete Step
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[9px] uppercase font-bold text-zinc-400 block mb-1">Step Name</label>
                            <input
                              type="text"
                              value={step.name}
                              onChange={e => {
                                const updated = [...wizardSteps];
                                updated[idx].name = e.target.value;
                                setWizardSteps(updated);
                              }}
                              placeholder="e.g. Follow-up 1"
                              className="w-full px-2.5 py-1.5 rounded border border-zinc-200 text-xs font-semibold bg-white text-zinc-800 focus:outline-none"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] uppercase font-bold text-zinc-400 block mb-1">Delay Amount</label>
                              <input
                                type="number"
                                value={step.delay_amount}
                                onChange={e => {
                                  const updated = [...wizardSteps];
                                  updated[idx].delay_amount = parseInt(e.target.value) || 0;
                                  setWizardSteps(updated);
                                }}
                                className="w-full px-2.5 py-1.5 rounded border border-zinc-200 text-xs font-mono bg-white text-zinc-800 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] uppercase font-bold text-zinc-400 block mb-1">Delay Unit</label>
                              <select
                                value={step.delay_unit}
                                onChange={e => {
                                  const updated = [...wizardSteps];
                                  updated[idx].delay_unit = e.target.value;
                                  setWizardSteps(updated);
                                }}
                                className="w-full px-2.5 py-1.5 rounded border border-zinc-200 text-xs bg-white text-zinc-800 focus:outline-none cursor-pointer"
                              >
                                <option value="minutes">Minutes (Testing)</option>
                                <option value="hours">Hours</option>
                                <option value="days">Days</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="text-[9px] uppercase font-bold text-zinc-400 block mb-1">Custom instructions for step</label>
                          <textarea
                            value={step.custom_instructions}
                            onChange={e => {
                              const updated = [...wizardSteps];
                              updated[idx].custom_instructions = e.target.value;
                              setWizardSteps(updated);
                            }}
                            placeholder="e.g. keep it under 3 sentences, ask if they received my previous message..."
                            rows={2}
                            className="w-full px-2.5 py-1.5 rounded border border-zinc-200 text-xs font-semibold bg-white text-zinc-800 focus:outline-none"
                          />
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="checkbox"
                            id={`manual-${idx}`}
                            checked={step.require_manual_approval}
                            onChange={e => {
                              const updated = [...wizardSteps];
                              updated[idx].require_manual_approval = e.target.checked;
                              setWizardSteps(updated);
                            }}
                            className="rounded text-zinc-950 focus:ring-0 cursor-pointer w-3.5 h-3.5"
                          />
                          <label htmlFor={`manual-${idx}`} className="text-[10px] text-zinc-600 select-none cursor-pointer">
                            Require manual human review & approval before sending
                          </label>
                        </div>
                      </div>
                    ))}
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
