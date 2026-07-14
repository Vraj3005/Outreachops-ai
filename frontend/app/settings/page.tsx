"use client";

import React, { useState, useEffect, useRef } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { useToast } from "@/components/Toast";
import { 
  Save, Eye, User, Phone, Globe, Building, Sliders, Globe2, Clock, ShieldAlert, FileText, CheckCircle
} from "lucide-react";

interface SettingsState {
  business_name: string;
  website: string;
  sender_name: string;
  sender_email: string;
  sender_phone: string;
  default_signature: string;
  brand_voice: string;
  offer_description: string;
  default_target_audience: string;
  default_tone: string;
  default_cta: string;
  default_language: string;
  timezone: string;
  daily_send_limit: number;
  minimum_send_spacing_seconds: number;
  allowed_send_start: string;
  allowed_send_end: string;
  required_footer: string;
  banned_phrases: string[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function SettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  // Stored state for optimistic rollbacks
  const [settings, setSettings] = useState<SettingsState>({
    business_name: "Pitbull Corporations",
    website: "https://pitbullcorporations.com",
    sender_name: "Vraj",
    sender_email: "yash69699696@gmail.com",
    sender_phone: "",
    default_signature: "",
    brand_voice: "",
    offer_description: "",
    default_target_audience: "",
    default_tone: "professional",
    default_cta: "",
    default_language: "en",
    timezone: "UTC",
    daily_send_limit: 50,
    minimum_send_spacing_seconds: 60,
    allowed_send_start: "09:00",
    allowed_send_end: "17:00",
    required_footer: "",
    banned_phrases: []
  });

  const previousSettingsRef = useRef<SettingsState | null>(null);

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch(`${API_URL}/api/v1/settings`);
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
          previousSettingsRef.current = data;
        } else {
          toast("Failed to load backend settings.", "error");
        }
      } catch (err) {
        toast("Connection to backend settings API failed.", "error");
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [toast]);

  // Handle setting updates optimistically
  const handleFieldChange = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    // Preserve copy of current settings for potential rollback
    if (!previousSettingsRef.current) {
      previousSettingsRef.current = { ...settings };
    }
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings.business_name || !settings.website || !settings.sender_name) {
      toast("Please fill in required branding variables.", "error");
      return;
    }

    // Save previous state for rollback
    const backupState = previousSettingsRef.current || { ...settings };
    previousSettingsRef.current = { ...settings };

    toast("Saving settings...", "info");
    try {
      const res = await fetch(`${API_URL}/api/v1/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });

      if (res.ok) {
        const updated = await res.json();
        setSettings(updated);
        previousSettingsRef.current = updated;
        toast("Configuration successfully persisted to database.", "success");
      } else {
        const err = await res.json();
        toast(err.detail || "Failed to persist settings.", "error");
        // Revert optimistically
        setSettings(backupState);
        previousSettingsRef.current = backupState;
      }
    } catch (e) {
      toast("API connection failed. Settings reverted.", "error");
      // Revert optimistically
      setSettings(backupState);
      previousSettingsRef.current = backupState;
    }
  };

  // Compile signature preview helper
  const getSignaturePreview = () => {
    if (settings.default_signature) return settings.default_signature;
    const phoneSuffix = settings.sender_phone ? ` | ${settings.sender_phone}` : "";
    return `${settings.sender_name} | ${settings.business_name} | ${settings.website}${phoneSuffix}`;
  };

  if (loading) {
    return (
      <SidebarLayout>
        <div className="p-8 text-center text-xs text-zinc-500 animate-pulse font-sans">
          Loading persisted owner settings...
        </div>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout>
      {/* Title */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-zinc-950 tracking-tight font-sans">Configuration Settings</h2>
        <p className="text-xs text-zinc-500 font-sans">Configure branding parameters, signature outlines, and dispatch window queues</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans">
        
        {/* Settings Form */}
        <form onSubmit={handleSave} className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-6 lg:col-span-2">
          
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-4">
            <Sliders className="w-4 h-4 text-zinc-500" />
            <h3 className="font-bold text-zinc-900 text-sm">System Variables</h3>
          </div>

          <div className="space-y-5 text-xs">
            
            {/* Row 1: Brand details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Business / Brand Name *</label>
                <div className="relative">
                  <Building className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                  <input 
                    type="text" 
                    value={settings.business_name}
                    onChange={e => handleFieldChange("business_name", e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Brand Website URL *</label>
                <div className="relative">
                  <Globe className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                  <input 
                    type="text" 
                    value={settings.website}
                    onChange={e => handleFieldChange("website", e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Row 2: Sender details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Sender Name *</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                  <input 
                    type="text" 
                    value={settings.sender_name}
                    onChange={e => handleFieldChange("sender_name", e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Sender Email</label>
                <input 
                  type="email" 
                  value={settings.sender_email}
                  onChange={e => handleFieldChange("sender_email", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Sender Phone</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                  <input 
                    type="text" 
                    value={settings.sender_phone}
                    onChange={e => handleFieldChange("sender_phone", e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none"
                    placeholder="e.g. +16175550100"
                  />
                </div>
              </div>
            </div>

            {/* AI Copywriting Directives */}
            <div className="bg-zinc-50 p-4 border border-zinc-200 rounded-xl space-y-4">
              <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">AI Generation Context</span>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Brand Voice description</label>
                  <textarea 
                    value={settings.brand_voice}
                    onChange={e => handleFieldChange("brand_voice", e.target.value)}
                    rows={2}
                    placeholder="e.g. Direct, outcome-oriented, zero buzzwords."
                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 font-medium"
                  />
                </div>
                
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Core Offer description</label>
                  <textarea 
                    value={settings.offer_description}
                    onChange={e => handleFieldChange("offer_description", e.target.value)}
                    rows={2}
                    placeholder="e.g. Customized operational scheduling software integrations."
                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Target Audience</label>
                  <input 
                    type="text"
                    value={settings.default_target_audience}
                    onChange={e => handleFieldChange("default_target_audience", e.target.value)}
                    placeholder="e.g. Subcontractors"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Default Tone</label>
                  <select
                    value={settings.default_tone}
                    onChange={e => handleFieldChange("default_tone", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none"
                  >
                    <option value="professional">Professional</option>
                    <option value="direct">Direct</option>
                    <option value="founder-style">Founder style</option>
                    <option value="consultative">Consultative</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Default Call to Action (CTA)</label>
                  <input 
                    type="text"
                    value={settings.default_cta}
                    onChange={e => handleFieldChange("default_cta", e.target.value)}
                    placeholder="Are you open to a call next Tuesday?"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Sending Queue parameter limits */}
            <div className="bg-zinc-50 p-4 border border-zinc-200 rounded-xl space-y-4">
              <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Sending Caps & Spacing Settings</span>
              
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Daily Cap Limit</label>
                  <input 
                    type="number" 
                    value={settings.daily_send_limit}
                    onChange={e => handleFieldChange("daily_send_limit", parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none font-mono"
                    min={1}
                    max={1000}
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Spacing delay (sec)</label>
                  <input 
                    type="number" 
                    value={settings.minimum_send_spacing_seconds}
                    onChange={e => handleFieldChange("minimum_send_spacing_seconds", parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none font-mono"
                    min={5}
                    max={3600}
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Sending Hours Start</label>
                  <input 
                    type="text" 
                    value={settings.allowed_send_start}
                    onChange={e => handleFieldChange("allowed_send_start", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none font-mono"
                    placeholder="09:00"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Sending Hours End</label>
                  <input 
                    type="text" 
                    value={settings.allowed_send_end}
                    onChange={e => handleFieldChange("allowed_send_end", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none font-mono"
                    placeholder="17:00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Timezone Location</label>
                  <div className="relative">
                    <Globe2 className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                    <input 
                      type="text" 
                      value={settings.timezone}
                      onChange={e => handleFieldChange("timezone", e.target.value)}
                      className="w-full pl-9 pr-4 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none"
                      placeholder="e.g. America/New_York"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Language</label>
                  <input 
                    type="text" 
                    value={settings.default_language}
                    onChange={e => handleFieldChange("default_language", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none"
                    placeholder="en"
                  />
                </div>
              </div>
            </div>

            {/* Copywriting Safety & Footers */}
            <div className="bg-zinc-50 p-4 border border-zinc-200 rounded-xl space-y-4">
              <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Compliance Footers & Banned Phrases</span>
              
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Required Email Footer</label>
                <input 
                  type="text"
                  value={settings.required_footer}
                  onChange={e => handleFieldChange("required_footer", e.target.value)}
                  placeholder="e.g. If you would like to opt-out, please reply requesting removal."
                  className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Banned Phrases list (Comma-separated)</label>
                <input 
                  type="text"
                  value={settings.banned_phrases.join(", ")}
                  onChange={e => handleFieldChange("banned_phrases", e.target.value.split(",").map(p => p.trim()).filter(Boolean))}
                  placeholder="e.g. stream, friction, bottleneck"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none"
                />
              </div>
            </div>

          </div>

          <div className="pt-6 border-t border-zinc-100 flex justify-end">
            <button 
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              Save Configuration
            </button>
          </div>
        </form>

        {/* Preview Panel Column */}
        <div className="space-y-6 lg:col-span-1">
          
          {/* Signature Preview */}
          <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-100 pb-3">
              <Eye className="w-4 h-4 text-zinc-500" />
              <h3 className="font-bold text-zinc-900 text-sm">Signature Preview</h3>
            </div>

            <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 font-mono text-[10px] text-zinc-600 leading-relaxed min-h-[90px] whitespace-pre-line">
              <div>Best Regards,</div>
              <div className="text-zinc-950 font-black mt-2">{getSignaturePreview()}</div>
            </div>
            
            <div className="text-[9px] text-zinc-400 text-center font-mono">
              Appends automatically to email drafts.
            </div>
          </div>

          {/* AI generated context preview summary */}
          <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-100 pb-3">
              <FileText className="w-4 h-4 text-zinc-500" />
              <h3 className="font-bold text-zinc-900 text-sm">Preview Directives</h3>
            </div>

            <div className="space-y-3.5 text-xs text-zinc-700">
              <div className="flex justify-between border-b border-zinc-100 pb-1.5">
                <span className="text-[10px] text-zinc-400 font-bold uppercase">Language</span>
                <span className="font-bold text-zinc-900">{settings.default_language.toUpperCase()}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-100 pb-1.5">
                <span className="text-[10px] text-zinc-400 font-bold uppercase">Daily Limit Cap</span>
                <span className="font-mono text-zinc-900 font-bold">{settings.daily_send_limit} leads/day</span>
              </div>
              <div className="flex justify-between border-b border-zinc-100 pb-1.5">
                <span className="text-[10px] text-zinc-400 font-bold uppercase">Sending window</span>
                <span className="font-mono text-zinc-900 font-bold">{settings.allowed_send_start} - {settings.allowed_send_end} ({settings.timezone})</span>
              </div>
              <div className="flex justify-between pb-1.5">
                <span className="text-[10px] text-zinc-400 font-bold uppercase">Banned Phrases</span>
                <span className="font-bold text-rose-700">{settings.banned_phrases.length} registered</span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </SidebarLayout>
  );
}
