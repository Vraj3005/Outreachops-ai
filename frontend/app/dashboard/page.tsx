"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { 
  Users, CheckSquare, Send, XCircle, 
  Sparkles, Zap, TrendingUp, AlertCircle, RefreshCw 
} from "lucide-react";

interface Metrics {
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics>({
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
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/analytics/summary`);
        if (res.ok) {
          const data = await res.json();
          setMetrics(data);
        }
      } catch (e) {
        console.error("Failed to load metrics: ", e);
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
  }, []);

  const stats = [
    { name: "Total Leads", value: String(metrics.total_leads), icon: Users, desc: "Lead contacts synced", color: "text-zinc-600 bg-zinc-100 border-zinc-200" },
    { name: "Pending Drafts", value: String(metrics.pending_drafts), icon: AlertCircle, desc: "Draft copy pending review", color: "text-amber-600 bg-amber-50 border-amber-100" },
    { name: "Approved Drafts", value: String(metrics.approved_drafts), icon: CheckSquare, desc: "Queued for dispatch", color: "text-indigo-600 bg-indigo-50 border-indigo-100" },
    { name: "Sent Today", value: String(metrics.sent_today), icon: Send, desc: "Delivered to target inboxes", color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
    { name: "Remaining Send Capacity", value: String(metrics.remaining_today), icon: Zap, desc: "Emails left within limit today", color: "text-zinc-700 bg-zinc-100 border-zinc-200" },
    { name: "Failed Sends", value: String(metrics.failed_today), icon: XCircle, desc: "Mailing SMTP api exceptions", color: "text-rose-600 bg-rose-50 border-rose-100" },
    { name: "Approval Rate", value: `${metrics.approval_rate}%`, icon: Sparkles, desc: "Ratio of approved drafts", color: "text-violet-600 bg-violet-50 border-violet-100" },
    { name: "Gmail Capacity Status", value: `${500 - metrics.sent_today} / 500`, icon: Zap, desc: "Free account sending margin", color: "text-zinc-600 bg-zinc-100 border-zinc-200" },
  ];

  if (loading) {
    return (
      <SidebarLayout>
        {/* Title skeleton */}
        <div className="space-y-2">
          <div className="h-6 w-48 bg-zinc-200 animate-pulse rounded"></div>
          <div className="h-3 w-80 bg-zinc-100 animate-pulse rounded"></div>
        </div>

        {/* Stats grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white border border-zinc-200 p-5 rounded-xl h-28 flex flex-col justify-between animate-pulse">
              <div className="flex justify-between items-center">
                <div className="h-3 w-20 bg-zinc-100 rounded"></div>
                <div className="h-5 w-5 bg-zinc-200 rounded-full"></div>
              </div>
              <div className="space-y-2">
                <div className="h-6 w-12 bg-zinc-200 rounded"></div>
                <div className="h-3 w-28 bg-zinc-100 rounded"></div>
              </div>
            </div>
          ))}
        </div>

        {/* Charts skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white border border-zinc-200 p-6 rounded-xl h-72 animate-pulse lg:col-span-2 space-y-4">
            <div className="flex justify-between items-center">
              <div className="h-4 w-32 bg-zinc-200 rounded"></div>
              <div className="h-3 w-24 bg-zinc-100 rounded"></div>
            </div>
            <div className="h-48 bg-zinc-50 rounded-lg"></div>
          </div>
          <div className="bg-white border border-zinc-200 p-6 rounded-xl h-72 animate-pulse space-y-4">
            <div className="h-4 w-28 bg-zinc-200 rounded"></div>
            <div className="h-3 w-20 bg-zinc-100 rounded"></div>
            <div className="h-36 bg-zinc-50 rounded-lg"></div>
          </div>
        </div>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout>
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-950 tracking-tight">Campaign Operations Console</h2>
          <p className="text-xs text-zinc-500">Aggregated statistics and health summaries of OutreachOps campaign workflows</p>
        </div>
      </div>

      {/* Grid of metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.name} className="bg-white p-5 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] relative overflow-hidden flex flex-col justify-between h-28">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">{s.name}</span>
                <div className={`p-1 rounded-md border ${s.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-zinc-900 mt-1">{s.value}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">{s.desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Analytics Chart Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 1. Emails Sent Over Time (SVG) */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Outreach Sent Over Time</h3>
            <span className="text-[10px] text-indigo-600 font-semibold flex items-center gap-1 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
              <TrendingUp className="w-3 h-3" /> Live dispatches active
            </span>
          </div>
          
          {/* SVG line chart */}
          <div className="h-48 w-full relative pt-4">
            <svg className="w-full h-full" viewBox="0 0 600 200" preserveAspectRatio="none">
              <defs>
                <linearGradient id="gradient-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.08"/>
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0"/>
                </linearGradient>
              </defs>
              {/* Grid Lines */}
              <line x1="0" y1="40" x2="600" y2="40" stroke="#f4f4f5" strokeWidth="1" />
              <line x1="0" y1="100" x2="600" y2="100" stroke="#f4f4f5" strokeWidth="1" />
              <line x1="0" y1="160" x2="600" y2="160" stroke="#f4f4f5" strokeWidth="1" />
              
              {/* Graph Line Area */}
              <path 
                d="M0 160 Q 100 120, 200 140 T 400 60 T 600 30 L 600 200 L 0 200 Z" 
                fill="url(#gradient-area)" 
              />
              {/* Graph Line */}
              <path 
                d="M0 160 Q 100 120, 200 140 T 400 60 T 600 30" 
                fill="none" 
                stroke="#4f46e5" 
                strokeWidth="2" 
                strokeLinecap="round"
              />
            </svg>
            <div className="flex justify-between text-[9px] text-zinc-400 mt-2 font-mono">
              <span>Mon</span>
              <span>Wed</span>
              <span>Fri</span>
              <span>Sun</span>
            </div>
          </div>
        </div>

        {/* 2. ERP Campaign Telemetry */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-6">
          <div>
            <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">ERP Campaign Telemetry</h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">Telemetry tracking active ERP outreach</p>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-700 mb-1">
                <span>Total Generated Drafts</span>
                <span>{metrics.total_drafts} drafts</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                <div 
                  className="h-full bg-indigo-600 rounded-full" 
                  style={{ width: "100%" }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-700 mb-1">
                <span>ERP Software Pitches Sent</span>
                <span>{metrics.sent_today} today</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                <div 
                  className="h-full bg-zinc-950 rounded-full" 
                  style={{ 
                    width: `${metrics.daily_limit > 0 
                      ? (metrics.sent_today / metrics.daily_limit) * 100 
                      : 0}%` 
                  }}
                ></div>
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-4 space-y-4">
            <div>
              <h4 className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-3">Draft Queue Breakdown</h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded bg-emerald-50 border border-emerald-100">
                  <div className="text-xs font-bold text-emerald-800">{metrics.approval_rate}%</div>
                  <div className="text-[8px] text-emerald-600 font-semibold uppercase mt-0.5">Approved</div>
                </div>
                <div className="p-2 rounded bg-amber-50 border border-amber-100">
                  <div className="text-xs font-bold text-amber-800">
                    {metrics.total_drafts > 0 ? round((metrics.pending_drafts / metrics.total_drafts) * 100, 1) : 0}%
                  </div>
                  <div className="text-[8px] text-amber-600 font-semibold uppercase mt-0.5">Pending</div>
                </div>
                <div className="p-2 rounded bg-rose-50 border border-rose-100">
                  <div className="text-xs font-bold text-rose-800">{metrics.failure_rate}%</div>
                  <div className="text-[8px] text-rose-600 font-semibold uppercase mt-0.5">Failure</div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </SidebarLayout>
  );
}

function round(value: number, precision: number) {
  var multiplier = Math.pow(10, precision || 0);
  return Math.round(value * multiplier) / multiplier;
}
