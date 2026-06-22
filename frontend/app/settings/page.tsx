"use client";

import React, { useState } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { useToast } from "@/components/Toast";
import { 
  Save, Eye, User, Phone, Globe, Building, Sliders
} from "lucide-react";

export default function SettingsPage() {
  const [agencyName, setAgencyName] = useState("Pitbull Corporations");
  const [website, setWebsite] = useState("https://pitbullcorporations.com");
  const [senderName, setSenderName] = useState("rohit");
  const [phone, setPhone] = useState("+91-7801951876");
  const [dailyLimit, setDailyLimit] = useState(100);
  const [delaySeconds, setDelaySeconds] = useState(8);

  const { toast } = useToast();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agencyName || !website || !senderName) {
      toast("Please fill in required branding settings", "error");
      return;
    }
    toast("Configuration saved successfully");
  };

  // Compile signature representation matching the signature() function in Python
  const getSignaturePreview = () => {
    const phoneSuffix = phone ? ` | ${phone}` : "";
    return `${agencyName} | ${website}${phoneSuffix}`;
  };

  return (
    <SidebarLayout>
      {/* Title */}
      <div>
        <h2 className="text-lg font-bold text-zinc-950 tracking-tight">Configuration Settings</h2>
        <p className="text-xs text-zinc-500">Configure branding parameters and sender queue parameters</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Settings form */}
        <form onSubmit={handleSave} className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-6 lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-4">
            <Sliders className="w-4 h-4 text-zinc-500" />
            <h3 className="font-bold text-zinc-900 text-sm">System Variables</h3>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Agency Name *</label>
                <div className="relative">
                  <Building className="w-4 h-4 absolute left-3 top-3.5 text-zinc-400" />
                  <input 
                    type="text" 
                    value={agencyName}
                    onChange={e => setAgencyName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Agency Website *</label>
                <div className="relative">
                  <Globe className="w-4 h-4 absolute left-3 top-3.5 text-zinc-400" />
                  <input 
                    type="url" 
                    value={website}
                    onChange={e => setWebsite(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Sender Name *</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3.5 text-zinc-400" />
                  <input 
                    type="text" 
                    value={senderName}
                    onChange={e => setSenderName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Sender Phone</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-3.5 text-zinc-400" />
                  <input 
                    type="text" 
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-semibold"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Daily Cap Limit</label>
                <input 
                  type="number" 
                  value={dailyLimit}
                  onChange={e => setDailyLimit(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Send Spacing delay (seconds)</label>
                <input 
                  type="number" 
                  value={delaySeconds}
                  onChange={e => setDelaySeconds(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 transition-all font-mono"
                />
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-zinc-100 flex justify-end">
            <button 
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-all shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              Save Configuration
            </button>
          </div>
        </form>

        {/* Signature Preview Column */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4 flex flex-col justify-between h-64">
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-100 pb-4">
              <Eye className="w-4 h-4 text-zinc-500" />
              <h3 className="font-bold text-zinc-900 text-sm">Signature Preview</h3>
            </div>

            <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 font-mono text-[10px] text-zinc-600 leading-relaxed min-h-[90px]">
              <div>Best Regards,</div>
              <div className="font-bold text-zinc-900 mt-1">{senderName}</div>
              <div className="text-indigo-600 mt-2 font-semibold">{getSignaturePreview()}</div>
            </div>
          </div>

          <div className="text-[9px] text-zinc-400 text-center font-mono">
            Appends automatically to email drafts.
          </div>
        </div>

      </div>
    </SidebarLayout>
  );
}
