"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { useToast } from "@/components/Toast";
import { 
  Sparkles, Layers, Plus, Trash2, Save, ArrowDown, HelpCircle, RefreshCw,
  Clock, CheckSquare, Square, FileText
} from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  status: string;
}

interface PromptVersion {
  id: string;
  version_name: string;
}

interface SequenceStep {
  id?: string;
  step_number: number;
  delay_amount: number;
  delay_unit: string;
  body_template_version_id?: string | null;
  require_manual_approval: number | boolean;
  step_instructions?: string | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function SequencesPage() {
  const { toast } = useToast();
  
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [promptVersions, setPromptVersions] = useState<PromptVersion[]>([]);
  const [steps, setSteps] = useState<SequenceStep[]>([]);
  
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCampaignsAndPrompts();
  }, []);

  useEffect(() => {
    if (selectedCampaignId) {
      fetchCampaignSequence(selectedCampaignId);
    } else {
      setSteps([]);
    }
  }, [selectedCampaignId]);

  const fetchCampaignsAndPrompts = async () => {
    setLoadingCampaigns(true);
    try {
      const campRes = await fetch(`${API_URL}/api/v1/campaigns`);
      if (campRes.ok) {
        const cData = await campRes.json();
        setCampaigns(cData || []);
        if (cData.length > 0) {
          setSelectedCampaignId(cData[0].id);
        }
      }
      
      const promptRes = await fetch(`${API_URL}/api/v1/prompts/versions`);
      if (promptRes.ok) {
        const pData = await promptRes.json();
        setPromptVersions(pData || []);
      }
    } catch (e) {
      console.error(e);
      toast("Error loading campaigns metadata.", "error");
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const fetchCampaignSequence = async (campaignId: string) => {
    setLoadingSteps(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/campaigns/${campaignId}/sequence`);
      if (res.ok) {
        const data = await res.json();
        setSteps(data.steps || []);
      } else {
        setSteps([]);
      }
    } catch (e) {
      console.error(e);
      toast("Failed to load campaign sequence steps.", "error");
    } finally {
      setLoadingSteps(false);
    }
  };

  const handleAddStep = () => {
    const nextNumber = steps.length + 1;
    const newStep: SequenceStep = {
      step_number: nextNumber,
      delay_amount: 3,
      delay_unit: "days",
      body_template_version_id: promptVersions.length > 0 ? promptVersions[0].id : null,
      require_manual_approval: 1,
      step_instructions: ""
    };
    setSteps([...steps, newStep]);
  };

  const handleDeleteStep = (indexToDelete: number) => {
    const updated = steps
      .filter((_, idx) => idx !== indexToDelete)
      .map((step, idx) => ({
        ...step,
        step_number: idx + 1 // Re-index step numbers
      }));
    setSteps(updated);
  };

  const handleUpdateStepField = (index: number, field: keyof SequenceStep, value: any) => {
    const updated = [...steps];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setSteps(updated);
  };

  const handleSaveSequence = async () => {
    if (!selectedCampaignId) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/campaigns/${selectedCampaignId}/sequence/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(steps)
      });
      
      if (res.ok) {
        toast("Sequence configuration saved successfully.", "success");
        fetchCampaignSequence(selectedCampaignId);
      } else {
        toast("Failed to save sequence steps.", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Connection error saving sequence.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidebarLayout>
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-950 tracking-tight">Campaign Follow-up Sequences</h2>
          <p className="text-xs text-zinc-500">Configure multi-stage delay outreach rules and prompts</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left Side: Campaign list selection */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white p-5 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
            <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Select Campaign</h3>
            {loadingCampaigns ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-4 h-4 text-zinc-400 animate-spin" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-xs text-zinc-400 font-semibold italic">No campaigns found.</div>
            ) : (
              <div className="space-y-1.5">
                {campaigns.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCampaignId(c.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all border ${
                      selectedCampaignId === c.id 
                        ? "bg-zinc-900 border-zinc-900 text-white shadow-sm" 
                        : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Sequences flowchart builder */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-6">
            
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-500" /> Sequence Steps Timeline
                </h3>
                <p className="text-[10px] text-zinc-500 mt-0.5">Customize delays, prompts and approvals for each follow-up step</p>
              </div>

              {selectedCampaignId && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddStep}
                    className="px-3 py-1.5 bg-white hover:bg-zinc-50 border border-zinc-200 rounded text-zinc-700 text-xs font-bold flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Step
                  </button>
                  <button
                    onClick={handleSaveSequence}
                    disabled={saving}
                    className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save Sequence
                  </button>
                </div>
              )}
            </div>

            {loadingSteps ? (
              <div className="flex justify-center items-center py-20">
                <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
              </div>
            ) : steps.length === 0 ? (
              <div className="p-16 border border-dashed border-zinc-200 rounded-lg text-center space-y-3">
                <Clock className="w-8 h-8 text-zinc-300 mx-auto" />
                <div className="text-xs font-bold text-zinc-800">No Sequence steps configured</div>
                <p className="text-[10px] text-zinc-400">Add sequence steps to define outreach delays and variants</p>
              </div>
            ) : (
              <div className="space-y-8 relative">
                
                {steps.map((step, idx) => (
                  <div key={idx} className="space-y-4 relative">
                    
                    {/* Flow connector arrow */}
                    {idx > 0 && (
                      <div className="flex justify-center py-1">
                        <ArrowDown className="w-4 h-4 text-zinc-300" />
                      </div>
                    )}

                    {/* Step Card */}
                    <div className="p-5 bg-zinc-50/50 border border-zinc-200 rounded-xl space-y-4">
                      
                      <div className="flex items-center justify-between border-b border-zinc-200/60 pb-3">
                        <span className="text-xs font-extrabold text-indigo-600 uppercase tracking-wider">
                          Step {step.step_number} {idx === 0 ? "(Initial Outreach)" : `(Follow-up)`}
                        </span>
                        <button
                          onClick={() => handleDeleteStep(idx)}
                          className="text-zinc-400 hover:text-rose-600 transition-colors p-1"
                          title="Delete Step"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-semibold text-zinc-700">
                        {/* Delay amount */}
                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Delay amount</label>
                          <input
                            type="number"
                            value={step.delay_amount}
                            min={0}
                            onChange={e => handleUpdateStepField(idx, "delay_amount", parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded text-xs focus:outline-none"
                          />
                        </div>

                        {/* Delay Unit */}
                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Delay unit</label>
                          <select
                            value={step.delay_unit}
                            onChange={e => handleUpdateStepField(idx, "delay_unit", e.target.value)}
                            className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded text-xs focus:outline-none"
                          >
                            <option value="hours">Hours</option>
                            <option value="days">Days</option>
                          </select>
                        </div>

                        {/* Prompt variant selection */}
                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Prompt Template version</label>
                          <select
                            value={step.body_template_version_id || ""}
                            onChange={e => handleUpdateStepField(idx, "body_template_version_id", e.target.value || null)}
                            className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded text-xs focus:outline-none"
                          >
                            <option value="">Default Campaign Template</option>
                            {promptVersions.map(p => (
                              <option key={p.id} value={p.id}>{p.version_name || p.id}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Require Manual approval switch */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdateStepField(idx, "require_manual_approval", step.require_manual_approval ? 0 : 1)}
                          className="text-zinc-500 hover:text-zinc-800 transition-colors"
                        >
                          {step.require_manual_approval ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-zinc-300 shrink-0" />
                          )}
                        </button>
                        <span className="text-xs text-zinc-600 font-semibold">Require manual draft approval before dispatch</span>
                      </div>

                      {/* Custom instructions guidelines */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Custom Step constraints / instructions</label>
                        <textarea
                          placeholder="e.g. Reference the positive observations from lead website products, keep it short."
                          value={step.step_instructions || ""}
                          onChange={e => handleUpdateStepField(idx, "step_instructions", e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-zinc-200 rounded text-xs focus:outline-none h-16 resize-none font-medium"
                        />
                      </div>

                    </div>
                  </div>
                ))}
                
              </div>
            )}

          </div>
        </div>

      </div>
    </SidebarLayout>
  );
}
