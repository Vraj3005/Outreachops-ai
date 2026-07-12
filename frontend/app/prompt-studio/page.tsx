"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { useToast } from "@/components/Toast";
import { 
  Code, RefreshCw, Save, Play, 
  Eye, FileText, CheckCircle2, AlertCircle, Sparkles
} from "lucide-react";

interface Lead {
  id: string;
  company_name: string | null;
  website: string;
  contact_email: string | null;
  lead_status?: string;
}

interface TestResult {
  subject: string;
  body: string;
  scores: {
    quality_score: number;
    spam_risk_score: number;
    personalization_score: number;
    clarity_score: number;
    length_score: number;
    repetition_score: number;
  };
  warnings: string[];
}

const INITIAL_PROMPTS = {
  website: `You write cold emails for a web development agency called {YOUR_AGENCY_NAME}.
Company website: {website}
Site issues: {pain_points}
Signature (copy exactly): {signature}

Write one email matching standard direct conversion guidelines...`,
  erp: `You write cold emails for a custom ERP and software development agency called {YOUR_AGENCY_NAME}.
Company website: {website}
ERP approach: {erp_approach}
Signature (copy exactly): {signature}

Write one email detailing job progress tracking modules...`
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function PromptStudioPage() {
  const [emailType, setEmailType] = useState<"website" | "erp">("erp");
  const [tone, setTone] = useState("premium-simple");
  const [length, setLength] = useState("short");
  const [cta, setCta] = useState("suggestion-first");
  const [promptText, setPromptText] = useState(INITIAL_PROMPTS.erp);
  
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [promptVersion, setPromptVersion] = useState("1.0.0");

  const [aiInstruction, setAiInstruction] = useState("");
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);

  const { toast } = useToast();

  // Load leads and initial active template
  useEffect(() => {
    const loadLeads = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/leads`);
        if (res.ok) {
          const data: Lead[] = await res.json();
          // Filter to show only the approved leads!
          const approvedLeads = data.filter((l: any) => l.lead_status === "Approved" || l.lead_status === "Processed");
          setLeads(approvedLeads);
          if (approvedLeads.length > 0) {
            setSelectedLeadId(approvedLeads[0].id);
          }
        }
      } catch (e) {
        console.error("Error fetching leads: ", e);
      }
    };
    loadLeads();
  }, []);

  const handleGeneratePromptWithAI = async () => {
    if (!aiInstruction.trim()) {
      toast("Please enter your prompt assistant instruction", "error");
      return;
    }
    setIsGeneratingPrompt(true);
    toast("AI is writing the prompt template...", "info");
    try {
      const res = await fetch(`${API_URL}/api/v1/prompts/generate-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: aiInstruction,
          email_type: emailType
        })
      });
      if (res.ok) {
        const data = await res.json();
        setPromptText(data.template_text);
        toast("Prompt template generated successfully! Click Save to activate it.");
        setAiInstruction("");
      } else {
        toast("Failed to generate prompt template", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Error generating prompt template", "error");
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const fetchActiveTemplate = async (type: "website" | "erp") => {
    try {
      const res = await fetch(`${API_URL}/api/v1/prompts/active?email_type=${type}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.template_text) {
          setPromptText(data.template_text);
          setPromptVersion(data.version || "1.0.0");
        } else {
          setPromptText(INITIAL_PROMPTS[type]);
          setPromptVersion("1.0.0");
        }
      } else {
        setPromptText(INITIAL_PROMPTS[type]);
        setPromptVersion("1.0.0");
      }
    } catch (e) {
      console.error("Error loading active template: ", e);
      setPromptText(INITIAL_PROMPTS[type]);
      setPromptVersion("1.0.0");
    }
  };

  useEffect(() => {
    fetchActiveTemplate(emailType);
  }, [emailType]);

  const handleEmailTypeChange = (type: "website" | "erp") => {
    setEmailType(type);
    setTestResult(null);
  };

  const handleTestPrompt = async () => {
    if (!selectedLeadId) {
      toast("No lead available to run test.", "error");
      return;
    }
    
    setIsTesting(true);
    toast("Connecting to Gemini API to run prompt simulation...", "info");

    try {
      const res = await fetch(`${API_URL}/api/v1/prompts/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: selectedLeadId,
          email_type: emailType,
          tone: tone,
          length: length,
          cta: cta,
          template_text: promptText
        })
      });

      if (res.ok) {
        const data = await res.json();
        setTestResult(data);
        toast("Prompt test completed! Preview loaded in test panel.");
      } else {
        const err = await res.json();
        toast(err.detail || err.message || "Failed to run simulation", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Gemini API connection error", "error");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSavePrompt = async () => {
    toast("Saving prompt template version...", "info");
    try {
      const parts = promptVersion.split(".");
      const nextPatch = parseInt(parts[2]) + 1;
      const newVer = `${parts[0]}.${parts[1]}.${nextPatch}`;
      
      const res = await fetch(`${API_URL}/api/v1/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Custom ${emailType.toUpperCase()} Pitch v${newVer}`,
          email_type: emailType,
          template_text: promptText,
          version: newVer
        })
      });

      if (res.ok) {
        setPromptVersion(newVer);
        toast(`Prompt saved and activated as version: v${newVer}`);
      } else {
        const err = await res.json();
        toast(err.detail || err.message || "Failed to save template", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Error saving template to database", "error");
    }
  };

  return (
    <SidebarLayout>
      {/* Title */}
      <div>
        <h2 className="text-lg font-bold text-zinc-950 tracking-tight">AI Prompt Studio</h2>
        <p className="text-xs text-zinc-500">Refine, compile, and validate prompt templates sent to Gemini models</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Prompt Template Editor */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-zinc-500" />
                <h3 className="font-bold text-zinc-900 text-sm">Prompt Configurator</h3>
              </div>
              <span className="text-[10px] text-zinc-400 font-mono">Active Version: v{promptVersion}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Category</label>
                <div className="w-full px-2 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-500 text-[11px] font-semibold">
                  ERP Solution
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Tone Angle</label>
                <select 
                  value={tone}
                  onChange={e => setTone(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-[11px] focus:outline-none focus:border-zinc-950"
                >
                  <option value="premium-simple">Premium Simple</option>
                  <option value="founder-style">Founder Style</option>
                  <option value="direct">Direct Punchy</option>
                  <option value="friendly">Warm Consultative</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Length Limit</label>
                <select 
                  value={length}
                  onChange={e => setLength(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-[11px] focus:outline-none focus:border-zinc-950"
                >
                  <option value="short">Short (strict bounds)</option>
                  <option value="medium">Medium (standard)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">CTA Style</label>
                <select 
                  value={cta}
                  onChange={e => setCta(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-[11px] focus:outline-none focus:border-zinc-950"
                >
                  <option value="suggestion-first">Mockup First</option>
                  <option value="direct">Meeting Pitch</option>
                  <option value="soft">Conversational</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Prompt Template Editor</label>
              <textarea 
                value={promptText}
                onChange={e => setPromptText(e.target.value)}
                className="w-full h-72 px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs font-mono focus:outline-none focus:border-zinc-950 leading-relaxed"
              />
              <span className="text-[9px] text-zinc-400 mt-1.5 block leading-normal">
                Variables: <code className="bg-zinc-50 border border-zinc-200 px-1 py-0.5 rounded text-[8px] font-mono font-bold text-zinc-600">{"{website}, {erp_approach}, {YOUR_AGENCY_NAME}, {signature}"}</code>
              </span>
            </div>

            <div className="space-y-2 border-t border-zinc-100 pt-4 mt-2">
              <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">AI Prompt Assistant (Write your instruction)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. make the template friendly, brief, and under 80 words..."
                  value={aiInstruction}
                  onChange={e => setAiInstruction(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 font-medium placeholder-zinc-400"
                />
                <button
                  type="button"
                  onClick={handleGeneratePromptWithAI}
                  disabled={isGeneratingPrompt}
                  className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  {isGeneratingPrompt ? "Writing..." : "AI Generate"}
                </button>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100 flex justify-end">
            <button 
              onClick={handleSavePrompt}
              className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              Save & Activate Prompt
            </button>
          </div>
        </div>

        {/* Right Column: Testing and Live Preview Panel */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-zinc-500" />
                <h3 className="font-bold text-zinc-900 text-sm">Testing Simulator</h3>
              </div>
              <span className="text-[10px] text-zinc-400 font-mono">Dynamic Lead Binding</span>
            </div>

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Select Target Lead for Test</label>
                <select 
                  value={selectedLeadId}
                  onChange={e => setSelectedLeadId(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                >
                  {leads.map(lead => (
                    <option key={lead.id} value={lead.id}>
                      {lead.company_name || lead.website.split(".")[0].toUpperCase()} ({lead.website})
                    </option>
                  ))}
                  {leads.length === 0 && (
                    <option value="">No leads in database</option>
                  )}
                </select>
              </div>

              <button 
                onClick={handleTestPrompt}
                disabled={isTesting || !selectedLeadId}
                className="inline-flex items-center gap-2 px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold h-[30px] transition-all shadow-sm"
              >
                {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                Run Simulation
              </button>
            </div>

            {/* Test Results Output */}
            <div className="space-y-3">
              <label className="text-[10px] uppercase font-bold text-zinc-400 block">Generated Preview Output</label>
              
              {!testResult && !isTesting ? (
                <div className="h-96 rounded-lg bg-zinc-50 border border-zinc-200 flex flex-col items-center justify-center p-6 text-center text-zinc-400">
                  <FileText className="w-8 h-8 mb-2 text-zinc-300" />
                  <span className="text-xs font-semibold">{"Click \"Run Simulation\" to render Gemini generated email drafts."}</span>
                </div>
              ) : isTesting ? (
                <div className="h-96 rounded-lg bg-zinc-50 border border-zinc-200 flex flex-col items-center justify-center p-6 text-center text-indigo-600">
                  <RefreshCw className="w-8 h-8 mb-2 animate-spin" />
                  <span className="text-xs font-semibold">Running Gemini prompt models...</span>
                </div>
              ) : testResult ? (
                <div className="space-y-4 animate-fade-in">
                  {/* Subject and Body output */}
                  <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 space-y-3 text-[11px] max-h-60 overflow-y-auto">
                    <div>
                      <span className="text-zinc-400 font-bold uppercase text-[9px] block">Subject Line</span>
                      <div className="text-zinc-900 font-bold mt-0.5">{testResult.subject}</div>
                    </div>
                    <div>
                      <span className="text-zinc-400 font-bold uppercase text-[9px] block">Email Body</span>
                      <p className="text-zinc-700 leading-relaxed mt-1 whitespace-pre-line font-mono bg-white p-3 rounded border border-zinc-100">{testResult.body}</p>
                    </div>
                  </div>

                  {/* Quality metrics preview */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <div className="bg-zinc-50 border border-zinc-200 p-2.5 rounded text-center">
                      <div className="text-[8px] uppercase font-bold text-zinc-400">Quality Score</div>
                      <div className="text-xs font-mono font-extrabold text-indigo-600 mt-0.5">{testResult.scores.quality_score} / 10</div>
                    </div>
                    <div className="bg-zinc-50 border border-zinc-200 p-2.5 rounded text-center">
                      <div className="text-[8px] uppercase font-bold text-zinc-400">Personalization</div>
                      <div className="text-xs font-mono font-extrabold text-emerald-600 mt-0.5">{testResult.scores.personalization_score} / 10</div>
                    </div>
                    <div className="bg-zinc-50 border border-zinc-200 p-2.5 rounded text-center">
                      <div className="text-[8px] uppercase font-bold text-zinc-400">Spam Risk</div>
                      <div className="text-xs font-mono font-extrabold text-rose-600 mt-0.5">{testResult.scores.spam_risk_score} / 10</div>
                    </div>
                    <div className="bg-zinc-50 border border-zinc-200 p-2.5 rounded text-center">
                      <div className="text-[8px] uppercase font-bold text-zinc-400">Clarity Score</div>
                      <div className="text-xs font-mono font-extrabold text-violet-600 mt-0.5">{testResult.scores.clarity_score} / 10</div>
                    </div>
                  </div>

                  {/* Warnings in Simulation */}
                  {testResult.warnings && testResult.warnings.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[9px] font-bold text-amber-700 uppercase">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Quality issues flagged ({testResult.warnings.length})</span>
                      </div>
                      <ul className="list-disc pl-4 text-[9px] text-amber-700/80 space-y-0.5 font-medium">
                        {testResult.warnings.map((warn, i) => (
                          <li key={i}>{warn}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {testResult.warnings && testResult.warnings.length === 0 && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-700 text-[9px] font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>CONFORMS TO OUTBOUND EMAIL GUIDELINES (0 WARNINGS)</span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="text-[10px] text-zinc-400 font-mono text-center pt-2">
            Testing will not impact existing database drafts.
          </div>
        </div>

      </div>
    </SidebarLayout>
  );
}
