"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { 
  BarChart3, Activity, Mail, CheckCircle2, RefreshCw, AlertCircle
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
  const [loading, setLoading] = useState(true);

  const fetchAnalyticsAndLogs = async () => {
    setLoading(true);
    try {
      // 1. Fetch summary metrics
      const summaryRes = await fetch(`${API_URL}/api/v1/analytics/summary`);
      let summaryData = stats;
      if (summaryRes.ok) {
        summaryData = await summaryRes.json();
        setStats(summaryData);
      }

      // 2. Fetch chart sent-by-day metrics
      const chartRes = await fetch(`${API_URL}/api/v1/analytics/sent-by-day`);
      if (chartRes.ok) {
        const cData = await chartRes.json();
        setChartData(cData);
      }

      // 3. Fetch logs and leads to map company names
      const logsRes = await fetch(`${API_URL}/api/v1/logs/send?limit=50`);
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsAndLogs();
  }, []);

  const statsRow = [
    { name: "Total Sent Emails Today", value: String(stats.sent_today), icon: Mail, color: "text-zinc-600 bg-zinc-100 border-zinc-200" },
    { name: "Approved Queue Size", value: String(stats.approved_drafts), icon: CheckCircle2, color: "text-indigo-600 bg-indigo-50 border-indigo-100" },
    { name: "Delivery Failure Rate", value: `${stats.failure_rate}%`, icon: AlertCircle, color: "text-rose-600 bg-rose-50 border-rose-100" },
    { name: "Remaining Daily Quota", value: `${stats.remaining_today} / ${stats.daily_limit}`, icon: Activity, color: "text-amber-600 bg-amber-50 border-amber-100" }
  ];

  const totalSends = stats.website_emails_sent + stats.erp_emails_sent;
  const websitePercentage = totalSends > 0 ? Math.round((stats.website_emails_sent / totalSends) * 100) : 50;
  const erpPercentage = totalSends > 0 ? Math.round((stats.erp_emails_sent / totalSends) * 100) : 50;

  const industries = [
    { name: "Website Improve Pitches", count: stats.website_emails_sent, percentage: websitePercentage, color: "bg-indigo-600" },
    { name: "ERP Software Pitches", count: stats.erp_emails_sent, percentage: erpPercentage, color: "bg-zinc-900" },
  ];

  // SVG Chart Height scaling helper
  const maxSent = chartData.length > 0 ? Math.max(...chartData.map(c => c.sent_count)) : 10;
  const chartHeightLimit = maxSent > 0 ? maxSent : 10;

  return (
    <SidebarLayout>
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-950 tracking-tight">Campaign Telemetry Analytics</h2>
          <p className="text-xs text-zinc-500">Detailed logs, conversion metrics, and email dispatch performance</p>
        </div>
        <button 
          onClick={fetchAnalyticsAndLogs}
          disabled={loading}
          className="p-2 rounded bg-white border border-zinc-200 text-zinc-400 hover:text-zinc-600 transition-colors shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Daily sends chart */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-6 lg:col-span-2">
          <div>
            <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Sending Activity By Day</h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">Total Gmail dispatches completed per calendar day</p>
          </div>

          {/* SVG Bar Chart */}
          <div className="h-56 w-full pt-4">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-zinc-400 font-semibold uppercase">No sending activity logged in past 7 days</div>
            ) : (
              <>
                <svg className="w-full h-full" viewBox="0 0 500 180" preserveAspectRatio="none">
                  {/* Grid Lines */}
                  <line x1="0" y1="30" x2="500" y2="30" stroke="#f4f4f5" strokeWidth="1" />
                  <line x1="0" y1="80" x2="500" y2="80" stroke="#f4f4f5" strokeWidth="1" />
                  <line x1="0" y1="130" x2="500" y2="130" stroke="#f4f4f5" strokeWidth="1" />
                  
                  {/* Bars (dynamic) */}
                  {chartData.map((bar, i) => {
                    const barHeight = Math.max(8, (bar.sent_count / chartHeightLimit) * 110);
                    const xCoord = 35 + i * 65;
                    return (
                      <g key={i}>
                        <rect 
                          x={xCoord} 
                          y={150 - barHeight} 
                          width="26" 
                          height={barHeight} 
                          rx="3"
                          fill="#4f46e5"
                          className="hover:fill-indigo-500 transition-colors cursor-pointer"
                        />
                        <text 
                          x={xCoord + 13} 
                          y={142 - barHeight} 
                          fill="#52525b" 
                          fontSize="8" 
                          textAnchor="middle" 
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          {bar.sent_count}
                        </text>
                      </g>
                    );
                  })}
                  
                  <line x1="0" y1="150" x2="500" y2="150" stroke="#e4e4e7" strokeWidth="1" />
                </svg>
                <div className="flex justify-between text-[9px] text-zinc-400 px-8 mt-1 font-mono">
                  {chartData.map((bar, i) => (
                    <span key={i} className="w-12 text-center">{bar.label}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Category segmentation */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-6">
          <div>
            <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Vertical Segmentations</h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">Lead volume distributions by pitch type</p>
          </div>

          <div className="space-y-4">
            {industries.map(ind => (
              <div key={ind.name} className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-zinc-700">{ind.name}</span>
                  <span className="text-zinc-500">{ind.count} sent ({ind.percentage}%)</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div className={`h-full ${ind.color} rounded-full`} style={{ width: `${ind.percentage}%` }}></div>
                </div>
              </div>
            ))}
          </div>
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
