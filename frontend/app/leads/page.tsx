"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import SidebarLayout from "@/components/SidebarLayout";
import { useToast } from "@/components/Toast";
import { 
  Plus, FileSpreadsheet, Search, Sparkles, Filter, 
  Trash2, Mail, ExternalLink, RefreshCw, X, CheckSquare, Square, AlertCircle, Edit3
} from "lucide-react";

interface Lead {
  id: string;
  company_name: string | null;
  website: string;
  industry: string | null;
  country: string | null;
  city: string | null;
  contact_email: string | null;
  phone: string | null;
  website_pain_points: string | null;
  erp_approach: string | null;
  lead_status: string;
  source_sheet_name: string | null;
  source_row_number: string | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [industryFilter, setIndustryFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [emailFilter, setEmailFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  
  const [isIngesting, setIsIngesting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk Generation Wizard state
  const [showGenModal, setShowGenModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genType, setGenType] = useState<"website" | "erp" | "both">("both");
  const [genRegenerate, setGenRegenerate] = useState(true);
  const [genProgress, setGenProgress] = useState(0);
  const [genSuccessCount, setGenSuccessCount] = useState(0);
  const [genFailures, setGenFailures] = useState<{ company: string; error: string }[]>([]);
  const [generateForAll, setGenerateForAll] = useState(false);

  // Add Lead Form State
  const [newCompany, setNewCompany] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [newIndustry, setNewIndustry] = useState("Construction");
  const [newCountry, setNewCountry] = useState("USA");
  const [newEmail, setNewEmail] = useState("");
  const [newErp, setNewErp] = useState("");

  // Edit Lead Form State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [editCompany, setEditCompany] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editIndustry, setEditIndustry] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editErp, setEditErp] = useState("");
  const [editStatus, setEditStatus] = useState("Pending");

  const handleEditClick = (lead: Lead) => {
    setEditingLeadId(lead.id);
    setEditCompany(lead.company_name || "");
    setEditWebsite(lead.website || "");
    setEditIndustry(lead.industry || "");
    setEditCountry(lead.country || "");
    setEditEmail(lead.contact_email || "");
    setEditErp(lead.erp_approach || "");
    setEditStatus(lead.lead_status || "Pending");
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLeadId) return;

    try {
      const res = await fetch(`${API_URL}/api/v1/leads/${editingLeadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: editCompany,
          website: editWebsite,
          industry: editIndustry,
          country: editCountry,
          contact_email: editEmail,
          erp_approach: editErp,
          lead_status: editStatus
        })
      });

      if (res.ok) {
        toast("Lead updated successfully");
        setShowEditModal(false);
        fetchLeads();
      } else {
        const err = await res.json();
        toast(err.message || "Failed to update lead", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Error updating lead", "error");
    }
  };

  const handleToggleLeadStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === "Approved" ? "Pending" : "Approved";
    try {
      const res = await fetch(`${API_URL}/api/v1/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_status: nextStatus })
      });
      if (res.ok) {
        toast(`Lead status set to ${nextStatus}`);
        setLeads(prev => prev.map(l => l.id === id ? { ...l, lead_status: nextStatus } : l));
      } else {
        toast("Failed to update status", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Error updating status", "error");
    }
  };

  const { toast } = useToast();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    toast("Uploading CSV leads sheet...", "info");
    try {
      const res = await fetch(`${API_URL}/api/v1/leads/upload`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        toast(`Import Complete! Ingested: ${data.imported}, Duplicates: ${data.skipped_duplicates}`);
        fetchLeads();
      } else {
        const err = await res.json();
        toast(err.detail || "CSV upload failed", "error");
      }
    } catch (e) {
      console.error(e);
      toast("CSV upload network error", "error");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Load leads from backend
  const fetchLeads = useCallback(async () => {
    setLoadingLeads(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/leads`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
      } else {
        toast("Failed to load leads from database", "error");
      }
    } catch (e) {
      console.error("API Connection Error: ", e);
      toast("Cannot connect to API server", "error");
    } finally {
      setLoadingLeads(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Google Sheets import trigger
  const handleImportSheet = async () => {
    setIsIngesting(true);
    toast("Syncing Google Sheets...", "info");
    try {
      const res = await fetch(`${API_URL}/api/v1/integrations/sheets/import`, { 
        method: "POST" 
      });
      
      if (res.ok) {
        const data = await res.json();
        toast(`Sync Complete! Ingested: ${data.imported}, Duplicates: ${data.skipped_duplicates}`);
        fetchLeads();
      } else {
        const errorData = await res.json();
        toast(errorData.message || "Sheets Ingest failed", "error");
      }
    } catch (e) {
      console.error("API Connection Error: ", e);
      toast("Google Sheets API connection error", "error");
    } finally {
      setIsIngesting(false);
    }
  };

  // Add Lead manually
  const handleAddLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebsite) {
      toast("Website domain is required", "error");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/v1/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: newCompany || newWebsite.split(".")[0].toUpperCase(),
          website: newWebsite,
          industry: newIndustry,
          country: newCountry,
          contact_email: newEmail,
          erp_approach: newErp,
          lead_status: "Pending"
        })
      });

      if (res.ok) {
        toast("Lead created successfully");
        setShowAddModal(false);
        fetchLeads();
        
        // Reset form
        setNewCompany("");
        setNewWebsite("");
        setNewErp("");
        setNewEmail("");
      } else {
        const err = await res.json();
        toast(err.message || "Failed to create lead", "error");
      }
    } catch (e) {
      console.error("API Connection Error: ", e);
      toast("Error creating lead", "error");
    }
  };

  // Bulk delete leads
  const handleDeleteLead = async (id: string, name: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/leads/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast(`Lead '${name}' removed`);
        setLeads(prev => prev.filter(l => l.id !== id));
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        toast("Failed to delete lead", "error");
      }
    } catch (e) {
      console.error("API Connection Error: ", e);
      toast("API connection error on delete", "error");
    }
  };

  // Selection handlers
  const handleToggleSelectRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // List resolving filters
  const filteredLeads = leads.filter(lead => {
    const companyName = lead.company_name || "";
    const website = lead.website || "";
    const email = lead.contact_email || "";
    const industry = lead.industry || "";
    const country = lead.country || "";
    
    const matchesSearch = companyName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          website.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesIndustry = industryFilter === "all" || industry === industryFilter;
    const matchesCountry = countryFilter === "all" || country === countryFilter;
    const matchesStatus = statusFilter === "all" || lead.lead_status === statusFilter;
    
    const matchesEmail = emailFilter === "all" || 
      (emailFilter === "yes" && email !== "") || 
      (emailFilter === "no" && email === "");

    return matchesSearch && matchesIndustry && matchesCountry && matchesEmail && matchesStatus;
  });

  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredLeads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLeads.map(l => l.id)));
    }
  };

  // Bulk Generator loop worker
  const executeBulkGeneration = async () => {
    setIsGenerating(true);
    setGenProgress(0);
    setGenSuccessCount(0);
    setGenFailures([]);

    const selectedList = generateForAll ? leads : leads.filter(l => selectedIds.has(l.id));
    let successCount = 0;
    const failuresList: typeof genFailures = [];

    for (let i = 0; i < selectedList.length; i++) {
      const lead = selectedList[i];
      setGenProgress(i + 1);

      try {
        const res = await fetch(`${API_URL}/api/v1/drafts/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lead_id: lead.id,
            email_type: genType,
            regenerate: genRegenerate
          })
        });

        if (res.ok) {
          successCount++;
        } else {
          const err = await res.json();
          failuresList.push({
            company: lead.company_name || lead.website,
            error: err.message || err.detail || "Validation check failed"
          });
        }
      } catch (e) {
        failuresList.push({
          company: lead.company_name || lead.website,
          error: "API connection timeout"
        });
      }
      
      // Delay slightly between calls to prevent rate limits
      await new Promise(r => setTimeout(r, 200));
    }

    setGenSuccessCount(successCount);
    setGenFailures(failuresList);
    setIsGenerating(false);

    if (failuresList.length === 0) {
      toast(`Successfully generated drafts for ${successCount} leads!`);
      setShowGenModal(false);
      setSelectedIds(new Set());
      router.push("/drafts");
    } else {
      toast(`Generation complete: ${successCount} successful, ${failuresList.length} failed.`, "error");
      fetchLeads();
    }
  };

  // Distinct values for filter bounds
  const uniqueIndustries = Array.from(new Set(leads.map(l => l.industry).filter(Boolean)));
  const uniqueCountries = Array.from(new Set(leads.map(l => l.country).filter(Boolean)));

  return (
    <SidebarLayout>
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-950 tracking-tight">Leads Database</h2>
          <p className="text-xs text-zinc-500">Manage and sync prospects mapped for campaign triggers</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".csv" 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-zinc-200 bg-white hover:bg-zinc-50/80 text-zinc-700 rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
            Upload CSV
          </button>
          
          <button 
            onClick={handleImportSheet}
            disabled={isIngesting}
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-zinc-200 bg-white hover:bg-zinc-50/80 disabled:opacity-50 text-zinc-700 rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            {isIngesting ? "Syncing..." : "Sync Google Sheet"}
          </button>
          
          <button 
            onClick={() => {
              if (leads.length === 0) {
                toast("No leads found in database to generate drafts for.", "error");
                return;
              }
              setGenerateForAll(true);
              setShowGenModal(true);
            }}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate AI Drafts for All
          </button>
          
          <button 
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Lead
          </button>
        </div>
      </div>

      {/* Filters card */}
      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] grid grid-cols-1 sm:grid-cols-5 gap-4 items-end">
        <div className="sm:col-span-2 relative">
          <label className="text-[10px] text-zinc-400 font-bold block mb-1.5 uppercase tracking-wider">Search Leads</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
            <input 
              type="text"
              placeholder="Search company, website, or email..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-900 transition-all font-medium placeholder-zinc-400"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-zinc-400 font-bold block mb-1.5 uppercase tracking-wider">Industry</label>
          <select 
            value={industryFilter} 
            onChange={e => setIndustryFilter(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-900 transition-all"
          >
            <option value="all">All Industries</option>
            {uniqueIndustries.map(ind => (
              <option key={ind} value={ind!}>{ind}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-zinc-400 font-bold block mb-1.5 uppercase tracking-wider">Country</label>
          <select 
            value={countryFilter} 
            onChange={e => setCountryFilter(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-900 transition-all"
          >
            <option value="all">All Countries</option>
            {uniqueCountries.map(c => (
              <option key={c} value={c!}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-zinc-400 font-bold block mb-1.5 uppercase tracking-wider">Contact Email</label>
          <select 
            value={emailFilter} 
            onChange={e => setEmailFilter(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none"
          >
            <option value="all">All Contacts</option>
            <option value="yes">Has Email</option>
            <option value="no">Missing Email</option>
          </select>
        </div>
      </div>

      {/* Leads Table Container */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
        {loadingLeads ? (
          <div className="p-8 space-y-4 animate-pulse">
            <div className="flex gap-4 items-center border-b border-zinc-100 pb-3">
              <div className="h-4 w-4 bg-zinc-200 rounded"></div>
              <div className="h-4 w-28 bg-zinc-200 rounded"></div>
              <div className="h-4 w-32 bg-zinc-100 rounded"></div>
              <div className="h-4 w-20 bg-zinc-100 rounded"></div>
              <div className="h-4 w-40 bg-zinc-200 rounded"></div>
              <div className="h-4.5 w-16 bg-zinc-200 rounded-full"></div>
            </div>
            {[...Array(4)].map((_, idx) => (
              <div key={idx} className="flex gap-4 items-center py-1">
                <div className="h-4 w-4 bg-zinc-100 rounded"></div>
                <div className="h-4 w-28 bg-zinc-100 rounded"></div>
                <div className="h-4 w-32 bg-zinc-50 rounded"></div>
                <div className="h-4 w-20 bg-zinc-50 rounded"></div>
                <div className="h-4 w-40 bg-zinc-100 rounded"></div>
                <div className="h-4.5 w-16 bg-zinc-100 rounded-full"></div>
              </div>
            ))}
          </div>
        ) : filteredLeads.length === 0 ? (
          /* Empty State */
          <div className="p-16 text-center max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center border border-zinc-200 mx-auto">
              <FileSpreadsheet className="w-5 h-5 text-zinc-500" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-zinc-900">No leads found</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">Sync your Google Sheets campaign file or add a prospect manually to configure leads database profiles.</p>
            </div>
            <div className="pt-2 flex justify-center gap-3">
              <button 
                onClick={handleImportSheet}
                className="px-3 py-1.5 border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 rounded-lg text-xs font-semibold shadow-sm"
              >
                Sync Sheets File
              </button>
              <button 
                onClick={() => setShowAddModal(true)}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold shadow-sm"
              >
                Create Lead
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/50 text-zinc-500 text-[10px] font-bold uppercase tracking-wider">
                  <th className="p-4 w-12 text-center">
                    <button onClick={handleToggleSelectAll} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                      {selectedIds.size === filteredLeads.length && filteredLeads.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-zinc-900" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="p-4">Company</th>
                  <th className="p-4">Domain</th>
                  <th className="p-4">Industry</th>
                  <th className="p-4">Location</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">ERP Pain Points / Approach</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-[11px]">
                {filteredLeads.map(lead => {
                  const isSelected = selectedIds.has(lead.id);
                  return (
                    <tr key={lead.id} className={`hover:bg-zinc-50/40 transition-all ${isSelected ? "bg-zinc-50/80" : ""}`}>
                      <td className="p-4 text-center">
                        <button onClick={() => handleToggleSelectRow(lead.id)} className="text-zinc-400 hover:text-zinc-600">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-zinc-900" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="p-4 font-bold text-zinc-900 max-w-[150px] truncate">{lead.company_name || lead.website.split(".")[0].toUpperCase()}</td>
                      <td className="p-4 max-w-[150px] truncate">
                        <a href={`https://${lead.website}`} target="_blank" className="text-indigo-600 hover:underline flex items-center gap-1 hover:text-indigo-500">
                          {lead.website}
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </a>
                      </td>
                      <td className="p-4 font-medium text-zinc-600">{lead.industry || "N/A"}</td>
                      <td className="p-4 font-medium text-zinc-500">{lead.country || "N/A"}</td>
                      <td className="p-4 font-medium text-zinc-600">
                        {lead.contact_email ? (
                          <span>{lead.contact_email}</span>
                        ) : (
                          <span className="text-rose-700 font-bold uppercase text-[9px] tracking-wider bg-rose-50 px-2 py-0.5 rounded border border-rose-100">No Contact</span>
                        )}
                      </td>
                      <td className="p-4 text-zinc-600 max-w-[300px] truncate" title={lead.erp_approach || ""}>{lead.erp_approach || "None"}</td>
                      <td className="p-4 text-center">
                        {lead.lead_status === "Pending" ? (
                          <button
                            onClick={() => handleToggleLeadStatus(lead.id, "Pending")}
                            className="inline-flex px-2.5 py-1 bg-zinc-950 hover:bg-zinc-800 text-white rounded text-[9px] font-extrabold uppercase tracking-wider transition-colors shadow-sm"
                          >
                            Approve
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggleLeadStatus(lead.id, lead.lead_status)}
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border transition-colors ${
                              lead.lead_status === "Approved" 
                                ? "bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100" 
                                : lead.lead_status === "Processed" 
                                ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                                : lead.lead_status === "Generating" 
                                ? "bg-indigo-50 border-indigo-100 text-indigo-700 animate-pulse" 
                                : lead.lead_status === "Failed" 
                                ? "bg-rose-50 border-rose-100 text-rose-700" 
                                : "bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-zinc-200"
                            }`}
                          >
                            {lead.lead_status}
                          </button>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            onClick={() => handleEditClick(lead)}
                            className="p-1.5 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors"
                            title="Edit Lead"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteLead(lead.id, lead.company_name || lead.website)}
                            className="p-1.5 rounded hover:bg-rose-50 text-zinc-400 hover:text-rose-600 transition-colors"
                            title="Delete Lead"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border border-zinc-200 px-6 py-3 rounded-full shadow-lg z-30 flex items-center gap-4 animate-fade-in">
          <span className="text-xs font-semibold text-zinc-600">
            <span className="text-zinc-950 font-extrabold">{selectedIds.size}</span> leads selected
          </span>
          
          <button 
            onClick={() => setShowGenModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-full text-xs font-bold transition-all shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate AI Drafts
          </button>
          
          <button 
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-zinc-400 hover:text-zinc-600 font-semibold px-1"
          >
            Deselect
          </button>
        </div>
      )}

      {/* Generating Wizard Modal */}
      {showGenModal && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-lg p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="font-bold text-zinc-900 text-sm">Generate Email Drafts</h3>
              <button 
                onClick={() => {
                  if (!isGenerating) {
                    setShowGenModal(false);
                    setGenerateForAll(false);
                  }
                }} 
                disabled={isGenerating}
                className="text-zinc-400 hover:text-zinc-600 disabled:opacity-30"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!isGenerating && genFailures.length === 0 && genSuccessCount === 0 ? (
              <div className="space-y-4 text-xs text-zinc-700">
                <p className="text-zinc-500">Choose email generation settings for the {generateForAll ? leads.length : selectedIds.size} target leads.</p>

                <div className="flex items-center gap-2 pt-2">
                  <input 
                    type="checkbox" 
                    id="genRegen" 
                    checked={genRegenerate}
                    onChange={e => setGenRegenerate(e.target.checked)}
                    className="rounded bg-white border border-zinc-200 text-zinc-900 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                  />
                  <label htmlFor="genRegen" className="text-zinc-600 select-none cursor-pointer">
                    Overwrite existing drafts (Regenerate)
                  </label>
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-zinc-100">
                  <button 
                    onClick={() => {
                      setShowGenModal(false);
                      setGenerateForAll(false);
                    }}
                    className="px-4 py-2 border border-zinc-200 text-zinc-500 hover:bg-zinc-50 rounded-lg text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={executeBulkGeneration}
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold shadow-sm"
                  >
                    Launch Generator
                  </button>
                </div>
              </div>
            ) : isGenerating ? (
              <div className="text-center py-6 space-y-4">
                <RefreshCw className="w-8 h-8 mx-auto animate-spin text-zinc-600" />
                <div className="space-y-1">
                  <div className="text-xs font-bold text-zinc-900">Generating drafts...</div>
                  <div className="text-[10px] text-zinc-500">Processing lead {genProgress} of {generateForAll ? leads.length : selectedIds.size}</div>
                </div>
                
                <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden max-w-xs mx-auto">
                  <div className="h-full bg-zinc-900 transition-all duration-300" style={{ width: `${(genProgress / (generateForAll ? leads.length : selectedIds.size)) * 100}%` }}></div>
                </div>
              </div>
            ) : (
              /* Generation Results & Failure Report */
              <div className="space-y-4 text-xs text-zinc-700">
                <div className="flex gap-2 items-center text-amber-600">
                  <AlertCircle className="w-4 h-4" />
                  <span className="font-bold">Generation completed with reports</span>
                </div>
                
                <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-[11px] space-y-1">
                  <div>Successfully created drafts: <span className="text-emerald-700 font-bold">{genSuccessCount}</span></div>
                  <div>Skipped / Failed: <span className="text-rose-700 font-bold">{genFailures.length}</span></div>
                </div>

                {genFailures.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">Failure Log Detail</span>
                    <div className="max-h-32 overflow-y-auto border border-zinc-200 rounded-lg divide-y divide-zinc-100">
                      {genFailures.map((f, index) => (
                        <div key={index} className="p-2 flex justify-between gap-4 text-[10px]">
                          <span className="font-bold text-zinc-900 truncate max-w-[120px]">{f.company}</span>
                          <span className="text-rose-600 text-right truncate max-w-[200px]">{f.error}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-zinc-100 flex justify-end">
                  <button 
                    onClick={() => {
                      setShowGenModal(false);
                      setSelectedIds(new Set());
                      setGenerateForAll(false);
                      fetchLeads();
                    }}
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold"
                  >
                    Close Report
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Lead Dialog Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-lg animate-fade-in">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="font-bold text-zinc-950 text-sm">Add New Prospect Lead</h3>
              <button onClick={() => setShowAddModal(false)} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleAddLeadSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Company Name</label>
                  <input 
                    type="text" 
                    value={newCompany} 
                    onChange={e => setNewCompany(e.target.value)} 
                    placeholder="e.g. Apex Builders"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Website URL *</label>
                  <input 
                    type="text" 
                    value={newWebsite} 
                    onChange={e => setNewWebsite(e.target.value)} 
                    placeholder="e.g. apex-builders.com"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Industry</label>
                  <input 
                    type="text" 
                    value={newIndustry} 
                    onChange={e => setNewIndustry(e.target.value)} 
                    placeholder="Construction"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Contact Email</label>
                  <input 
                    type="email" 
                    value={newEmail} 
                    onChange={e => setNewEmail(e.target.value)} 
                    placeholder="sales@apex.com"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">ERP Pain Points</label>
                <textarea 
                  value={newErp} 
                  onChange={e => setNewErp(e.target.value)} 
                  placeholder="e.g. spreadsheets duplication, manual job costing delays"
                  className="w-full h-24 px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 leading-relaxed"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-zinc-100">
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-zinc-200 text-zinc-500 hover:bg-zinc-50 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold shadow-sm"
                >
                  Save Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Lead Dialog Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-lg animate-fade-in">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="font-bold text-zinc-950 text-sm">Edit Prospect Lead</h3>
              <button onClick={() => setShowEditModal(false)} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Company Name</label>
                  <input 
                    type="text" 
                    value={editCompany} 
                    onChange={e => setEditCompany(e.target.value)} 
                    placeholder="e.g. Apex Builders"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Website URL *</label>
                  <input 
                    type="text" 
                    value={editWebsite} 
                    onChange={e => setEditWebsite(e.target.value)} 
                    placeholder="e.g. apex-builders.com"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Industry</label>
                  <input 
                    type="text" 
                    value={editIndustry} 
                    onChange={e => setEditIndustry(e.target.value)} 
                    placeholder="Construction"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Contact Email</label>
                  <input 
                    type="email" 
                    value={editEmail} 
                    onChange={e => setEditEmail(e.target.value)} 
                    placeholder="sales@apex.com"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Country</label>
                  <input 
                    type="text" 
                    value={editCountry} 
                    onChange={e => setEditCountry(e.target.value)} 
                    placeholder="USA"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Lead Status</label>
                  <select 
                    value={editStatus} 
                    onChange={e => setEditStatus(e.target.value)} 
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                    <option value="Processed">Processed</option>
                    <option value="Failed">Failed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">ERP Pain Points</label>
                <textarea 
                  value={editErp} 
                  onChange={e => setEditErp(e.target.value)} 
                  placeholder="e.g. spreadsheets duplication, manual job costing delays"
                  className="w-full h-24 px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 leading-relaxed"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-zinc-100">
                <button 
                  type="button" 
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-zinc-200 text-zinc-500 hover:bg-zinc-50 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
