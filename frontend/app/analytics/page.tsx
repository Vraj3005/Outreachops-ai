"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { useToast } from "@/components/Toast";
import { 
  BarChart3, Activity, Mail, CheckCircle2, RefreshCw, AlertCircle,
  TrendingUp, Layers, HelpCircle, Plus, Play, Pause, Square, AlertTriangle
} from "lucide-react";

interface SummaryStats {
  total_leads: number;
  total_drafts: number;
  pending_drafts: number;
  approved_drafts: number;
  sent_today: number;
  failed_today: number;
  website_emails_sent: number;
  erp_emails_sent: number;
  daily_limit: number;
  remaining_today: number;
  approval_rate: number;
  failure_rate: number;
}

interface ChartItem {
  date: string;
  label: string;
  sent_count: number;
}

interface Lead {
  id: string;
  company_name: string | null;
  website: string;
}

interface SendLog {
  id: string;
  sent_at: string;
  recipient_email: string;
  subject: string | null;
  email_type: string | null;
  status: string;
  error_message: string | null;
  lead_id: string | null;
  company_name?: string;
}

interface FunnelData {
  imported: number;
  researched: number;
  generated: number;
  approved: number;
  scheduled: number;
  sent: number;
  replied: number;
  positive_reply: number;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  parent_campaign_id?: string;
}

interface PromptVersion {
  id: string;
  version_name: string;
}

interface ExperimentVariant {
  id: string;
  name: string;
  prompt_template_version_id?: string;
  sample_count: number;
  sends: number;
  replies: number;
  positive_replies: number;
  reply_rate: number;
  positive_rate: number;
}

interface ExperimentReport {
  experiment_id: string;
  name: string;
  status: string;
  primary_metric: string;
  variants: ExperimentVariant[];
  comparison: {
    rate_difference: number;
    standard_error: number;
    confidence_interval_95: number[];
    insufficient_data: boolean;
    declared_winner: string;
    min_required_sends: number;
  };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function AnalyticsPage() {
  const [stats, setStats] = useState<SummaryStats>({
    total_leads: 0,
    total_drafts: 0,
    pending_drafts: 0,
    approved_drafts: 0,
    sent_today: 0,
    failed_today: 0,
    website_emails_sent: 0,
    erp_emails_sent: 0,
    daily_limit: 50,
    remaining_today: 50,
    approval_rate: 0.0,
    failure_rate: 0.0
  });

  const [chartData, setChartData] = useState<ChartItem[]>([]);
  const [logs, setLogs] = useState<SendLog[]>([]);
  const [funnel, setFunnel] = useState<FunnelData>({
    imported: 0, researched: 0, generated: 0, approved: 0, scheduled: 0, sent: 0, replied: 0, positive_reply: 0
  });
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [promptVersions, setPromptVersions] = useState<PromptVersion[]>([]);
  const [experiments, setExperiments] = useState<ExperimentReport[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  
  // Experiment Form
  const [newExpName, setNewExpName] = useState("");
  const [newExpCampaign, setNewExpCampaign] = useState("");
  const [varAPrompt, setVarAPrompt] = useState("");
  const [varBPrompt, setVarBPrompt] = useState("");

  const [loading, setLoading] = useState(true);
  const [submittingExp, setSubmittingExp] = useState(false);
  const { toast } = useToast();

  const fetchMetadata = async () => {
    try {
      const campRes = await fetch(`${API_URL}/api/v1/campaigns`);
      if (campRes.ok) {
        const cData = await campRes.json();
        setCampaigns(cData || []);
        if (cData.length > 0) setNewExpCampaign(cData[0].id);
      }
      
      const promptRes = await fetch(`${API_URL}/api/v1/prompts/versions`);
      if (promptRes.ok) {
        const pData = await promptRes.json();
        setPromptVersions(pData || []);
        if (pData.length > 0) {
          setVarAPrompt(pData[0].id);
          setVarBPrompt(pData[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAnalyticsAndLogs = async () => {
    setLoading(true);
    try {
      // 1. Fetch summary metrics
      const summaryRes = await fetch(`${API_URL}/api/v1/analytics/summary`);
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setStats(summaryData);
      }

      // 2. Fetch chart sent-by-day metrics
      const chartRes = await fetch(`${API_URL}/api/v1/analytics/sent-by-day`);
      if (chartRes.ok) {
        const cData = await chartRes.json();
        setChartData(cData);
      }

      // 3. Fetch funnel conversion telemetry
      const funnelUrl = selectedCampaign === "all" ? `${API_URL}/api/v1/analytics/funnel` : `${API_URL}/api/v1/analytics/funnel?campaign_id=${selectedCampaign}`;
      const funnelRes = await fetch(funnelUrl);
      if (funnelRes.ok) {
        const fData = await funnelRes.json();
        setFunnel(fData);
      }

      // 4. Fetch experiments and calculate statistical reports
      const expRes = await fetch(`${API_URL}/api/v1/analytics/experiments`);
      if (expRes.ok) {
        const expList = await expRes.json();
        const reports: ExperimentReport[] = [];
        for (const e of expList) {
          const detailRes = await fetch(`${API_URL}/api/v1/analytics/experiments/${e.id}`);
          if (detailRes.ok) {
            const report = await detailRes.json();
            reports.push(report);
          }
        }
        setExperiments(reports);
      }

      // 5. Fetch logs and leads to map company names
      const logsRes = await fetch(`${API_URL}/api/v1/logs/send?limit=10`);
      const leadsRes = await fetch(`${API_URL}/api/v1/leads`);
      
      let leadsMap: Record<string, Lead> = {};
      if (leadsRes.ok) {
        const leadsData: Lead[] = await leadsRes.json();
        leadsData.forEach(l => {
          leadsMap[l.id] = l;
        });
      }

      if (logsRes.ok) {
        const logsData: SendLog[] = await logsRes.json();
        const mappedLogs = logsData.map(log => {
          const company = log.lead_id ? leadsMap[log.lead_id] : null;
          return {
            ...log,
            company_name: company ? (company.company_name || company.website.split(".")[0].toUpperCase()) : "Manual / Unknown"
          };
        });
        setLogs(mappedLogs);
      }
    } catch (e) {
      console.error(e);
      toast("Error fetching analytics metrics.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetadata();
    fetchAnalyticsAndLogs();
  }, [selectedCampaign]);

  const handleCreateExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpName || !newExpCampaign) {
      toast("Please fill in all experiment details.", "error");
      return;
    }
    setSubmittingExp(true);
    try {
      const payload = {
        name: newExpName,
        campaign_id: newExpCampaign,
        primary_metric: "reply_rate",
        variants: [
          { name: "A", prompt_template_version_id: varAPrompt, weight: 0.5 },
          { name: "B", prompt_template_version_id: varBPrompt, weight: 0.5 }
        ]
      };

      const res = await fetch(`${API_URL}/api/v1/analytics/experiments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast("A/B Experiment launched successfully.", "success");
        setNewExpName("");
        fetchAnalyticsAndLogs();
      } else {
        toast("Failed to build experiment.", "error");
      }
    } catch (err) {
      console.error(err);
      toast("Connection error", "error");
    } finally {
      setSubmittingExp(false);
    }
  };

  const handleStopExperiment = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/analytics/experiments/${id}/stop`, {
        method: "POST"
      });
      if (res.ok) {
        toast("Experiment stopped successfully.", "success");
        fetchAnalyticsAndLogs();
      } else {
        toast("Failed to stop experiment.", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Connection error", "error");
    }
  };

  const statsRow = [
    { name: "Total Sent Emails Today", value: String(stats.sent_today), icon: Mail, color: "text-zinc-600 bg-zinc-100 border-zinc-200" },
    { name: "Approved Queue Size", value: String(stats.approved_drafts), icon: CheckCircle2, color: "text-indigo-600 bg-indigo-50 border-indigo-100" },
    { name: "Delivery Failure Rate", value: `${stats.failure_rate}%`, icon: AlertCircle, color: "text-rose-600 bg-rose-50 border-rose-100" },
    { name: "Remaining Daily Quota", value: `${stats.remaining_today} / ${stats.daily_limit}`, icon: Activity, color: "text-amber-600 bg-amber-50 border-amber-100" }
  ];

  const getFunnelPct = (val: number, base: number) => {
    if (base === 0) return 0;
    return Math.round((val / base) * 100);
  };

  return (
    <SidebarLayout>
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-950 tracking-tight">Campaign Telemetry Analytics</h2>
          <p className="text-xs text-zinc-500">Detailed logs, conversion metrics, and email dispatch performance</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedCampaign}
            onChange={e => setSelectedCampaign(e.target.value)}
            className="px-3 py-1.5 bg-white border border-zinc-200 rounded text-xs font-semibold text-zinc-700 focus:outline-none"
          >
            <option value="all">All Campaigns</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button 
            onClick={fetchAnalyticsAndLogs}
            disabled={loading}
            className="p-2 rounded bg-white border border-zinc-200 text-zinc-400 hover:text-zinc-600 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsRow.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.name} className="bg-white p-5 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col justify-between h-28">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">{s.name}</span>
                <div className={`p-1 rounded-md border ${s.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-zinc-900">{s.value}</div>
            </div>
          );
        })}
      </div>

      {/* Upgraded Conversion Funnel Visual */}
      <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-6">
        <div>
          <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-indigo-500" /> Lead Conversion Funnel
          </h3>
          <p className="text-[10px] text-zinc-500 mt-0.5">Aggregate conversion steps from import to positive replies</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 text-center">
          {[
            { label: "Imported", count: funnel.imported, base: funnel.imported },
            { label: "Researched", count: funnel.researched, base: funnel.imported },
            { label: "Generated", count: funnel.generated, base: funnel.researched },
            { label: "Approved", count: funnel.approved, base: funnel.generated },
            { label: "Scheduled", count: funnel.scheduled, base: funnel.approved },
            { label: "Sent", count: funnel.sent, base: funnel.approved },
            { label: "Replied", count: funnel.replied, base: funnel.sent },
            { label: "Interested", count: funnel.positive_reply, base: funnel.replied }
          ].map((stage, idx) => (
            <div key={stage.label} className="p-4 rounded-lg bg-zinc-50 border border-zinc-200/60 space-y-2 relative">
              <div className="text-[10px] text-zinc-400 font-extrabold uppercase tracking-wider">{stage.label}</div>
              <div className="text-xl font-black text-zinc-800 font-mono">{stage.count}</div>
              <div className="text-[10px] text-indigo-600 font-bold font-mono bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100/50 inline-block">
                {getFunnelPct(stage.count, stage.base)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* A/B Experiments and variant comparing statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Columns: Experiments reports */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-6">
            <div>
              <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-500" /> Active A/B Experiments & Stats
              </h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">Live variant Z-proportions, confidence intervals and margin of errors</p>
            </div>

            {experiments.length === 0 ? (
              <div className="p-12 text-center text-xs text-zinc-400 font-semibold italic border border-dashed border-zinc-200 rounded-lg">
                No active experiments configured. Launch one on the right to compare templates.
              </div>
            ) : (
              <div className="space-y-8">
                {experiments.map(exp => (
                  <div key={exp.experiment_id} className="p-5 rounded-lg border border-zinc-200/80 bg-zinc-50/20 space-y-4">
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-zinc-950">{exp.name}</h4>
                        <div className="text-[9px] text-zinc-400 font-semibold uppercase font-mono mt-0.5">Primary Metric: {exp.primary_metric}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wider ${
                          exp.status === "active" ? "bg-emerald-50 border-emerald-100 text-emerald-600 animate-pulse" : "bg-zinc-100 border-zinc-200 text-zinc-500"
                        }`}>
                          {exp.status}
                        </span>
                        {exp.status === "active" && (
                          <button
                            onClick={() => handleStopExperiment(exp.experiment_id)}
                            className="p-1 rounded hover:bg-rose-50 hover:text-rose-600 border border-zinc-200 bg-white transition-colors"
                            title="Complete Experiment"
                          >
                            <Square className="w-3 h-3 text-rose-500 shrink-0" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {exp.variants.map(v => (
                        <div key={v.id} className="p-4 bg-white rounded-lg border border-zinc-200 shadow-sm space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-xs text-zinc-800">Variant {v.name}</span>
                            <span className="text-[9px] font-mono text-zinc-400 truncate max-w-[120px]" title={v.prompt_template_version_id}>
                              ID: {v.prompt_template_version_id}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono text-zinc-500">
                            <div>
                              <div className="font-bold text-zinc-700">{v.sends}</div>
                              <div>Sends</div>
                            </div>
                            <div>
                              <div className="font-bold text-zinc-700">{v.replies}</div>
                              <div>Replies</div>
                            </div>
                            <div>
                              <div className="font-bold text-indigo-600">{Math.round(v.reply_rate * 100)}%</div>
                              <div className="font-bold">Rate</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Stats details Z-Proportion math outcomes */}
                    {exp.comparison && (
                      <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-lg space-y-1.5 text-[10px]">
                        <div className="flex items-center justify-between text-zinc-600 font-semibold font-mono">
                          <span>Rate Difference:</span>
                          <span className="font-bold">{Math.round(exp.comparison.rate_difference * 100)}%</span>
                        </div>
                        {exp.comparison.insufficient_data ? (
                          <div className="flex items-center gap-1.5 text-amber-700 font-bold p-1 bg-amber-50 border border-amber-100 rounded">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>Warning: Insufficient sample size (&lt; {exp.comparison.min_required_sends} sends per variant). Z-proportion stats disabled.</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between text-zinc-500 font-mono">
                              <span>95% Confidence Interval:</span>
                              <span className="font-bold">
                                [{Math.round(exp.comparison.confidence_interval_95[0] * 100)}%, {Math.round(exp.comparison.confidence_interval_95[1] * 100)}%]
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-zinc-700 font-bold pt-1 border-t border-zinc-200/60 font-sans">
                              <span>Winner status:</span>
                              <span className="text-emerald-700 uppercase tracking-wide text-[9px]">{exp.comparison.declared_winner}</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Column: Create Experiment form */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-6 self-start">
          <div>
            <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-indigo-500" /> Create A/B Variant
            </h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">Configure prompt template allocations</p>
          </div>

          <form onSubmit={handleCreateExperiment} className="space-y-4 text-xs font-semibold text-zinc-700">
            <div className="space-y-1">
              <label>Experiment Name</label>
              <input
                type="text"
                value={newExpName}
                onChange={e => setNewExpName(e.target.value)}
                placeholder="e.g. ERP Pitch Subject Test"
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded text-xs focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label>Target Campaign</label>
              <select
                value={newExpCampaign}
                onChange={e => setNewExpCampaign(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded text-xs focus:outline-none"
              >
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label>Variant A Version</label>
              <select
                value={varAPrompt}
                onChange={e => setVarAPrompt(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded text-xs focus:outline-none"
              >
                {promptVersions.map(p => (
                  <option key={p.id} value={p.id}>{p.version_name || p.id}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label>Variant B Version</label>
              <select
                value={varBPrompt}
                onChange={e => setVarBPrompt(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded text-xs focus:outline-none"
              >
                {promptVersions.map(p => (
                  <option key={p.id} value={p.id}>{p.version_name || p.id}</option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={submittingExp}
              className="w-full py-2 bg-zinc-900 text-white rounded font-bold hover:bg-zinc-800 transition-colors shadow-sm uppercase tracking-wider text-[10px]"
            >
              {submittingExp ? "Creating..." : "Launch Experiment"}
            </button>
          </form>
        </div>

      </div>

      {/* Sent Emails Log Table */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden mt-8">
        <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50/50 flex items-center justify-between">
          <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Outbound Dispatch Log</h3>
          <span className="text-[10px] text-zinc-400 font-mono">Displaying last {logs.length} attempts</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/50 text-zinc-500 text-[10px] font-bold uppercase tracking-wider">
                <th className="p-4">Date</th>
                <th className="p-4">Company</th>
                <th className="p-4">Recipient</th>
                <th className="p-4">Email Type</th>
                <th className="p-4">Subject</th>
                <th className="p-4">Status</th>
                <th className="p-4">Error Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-[11px]">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-zinc-500 font-medium">
                    No outbound mail logs recorded yet.
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-zinc-50/40">
                    <td className="p-4 font-mono text-zinc-400">{new Date(log.sent_at).toLocaleString()}</td>
                    <td className="p-4 font-bold text-zinc-900">{log.company_name}</td>
                    <td className="p-4 text-zinc-700 font-medium">{log.recipient_email}</td>
                    <td className="p-4 capitalize text-indigo-600 font-semibold">{log.email_type || "follow-up"}</td>
                    <td className="p-4 max-w-[200px] truncate text-zinc-600" title={log.subject || ""}>{log.subject}</td>
                    <td className="p-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                        log.status === "sent" 
                          ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                          : "bg-rose-50 border-rose-100 text-rose-700"
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="p-4 text-rose-700 font-medium max-w-[200px] truncate" title={log.error_message || ""}>
                      {log.error_message || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SidebarLayout>
  );
}
