"use client";

import React, { useState, useEffect, useRef } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { useToast } from "@/components/Toast";
import { 
  Code, RefreshCw, Save, Play, 
  Eye, FileText, CheckCircle2, AlertCircle, Sparkles, 
  Layers, GitCommit, ArrowLeftRight, Check, AlertTriangle, Info, HelpCircle
} from "lucide-react";

interface Lead {
  id: string;
  company_name: string | null;
  website: string;
  contact_email: string | null;
  lead_status?: string;
}

interface PromptVersion {
  id: string;
  template_id: string;
  version: string;
  template_text: string;
  status: string;
  description: string | null;
  changelog: string | null;
  is_active: boolean;
  created_at: string;
}

interface TestResult {
  subject: string;
  body: string;
  reasoning: string;
  model_used: string;
  token_estimate: number;
  scores: {
    quality_score: number;
    spam_risk_score: number;
    personalization_score: number;
    clarity_score: number;
  };
  warnings: string[];
}

interface ValidationResult {
  is_valid: boolean;
  errors: string[];
  detected_variables: string[];
  unknown_variables: string[];
  preview_text: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const VARIABLE_CATEGORIES = [
  {
    name: "Lead Fields",
    vars: [
      { tag: "{{first_name}}", desc: "First Name" },
      { tag: "{{last_name}}", desc: "Last Name" },
      { tag: "{{full_name}}", desc: "Full Name" },
      { tag: "{{company_name}}", desc: "Company Name" },
      { tag: "{{job_title}}", desc: "Job Title" },
      { tag: "{{contact_email}}", desc: "Contact Email" },
      { tag: "{{website}}", desc: "Website URL" },
      { tag: "{{industry}}", desc: "Industry Vertical" },
      { tag: "{{country}}", desc: "Country Name" },
      { tag: "{{city}}", desc: "City Location" },
      { tag: "{{custom.pain_points}}", desc: "Custom Pain Point Key" },
    ]
  },
  {
    name: "Campaign Directives",
    vars: [
      { tag: "{{campaign.name}}", desc: "Campaign Identifier" },
      { tag: "{{campaign.objective}}", desc: "Outreach Objective Preset" },
      { tag: "{{campaign.offer}}", desc: "Product/Service Offer Details" },
      { tag: "{{campaign.value_proposition}}", desc: "Core Value Propositions" },
      { tag: "{{campaign.target_audience}}", desc: "Ideal Customer Profile" },
      { tag: "{{campaign.cta}}", desc: "Call to Action Phrase" },
    ]
  },
  {
    name: "Research Insights",
    vars: [
      { tag: "{{research.summary}}", desc: "General Research Bullet Points" },
      { tag: "{{research.services}}", desc: "Extracted services offered" },
      { tag: "{{research.observations}}", desc: "Key pain-points observed" },
      { tag: "{{research.sources}}", desc: "Sources referenced" },
    ]
  },
  {
    name: "Sender Identity",
    vars: [
      { tag: "{{sender.name}}", desc: "Owner Sender Name" },
      { tag: "{{sender.company}}", desc: "Owner Business Name" },
      { tag: "{{sender.website}}", desc: "Owner Brand Website" },
      { tag: "{{sender.phone}}", desc: "Owner Phone Number" },
      { tag: "{{sender.signature}}", desc: "Owner Email Signature" },
    ]
  },
  {
    name: "Sequence Step Info",
    vars: [
      { tag: "{{sequence.step_number}}", desc: "Sequence Step Index" },
      { tag: "{{sequence.previous_subject}}", desc: "Subject of previous step" },
    ]
  }
];

export default function PromptStudioPage() {
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("Default Campaign Prompt");
  const [emailType, setEmailType] = useState("generic");
  const [promptText, setPromptText] = useState("");
  const [promptVersion, setPromptVersion] = useState("1.0.0");
  
  // Versions lists & diff compare
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [selectedV1, setSelectedV1] = useState("");
  const [selectedV2, setSelectedV2] = useState("");
  const [diffLines, setDiffLines] = useState<string[]>([]);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [showSaveVersionModal, setShowSaveVersionModal] = useState(false);
  const [newVersionString, setNewVersionString] = useState("1.1.0");
  const [newVersionDesc, setNewVersionDesc] = useState("");
  const [newVersionChangelog, setNewVersionChangelog] = useState("");
  const [newVersionStatus, setNewVersionStatus] = useState("published");

  // Validation
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Testing & Simulation
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [tone, setTone] = useState("casual");
  const [length, setLength] = useState("medium");
  const [cta, setCta] = useState("soft");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);

  // AI template helper
  const [aiInstruction, setAiInstruction] = useState("");
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // Load leads and templates
  useEffect(() => {
    const loadData = async () => {
      try {
        const leadRes = await fetch(`${API_URL}/api/v1/leads`);
        if (leadRes.ok) {
          const data: Lead[] = await leadRes.json();
          // Filter to show active processed or approved leads
          const approved = data.filter((l: any) => l.lead_status !== "DoNotContact");
          setLeads(approved);
          if (approved.length > 0) {
            setSelectedLeadId(approved[0].id);
          }
        }

        // Load active prompt template
        const tmplRes = await fetch(`${API_URL}/api/v1/prompts/active?email_type=generic`);
        if (tmplRes.ok) {
          const data = await tmplRes.json();
          if (data && data.id) {
            setTemplateId(data.id);
            setTemplateName(data.name);
            setEmailType(data.email_type);
            setPromptText(data.template_text);
            setPromptVersion(data.version);
            loadVersions(data.id);
          } else {
            // Create a default first template
            handleCreateDefaultTemplate();
          }
        }
      } catch (e) {
        console.error("Error loading templates or leads", e);
      }
    };
    loadData();
  }, []);

  // Trigger validation on prompt text changes
  useEffect(() => {
    if (!promptText) return;
    const timer = setTimeout(() => {
      validatePromptText();
    }, 1000);
    return () => clearTimeout(timer);
  }, [promptText]);

  const handleCreateDefaultTemplate = async () => {
    try {
      const defaultText = `Hi {{first_name}},\n\nI was looking at {{company_name}} and noticed {{research.observations}}.\n\nOur proposal: {{campaign.value_proposition}}.\n\n{{campaign.cta}}\n\n{{sender.signature}}`;
      const res = await fetch(`${API_URL}/api/v1/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Universal Campaign Template",
          email_type: "generic",
          template_text: defaultText,
          version: "1.0.0",
          is_active: true
        })
      });
      if (res.ok) {
        const data = await res.json();
        setTemplateId(data.id);
        setTemplateName(data.name);
        setEmailType(data.email_type);
        setPromptText(data.template_text);
        setPromptVersion(data.version);
        loadVersions(data.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadVersions = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/prompts/${id}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data);
        if (data.length >= 2) {
          setSelectedV1(data[0].id);
          setSelectedV2(data[1].id);
        } else if (data.length === 1) {
          setSelectedV1(data[0].id);
          setSelectedV2(data[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to load versions list", e);
    }
  };

  const validatePromptText = async () => {
    setIsValidating(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/prompts/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_text: promptText,
          email_type: emailType
        })
      });
      if (res.ok) {
        const data = await res.json();
        setValidation(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsValidating(false);
    }
  };

  // Safe Variable Inserter helper
  const insertVariable = (tag: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);

    const updatedText = before + tag + after;
    setPromptText(updatedText);
    
    // Focus back on cursor index
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + tag.length;
    }, 0);
  };

  // Rollback to version
  const handleActivateVersion = async (versionId: string) => {
    toast("Activating template version...", "info");
    try {
      const res = await fetch(`${API_URL}/api/v1/prompts/${templateId}/versions/${versionId}/activate`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        setPromptText(data.template_text);
        setPromptVersion(data.version);
        toast(`Activated version v${data.version}! Rollback complete.`);
        loadVersions(templateId);
      } else {
        toast("Failed to activate template version", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Connection error during rollback", "error");
    }
  };

  // Version Diff Comparer
  const handleCompareVersions = async () => {
    if (!selectedV1 || !selectedV2) {
      toast("Please select two versions to compare", "error");
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/v1/prompts/compare?v1=${selectedV1}&v2=${selectedV2}`);
      if (res.ok) {
        const data = await res.json();
        setDiffLines(data.diff_lines);
        setShowDiffModal(true);
      } else {
        toast("Failed to compare version diff", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Error generating version comparison", "error");
    }
  };

  // Save version
  const handleSaveVersion = async () => {
    if (!newVersionString.trim()) {
      toast("Version string is required", "error");
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/v1/prompts/${templateId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: newVersionString,
          template_text: promptText,
          status: newVersionStatus,
          description: newVersionDesc,
          changelog: newVersionChangelog
        })
      });

      if (res.ok) {
        const data = await res.json();
        setPromptVersion(data.version);
        toast(`Saved new template version: v${data.version}`);
        setShowSaveVersionModal(false);
        loadVersions(templateId);
        
        // Clean fields
        setNewVersionDesc("");
        setNewVersionChangelog("");
      } else {
        const err = await res.json();
        toast(err.detail || "Failed to save template version", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Error saving version", "error");
    }
  };

  // Run structured simulation testing
  const handleTestPrompt = async () => {
    if (!selectedLeadId) {
      toast("Please select a target lead to simulate", "error");
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    toast("Generating simulation structured output...", "info");

    try {
      const res = await fetch(`${API_URL}/api/v1/prompts/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: selectedLeadId,
          template_text: promptText,
          tone: tone,
          length: length,
          cta: cta
        })
      });

      if (res.ok) {
        const data = await res.json();
        setTestResult(data);
        toast("Simulation completed successfully!");
      } else {
        const err = await res.json();
        toast(err.detail || "Failed to run simulation", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Simulation API error", "error");
    } finally {
      setIsTesting(false);
    }
  };

  // AI assisted generic template creator
  const handleAIAssistantGenerate = async () => {
    if (!aiInstruction.trim()) {
      toast("Please enter your prompt description guidelines", "error");
      return;
    }
    setIsGeneratingPrompt(true);
    toast("AI is formulating variables-driven template...", "info");
    try {
      const res = await fetch(`${API_URL}/api/v1/prompts/generate-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: aiInstruction,
          email_type: "generic"
        })
      });
      if (res.ok) {
        const data = await res.json();
        setPromptText(data.template_text);
        toast("Template prompt generated! Validate and click Save to apply.");
        setShowAiModal(false);
        setAiInstruction("");
      } else {
        toast("Failed to assist-generate template prompt", "error");
      }
    } catch (e) {
      console.error(e);
      toast("AI generator connection error", "error");
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  return (
    <SidebarLayout>
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-950 tracking-tight flex items-center gap-2">
            <Code className="w-5 h-5 text-indigo-600" />
            Dynamic Prompt Studio
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">Rebuild templates safely, parse variable namespaces, and compare version histories</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAiModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100/75 text-indigo-700 rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Prompt Assistant
          </button>
          
          <button
            onClick={() => {
              const parts = promptVersion.split(".");
              const nextPatch = parseInt(parts[2] || "0") + 1;
              setNewVersionString(`${parts[0] || "1"}.${parts[1] || "0"}.${nextPatch}`);
              setShowSaveVersionModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 h-8 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            Save & Publish Version
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        
        {/* Left Grid: Variables Palette & Template Editor */}
        <div className="xl:col-span-2 space-y-6">
          
          {/* Variables helper guide */}
          <div className="bg-white p-5 rounded-xl border border-zinc-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
              <HelpCircle className="w-4 h-4 text-zinc-400" />
              <h3 className="text-xs font-bold text-zinc-700 uppercase tracking-wider">Dynamic Namespace Variables (Click to Insert)</h3>
            </div>
            
            <div className="space-y-4">
              {VARIABLE_CATEGORIES.map(category => (
                <div key={category.name} className="space-y-1.5">
                  <div className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest">{category.name}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {category.vars.map(v => (
                      <button
                        key={v.tag}
                        type="button"
                        onClick={() => insertVariable(v.tag)}
                        title={v.desc}
                        className="px-2 py-1 text-[10px] font-mono font-bold bg-zinc-50 border border-zinc-200 text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300 rounded transition-all flex items-center gap-1"
                      >
                        {v.tag}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Prompt Editor */}
          <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4.5 h-4.5 text-zinc-500" />
                <h3 className="font-bold text-zinc-900 text-sm">{templateName}</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-400 font-mono px-2 py-0.5 rounded bg-zinc-50 border border-zinc-200">v{promptVersion}</span>
                <span className="text-[10px] text-zinc-400 font-mono px-2 py-0.5 rounded bg-zinc-50 border border-zinc-200 uppercase">{emailType}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase font-bold text-zinc-400">Prompt Instructions Template</label>
                {isValidating ? (
                  <span className="text-[9px] text-zinc-400 flex items-center gap-1">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    Validating syntax...
                  </span>
                ) : validation ? (
                  <span className={`text-[9px] font-bold flex items-center gap-1 ${validation.is_valid ? "text-emerald-600" : "text-rose-600"}`}>
                    {validation.is_valid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                    {validation.is_valid ? "Syntax Valid" : "Braces error / unbalanced"}
                  </span>
                ) : null}
              </div>

              <textarea
                ref={textareaRef}
                value={promptText}
                onChange={e => setPromptText(e.target.value)}
                placeholder="Write template instructions... e.g. Write a friendly outreach pitch to {{first_name}} about {{campaign.objective}}..."
                className="w-full h-80 px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs font-mono focus:outline-none focus:bg-white focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 leading-relaxed shadow-inner"
              />
            </div>

            {/* Syntax Checklist */}
            {validation && (
              <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 text-[11px] space-y-3">
                <div className="font-semibold text-zinc-800 text-xs">Real-time Syntax Audit</div>
                
                {/* Parse Errors */}
                {validation.errors.length > 0 && (
                  <div className="space-y-1">
                    <div className="font-bold text-rose-600 flex items-center gap-1 uppercase text-[9px]">
                      <AlertCircle className="w-3 h-3" />
                      <span>Errors detected</span>
                    </div>
                    <ul className="list-disc pl-4 text-rose-600/90 font-medium space-y-0.5">
                      {validation.errors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div>
                    <div className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Detected variables ({validation.detected_variables.length})</div>
                    {validation.detected_variables.length === 0 ? (
                      <div className="text-zinc-400 italic">No placeholders parsed</div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {validation.detected_variables.map(v => (
                          <span key={v} className="px-1.5 py-0.5 rounded bg-white border border-zinc-200 text-zinc-600 font-mono text-[9px]">
                            {v}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Unknown variables ({validation.unknown_variables.length})</div>
                    {validation.unknown_variables.length === 0 ? (
                      <div className="text-emerald-600 flex items-center gap-1 text-[9px] font-bold">
                        <Check className="w-3 h-3" />
                        ALL VARIABLES IN WHITELIST
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {validation.unknown_variables.map(v => (
                          <span key={v} className="px-1.5 py-0.5 rounded bg-rose-50 border border-rose-100 text-rose-600 font-mono text-[9px] font-semibold flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {v}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Compilation preview */}
                {validation.preview_text && (
                  <div className="border-t border-zinc-200 pt-3 mt-2 space-y-1">
                    <div className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest">Compile context Preview (Sample data)</div>
                    <pre className="p-3 bg-white border border-zinc-100 rounded text-zinc-500 font-mono text-[10px] whitespace-pre-wrap max-h-36 overflow-y-auto">
                      {validation.preview_text}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Grid: Version Manager & Test simulator sidebar */}
        <div className="space-y-6">
          
          {/* Versions History Checklist */}
          <div className="bg-white p-5 rounded-xl border border-zinc-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-zinc-500" />
                <h3 className="font-bold text-zinc-900 text-xs uppercase tracking-wider">Version History</h3>
              </div>
              <span className="text-[9px] font-bold text-zinc-400 font-mono">{versions.length} records</span>
            </div>

            {/* Compare tools wrapper */}
            {versions.length >= 1 && (
              <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 space-y-2.5">
                <div className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                  <ArrowLeftRight className="w-3 h-3" />
                  Compare Two Versions
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[8px] text-zinc-400 uppercase block mb-0.5">Version A</label>
                    <select
                      value={selectedV1}
                      onChange={e => setSelectedV1(e.target.value)}
                      className="w-full px-2 py-1 rounded bg-white border border-zinc-200 text-zinc-800 text-[10px]"
                    >
                      {versions.map(v => (
                        <option key={v.id} value={v.id}>v{v.version} ({v.status})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[8px] text-zinc-400 uppercase block mb-0.5">Version B</label>
                    <select
                      value={selectedV2}
                      onChange={e => setSelectedV2(e.target.value)}
                      className="w-full px-2 py-1 rounded bg-white border border-zinc-200 text-zinc-800 text-[10px]"
                    >
                      {versions.map(v => (
                        <option key={v.id} value={v.id}>v{v.version} ({v.status})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleCompareVersions}
                  className="w-full py-1.5 bg-zinc-250 hover:bg-zinc-200 text-zinc-800 rounded font-semibold text-[10px] transition-all flex items-center justify-center gap-1"
                >
                  View Side-by-Side Diff
                </button>
              </div>
            )}

            {/* Versions scroll table */}
            <div className="max-h-60 overflow-y-auto border border-zinc-100 rounded-lg divide-y divide-zinc-100">
              {versions.map(v => (
                <div key={v.id} className="p-3 bg-white flex items-center justify-between hover:bg-zinc-50 transition-all">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-zinc-800">v{v.version}</span>
                      <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded-full uppercase ${v.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {v.status}
                      </span>
                      {v.is_active && (
                        <span className="px-1.5 py-0.5 text-[8px] font-bold rounded-full bg-indigo-50 text-indigo-700 uppercase">
                          Active
                        </span>
                      )}
                    </div>
                    {v.description && <div className="text-[10px] text-zinc-500 font-medium">{v.description}</div>}
                    <div className="text-[8px] text-zinc-400 font-mono">Created: {new Date(v.created_at).toLocaleDateString()}</div>
                  </div>

                  {!v.is_active && (
                    <button
                      onClick={() => handleActivateVersion(v.id)}
                      className="px-2 py-1 text-[9px] font-bold text-zinc-600 bg-zinc-50 border border-zinc-200 rounded hover:bg-zinc-100 transition-all flex items-center gap-0.5"
                    >
                      <GitCommit className="w-3 h-3 text-zinc-400" />
                      Rollback
                    </button>
                  )}
                </div>
              ))}
              {versions.length === 0 && (
                <div className="p-4 text-center text-xs text-zinc-400 italic">No versions recorded</div>
              )}
            </div>
          </div>

          {/* Live Simulator Panel */}
          <div className="bg-white p-5 rounded-xl border border-zinc-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-zinc-500" />
                <h3 className="font-bold text-zinc-900 text-xs uppercase tracking-wider">Test Simulation</h3>
              </div>
              <span className="text-[9px] text-zinc-400 font-mono uppercase">Sandboxed preview</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[9px] uppercase font-bold text-zinc-400 block mb-1">Target Lead for Test</label>
                <select
                  value={selectedLeadId}
                  onChange={e => setSelectedLeadId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 font-semibold"
                >
                  {leads.map(lead => (
                    <option key={lead.id} value={lead.id}>
                      {lead.company_name || lead.website.split(".")[0].toUpperCase()} ({lead.website})
                    </option>
                  ))}
                  {leads.length === 0 && <option value="">No active leads available</option>}
                </select>
              </div>

              {/* Pitch Controls overrides */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[8px] uppercase font-extrabold text-zinc-400 block mb-0.5">Tone</label>
                  <select
                    value={tone}
                    onChange={e => setTone(e.target.value)}
                    className="w-full px-2 py-1 rounded bg-white border border-zinc-200 text-zinc-800 text-[10px]"
                  >
                    <option value="casual">Casual</option>
                    <option value="founder-style">Founder</option>
                    <option value="direct">Direct</option>
                    <option value="friendly">Warm</option>
                  </select>
                </div>
                <div>
                  <label className="text-[8px] uppercase font-extrabold text-zinc-400 block mb-0.5">Length</label>
                  <select
                    value={length}
                    onChange={e => setLength(e.target.value)}
                    className="w-full px-2 py-1 rounded bg-white border border-zinc-200 text-zinc-800 text-[10px]"
                  >
                    <option value="short">Short</option>
                    <option value="medium">Medium</option>
                  </select>
                </div>
                <div>
                  <label className="text-[8px] uppercase font-extrabold text-zinc-400 block mb-0.5">CTA</label>
                  <select
                    value={cta}
                    onChange={e => setCta(e.target.value)}
                    className="w-full px-2 py-1 rounded bg-white border border-zinc-200 text-zinc-800 text-[10px]"
                  >
                    <option value="soft">Soft</option>
                    <option value="direct">Meeting</option>
                    <option value="suggestion-first">Proposal</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTestPrompt}
                disabled={isTesting || !selectedLeadId}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                {isTesting ? "Generating..." : "Run Sandboxed Simulation"}
              </button>
            </div>

            {/* Test Simulation Results */}
            {testResult && (
              <div className="space-y-3.5 animate-fade-in">
                
                {/* Meta details / Telemetry */}
                <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-[10px] space-y-1.5 font-mono">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Model Used:</span>
                    <span className="text-zinc-700 font-bold">{testResult.model_used}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Est. Tokens usage:</span>
                    <span className="text-indigo-600 font-extrabold">{testResult.token_estimate} tokens</span>
                  </div>
                  <div className="flex justify-between border-t border-zinc-200/50 pt-1.5">
                    <span className="text-zinc-400">Score Metrics:</span>
                    <span className="text-zinc-700 font-bold">
                      Q: {testResult.scores.quality_score} | P: {testResult.scores.personalization_score}
                    </span>
                  </div>
                </div>

                {/* Email details output */}
                <div className="p-3 rounded-lg border border-zinc-200 space-y-2">
                  <div>
                    <span className="text-[8px] uppercase font-bold text-zinc-400">Generated Subject</span>
                    <div className="text-xs font-extrabold text-zinc-900">{testResult.subject}</div>
                  </div>
                  <div>
                    <span className="text-[8px] uppercase font-bold text-zinc-400">Generated Body</span>
                    <pre className="p-2.5 bg-zinc-50 border border-zinc-100 rounded text-zinc-700 font-sans text-[11px] whitespace-pre-wrap leading-relaxed shadow-inner font-normal">
                      {testResult.body}
                    </pre>
                  </div>
                </div>

                {/* AI Reasoning Summary displayed internally */}
                {testResult.reasoning && (
                  <div className="border-t border-zinc-100 pt-2">
                    <button
                      onClick={() => setShowReasoning(!showReasoning)}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    >
                      <Info className="w-3.5 h-3.5" />
                      {showReasoning ? "Hide Internal AI Rationale" : "Show Internal AI Rationale"}
                    </button>
                    {showReasoning && (
                      <p className="mt-1.5 p-2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded text-[10px] leading-normal font-medium">
                        {testResult.reasoning}
                      </p>
                    )}
                  </div>
                )}

                {/* Quality Warnings */}
                {testResult.warnings.length > 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg space-y-1">
                    <div className="text-[9px] font-bold text-amber-700 flex items-center gap-1 uppercase">
                      <AlertTriangle className="w-3 h-3" />
                      Warnings flagged ({testResult.warnings.length})
                    </div>
                    <ul className="list-disc pl-4 text-[9px] text-amber-700/80 font-semibold space-y-0.5">
                      {testResult.warnings.map((w, idx) => <li key={idx}>{w}</li>)}
                    </ul>
                  </div>
                ) : (
                  <div className="p-2 bg-emerald-50 border border-emerald-100 text-emerald-700 text-[9px] font-bold rounded-lg flex items-center gap-1.5 uppercase">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Passed validation checks
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- Save Version Modal --- */}
      {showSaveVersionModal && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-xl max-w-md w-full p-6 shadow-xl space-y-5 animate-in fade-in zoom-in duration-200">
            <div>
              <h3 className="font-bold text-zinc-900 text-base">Save Immutable Template Version</h3>
              <p className="text-xs text-zinc-500 mt-1">Saves your current configurator text into the read-only templates log.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Semantic Version String</label>
                <input
                  type="text"
                  value={newVersionString}
                  onChange={e => setNewVersionString(e.target.value)}
                  placeholder="e.g. 1.1.0"
                  className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-950 text-xs focus:outline-none focus:border-zinc-950 font-mono font-semibold"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Status State</label>
                <select
                  value={newVersionStatus}
                  onChange={e => setNewVersionStatus(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-950 text-xs focus:outline-none focus:border-zinc-950 font-medium"
                >
                  <option value="published">Published & Active</option>
                  <option value="draft">Draft (Inactive template)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Version Title/Notes</label>
                <input
                  type="text"
                  value={newVersionDesc}
                  onChange={e => setNewVersionDesc(e.target.value)}
                  placeholder="e.g. Added value propositions tags"
                  className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-950 text-xs focus:outline-none focus:border-zinc-950 font-medium"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Changelog Description</label>
                <textarea
                  value={newVersionChangelog}
                  onChange={e => setNewVersionChangelog(e.target.value)}
                  placeholder="e.g. Replaced hardcoded agency name with sender.company..."
                  className="w-full h-20 px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-950 text-xs focus:outline-none focus:border-zinc-950 font-medium"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end border-t border-zinc-100 pt-4">
              <button
                type="button"
                onClick={() => setShowSaveVersionModal(false)}
                className="px-4 py-2 border border-zinc-200 text-zinc-700 hover:bg-zinc-50 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveVersion}
                className="px-4 py-2 bg-zinc-950 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold"
              >
                Save version
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Version Comparison Diff Modal --- */}
      {showDiffModal && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-xl max-w-2xl w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
              <div>
                <h3 className="font-bold text-zinc-900 text-base">Versions Comparison Diff</h3>
                <p className="text-[10px] text-zinc-500">Comparing version lines side-by-side (difflib inline diff format)</p>
              </div>
              <button
                type="button"
                onClick={() => setShowDiffModal(false)}
                className="text-zinc-400 hover:text-zinc-600 text-xs font-bold font-mono px-2 py-1 rounded bg-zinc-50"
              >
                ESC
              </button>
            </div>

            <div className="h-96 overflow-y-auto bg-zinc-50 border border-zinc-100 rounded-lg p-3 font-mono text-[10px] leading-relaxed whitespace-pre-wrap divide-y divide-zinc-200/40 space-y-0.5">
              {diffLines.map((line, idx) => {
                let colorClass = "text-zinc-600";
                let bgClass = "";
                if (line.startsWith("+")) {
                  colorClass = "text-emerald-700 font-semibold";
                  bgClass = "bg-emerald-50/70";
                } else if (line.startsWith("-")) {
                  colorClass = "text-rose-700 line-through";
                  bgClass = "bg-rose-50/70";
                } else if (line.startsWith("?")) {
                  colorClass = "text-indigo-600 font-bold";
                  bgClass = "bg-indigo-50/40";
                }
                return (
                  <div key={idx} className={`px-2 py-0.5 rounded ${colorClass} ${bgClass}`}>
                    {line}
                  </div>
                );
              })}
              {diffLines.length === 0 && (
                <div className="text-zinc-400 italic p-6 text-center">No structural differences found between versions.</div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setShowDiffModal(false)}
                className="px-4 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold"
              >
                Close Diff
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- AI Prompt Generator Modal --- */}
      {showAiModal && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-xl max-w-lg w-full p-6 shadow-xl space-y-5 animate-in fade-in zoom-in duration-200">
            <div>
              <h3 className="font-bold text-zinc-900 text-base flex items-center gap-1.5">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                AI-Assisted Template Generator
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                Describe the style of email you want to write. AI will structure a generic, variable-driven prompt guideline block.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Outreach Guidelines Description</label>
                <textarea
                  value={aiInstruction}
                  onChange={e => setAiInstruction(e.target.value)}
                  placeholder="e.g. Write a brief consultative email highlighting observations from our research. Use a friendly tone, ask about scheduling at the end, and place signature."
                  className="w-full h-32 px-3 py-2 rounded-lg border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 font-medium leading-relaxed"
                />
              </div>

              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-[10px] leading-relaxed text-zinc-500 space-y-1">
                <div className="font-bold text-zinc-700 flex items-center gap-1 uppercase">
                  <Info className="w-3.5 h-3.5 text-indigo-600" />
                  Whitelisted Placeholders
                </div>
                <p>The AI will place variable tags like <code className="font-mono text-indigo-600">{"{{first_name}}"}</code>, <code className="font-mono text-indigo-600">{"{{company_name}}"}</code>, and <code className="font-mono text-indigo-600">{"{{campaign.objective}}"}</code> automatically.</p>
              </div>
            </div>

            <div className="flex gap-2 justify-end border-t border-zinc-100 pt-4">
              <button
                type="button"
                disabled={isGeneratingPrompt}
                onClick={() => setShowAiModal(false)}
                className="px-4 py-2 border border-zinc-200 text-zinc-700 hover:bg-zinc-50 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isGeneratingPrompt || !aiInstruction.trim()}
                onClick={handleAIAssistantGenerate}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
              >
                {isGeneratingPrompt ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {isGeneratingPrompt ? "Generating..." : "Assist Generate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
