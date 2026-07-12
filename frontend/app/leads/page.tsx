"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import SidebarLayout from "@/components/SidebarLayout";
import { useToast } from "@/components/Toast";
import ImportWizardModal from "@/components/ImportWizardModal";
import { 
  Plus, FileSpreadsheet, Search, Sparkles, Filter, 
  Trash2, Mail, ExternalLink, RefreshCw, X, CheckSquare, Square, 
  AlertCircle, Edit3, Settings, Eye, HelpCircle, Download, Archive, Check
} from "lucide-react";

interface Lead {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  company_name: string | null;
  website: string;
  industry: string | null;
  country: string | null;
  city: string | null;
  contact_email: string | null;
  phone: string | null;
  job_title?: string | null;
  lead_status: string;
  tags?: string[] | null;
  custom_fields?: Record<string, any> | null;
  fit_score?: number | null;
  fit_score_reasons?: string[] | null;
  email_validation_status?: string | null;
  created_at: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function LeadsPage() {
  const { toast } = useToast();
  const router = useRouter();

  // Core Data States
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  // Selection states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [emailFilter, setEmailFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [validationFilter, setValidationFilter] = useState("all");

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modals Toggles
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [wizardSourceType, setWizardSourceType] = useState<"file" | "sheets">("file");
  const [showGenModal, setShowGenModal] = useState(false);

  // Column Visibility Configurator
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    "company_name", "website", "industry", "location", "email", "fit_score", "email_validation_status", "tags", "lead_status"
  ]);

  // Fit score details modal
  const [fitScoreLead, setFitScoreLead] = useState<Lead | null>(null);

  // Custom fields viewer drawer
  const [customFieldsLead, setCustomFieldsLead] = useState<Lead | null>(null);

  // Bulk tag input states
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [bulkActionType, setBulkActionType] = useState<"add" | "remove">("add");

  // Bulk enroll states
  const [showBulkEnrollModal, setShowBulkEnrollModal] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");

  // Add Lead Form State
  const [newCompany, setNewCompany] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newIndustry, setNewIndustry] = useState("Construction");
  const [newCountry, setNewCountry] = useState("USA");
  const [newCity, setNewCity] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newTags, setNewTags] = useState("");

  // Edit Lead Form State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [editCompany, setEditCompany] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editIndustry, setEditIndustry] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStatus, setEditStatus] = useState("Pending");
  const [editTags, setEditTags] = useState("");

  // Email generation wizard states
  const [isGenerating, setIsGenerating] = useState(false);
  const [genType, setGenType] = useState<"website" | "erp" | "both">("both");
  const [genRegenerate, setGenRegenerate] = useState(true);
  const [genProgress, setGenProgress] = useState(0);
  const [genSuccessCount, setGenSuccessCount] = useState(0);
  const [genFailures, setGenFailures] = useState<{ company: string; error: string }[]>([]);
  const [generateForAll, setGenerateForAll] = useState(false);

  // Fetch campaigns
  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/campaigns`);
        if (res.ok) {
          const data = await res.json();
          setCampaigns(data);
        }
      } catch (e) {
        console.error("Failed to load campaigns list:", e);
      }
    };
    fetchCampaigns();
  }, []);

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

  // Toggle single column visibility
  const toggleColumn = (col: string) => {
    setVisibleColumns(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  // Add Lead Submit
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
          first_name: newFirstName || null,
          last_name: newLastName || null,
          full_name: newFirstName ? `${newFirstName} ${newLastName || ""}`.trim() : null,
          job_title: newJobTitle || null,
          industry: newIndustry,
          country: newCountry,
          city: newCity || null,
          contact_email: newEmail || null,
          phone: newPhone || null,
          tags: newTags ? newTags.split(",").map(t => t.trim()) : [],
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
        setNewFirstName("");
        setNewLastName("");
        setNewJobTitle("");
        setNewCity("");
        setNewPhone("");
        setNewEmail("");
        setNewTags("");
      } else {
        const err = await res.json();
        toast(err.detail || "Failed to create lead", "error");
      }
    } catch (e) {
      console.error("API Connection Error: ", e);
      toast("Error creating lead", "error");
    }
  };

  // Edit Lead Submit
  const handleEditClick = (lead: Lead) => {
    setEditingLeadId(lead.id);
    setEditCompany(lead.company_name || "");
    setEditWebsite(lead.website || "");
    setEditFirstName(lead.first_name || "");
    setEditLastName(lead.last_name || "");
    setEditJobTitle(lead.job_title || "");
    setEditIndustry(lead.industry || "");
    setEditCountry(lead.country || "");
    setEditCity(lead.city || "");
    setEditEmail(lead.contact_email || "");
    setEditPhone(lead.phone || "");
    setEditStatus(lead.lead_status || "Pending");
    setEditTags(lead.tags ? lead.tags.join(", ") : "");
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
          first_name: editFirstName || null,
          last_name: editLastName || null,
          full_name: editFirstName ? `${editFirstName} ${editLastName || ""}`.trim() : null,
          job_title: editJobTitle || null,
          industry: editIndustry,
          country: editCountry,
          city: editCity || null,
          contact_email: editEmail || null,
          phone: editPhone || null,
          lead_status: editStatus,
          tags: editTags ? editTags.split(",").map(t => t.trim()) : []
        })
      });

      if (res.ok) {
        toast("Lead updated successfully");
        setShowEditModal(false);
        fetchLeads();
      } else {
        const err = await res.json();
        toast(err.detail || "Failed to update lead", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Error updating lead", "error");
    }
  };

  // Delete Lead
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

  // Approve status toggle
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

  // Bulk Actions Dispatcher
  const handleBulkAction = async (action: string, extraParams: Record<string, any> = {}) => {
    const listIds = Array.from(selectedIds);
    if (listIds.length === 0) return;

    toast("Processing bulk updates...", "info");
    try {
      const res = await fetch(`${API_URL}/api/v1/leads/bulk-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_ids: listIds,
          action,
          params: extraParams
        })
      });

      if (res.ok) {
        const data = await res.json();
        toast(data.message);
        setSelectedIds(new Set());
        fetchLeads();
      } else {
        const err = await res.json();
        toast(err.detail || "Bulk updates failed.", "error");
      }
    } catch (e) {
      toast("Network connection issue.", "error");
    }
  };

  const handleBulkExport = () => {
    const selectedList = leads.filter(l => selectedIds.has(l.id));
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(selectedList, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `exported_leads_${new Date().toISOString().split("T")[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast(`Exported ${selectedList.length} leads successfully.`);
    setSelectedIds(new Set());
  };

  const handleBulkExportCsv = async () => {
    const listIds = Array.from(selectedIds);
    if (listIds.length === 0) return;
    
    toast("Generating CSV export...", "info");
    try {
      const res = await fetch(`${API_URL}/api/v1/leads/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: listIds })
      });
      
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `leads_export_${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast("CSV Export downloaded successfully.");
        setSelectedIds(new Set());
      } else {
        toast("Failed to generate CSV export", "error");
      }
    } catch (e) {
      toast("Connection issue during export.", "error");
    }
  };

  // Selection state helpers
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

  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredLeads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLeads.map(l => l.id)));
    }
  };

  // Filters mapping
  const filteredLeads = leads.filter(lead => {
    const nameStr = (lead.company_name || "").toLowerCase() + 
                    (lead.first_name || "").toLowerCase() + 
                    (lead.last_name || "").toLowerCase() + 
                    lead.website.toLowerCase() + 
                    (lead.contact_email || "").toLowerCase();
    
    const matchesSearch = !searchTerm || nameStr.includes(searchTerm.toLowerCase());
    const matchesIndustry = industryFilter === "all" || lead.industry === industryFilter;
    const matchesCountry = countryFilter === "all" || lead.country === countryFilter;
    const matchesStatus = statusFilter === "all" || lead.lead_status === statusFilter;
    const matchesValidation = validationFilter === "all" || lead.email_validation_status === validationFilter;

    const matchesEmail = emailFilter === "all" || 
      (emailFilter === "yes" && lead.contact_email) || 
      (emailFilter === "no" && !lead.contact_email);

    return matchesSearch && matchesIndustry && matchesCountry && matchesStatus && matchesEmail && matchesValidation;
  });

  // Pagination boundaries
  const totalPages = Math.ceil(filteredLeads.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedLeads = filteredLeads.slice(startIndex, startIndex + itemsPerPage);

  // Filters distinct list bounds
  const uniqueIndustries = Array.from(new Set(leads.map(l => l.industry).filter(Boolean)));
  const uniqueCountries = Array.from(new Set(leads.map(l => l.country).filter(Boolean)));

  // Bulk email generation worker
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
            error: err.detail || "AI template failed"
          });
        }
      } catch (e) {
        failuresList.push({
          company: lead.company_name || lead.website,
          error: "API connection issue"
        });
      }
      
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

  return (
    <SidebarLayout>
      
      {/* Title Dashboard */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-zinc-950 tracking-tight font-sans">Leads Database</h2>
          <p className="text-xs text-zinc-500 font-sans">Verify B2B contacts, scores, and bulk enroll prospects</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 relative">
          
          {/* Column Visibility Configuration Dropdown */}
          <button 
            onClick={() => setShowColumnConfig(!showColumnConfig)}
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-zinc-200 bg-white hover:bg-zinc-50/80 text-zinc-700 rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <Settings className="w-3.5 h-3.5 text-zinc-500" />
            Columns
          </button>
          
          {showColumnConfig && (
            <div className="absolute right-0 top-10 bg-white border border-zinc-200 rounded-xl p-3.5 shadow-xl z-40 w-48 space-y-2 text-xs text-zinc-700 animate-fade-in">
              <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Toggle Columns</span>
              {[
                { key: "company_name", label: "Company" },
                { key: "website", label: "Domain" },
                { key: "industry", label: "Industry" },
                { key: "location", label: "Location" },
                { key: "email", label: "Email" },
                { key: "tags", label: "Tags" },
                { key: "fit_score", label: "Fit Score" },
                { key: "email_validation_status", label: "Deliverability" },
                { key: "lead_status", label: "Status" }
              ].map(col => (
                <label key={col.key} className="flex items-center gap-2 select-none cursor-pointer py-0.5">
                  <input 
                    type="checkbox"
                    checked={visibleColumns.includes(col.key)}
                    onChange={() => toggleColumn(col.key)}
                    className="rounded bg-white border border-zinc-200 text-zinc-900 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}

          <button 
            onClick={() => { setWizardSourceType("file"); setShowImportWizard(true); }}
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-zinc-200 bg-white hover:bg-zinc-50/80 text-zinc-700 rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
            Upload File
          </button>
          
          <button 
            onClick={() => { setWizardSourceType("sheets"); setShowImportWizard(true); }}
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-zinc-200 bg-white hover:bg-zinc-50/80 text-zinc-700 rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Sync Google Sheet
          </button>

          <button 
            onClick={() => {
              if (leads.length === 0) {
                toast("No leads found to trigger email generation.", "error");
                return;
              }
              setGenerateForAll(true);
              setShowGenModal(true);
            }}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate for All
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

      {/* Filters Dashboard card */}
      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] grid grid-cols-1 sm:grid-cols-6 gap-3 items-end mb-6">
        <div className="sm:col-span-2 relative">
          <label className="text-[10px] text-zinc-400 font-bold block mb-1.5 uppercase tracking-wider">Search Leads</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
            <input 
              type="text"
              placeholder="Search company, website, or email..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-900 transition-all font-medium placeholder-zinc-400"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-zinc-400 font-bold block mb-1.5 uppercase tracking-wider">Industry</label>
          <select 
            value={industryFilter} 
            onChange={e => { setIndustryFilter(e.target.value); setCurrentPage(1); }}
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
            onChange={e => { setCountryFilter(e.target.value); setCurrentPage(1); }}
            className="w-full px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-900 transition-all"
          >
            <option value="all">All Countries</option>
            {uniqueCountries.map(c => (
              <option key={c} value={c!}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-zinc-400 font-bold block mb-1.5 uppercase tracking-wider">Deliverability</label>
          <select 
            value={validationFilter} 
            onChange={e => { setValidationFilter(e.target.value); setCurrentPage(1); }}
            className="w-full px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="valid">Valid only</option>
            <option value="invalid">Invalid only</option>
            <option value="disposable">Disposable</option>
            <option value="role_address">Role Address</option>
            <option value="unchecked">Unchecked</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] text-zinc-400 font-bold block mb-1.5 uppercase tracking-wider">Email Check</label>
          <select 
            value={emailFilter} 
            onChange={e => { setEmailFilter(e.target.value); setCurrentPage(1); }}
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
          <div className="p-8 text-center text-xs text-zinc-500 animate-pulse">Loading prospects catalog database...</div>
        ) : paginatedLeads.length === 0 ? (
          <div className="p-16 text-center max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center border border-zinc-200 mx-auto">
              <FileSpreadsheet className="w-5 h-5 text-zinc-500" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-zinc-900">No leads found</h3>
              <p className="text-xs text-zinc-500">Filter parameters returned zero matched lead records.</p>
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
                  {visibleColumns.includes("company_name") && <th className="p-4">Company</th>}
                  {visibleColumns.includes("website") && <th className="p-4">Domain</th>}
                  {visibleColumns.includes("industry") && <th className="p-4">Industry</th>}
                  {visibleColumns.includes("location") && <th className="p-4">Location</th>}
                  {visibleColumns.includes("email") && <th className="p-4">Email</th>}
                  {visibleColumns.includes("tags") && <th className="p-4">Tags</th>}
                  {visibleColumns.includes("fit_score") && <th className="p-4 text-center">Fit Score</th>}
                  {visibleColumns.includes("email_validation_status") && <th className="p-4 text-center">Verification</th>}
                  {visibleColumns.includes("lead_status") && <th className="p-4 text-center">Status</th>}
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-[11px] font-sans">
                {paginatedLeads.map(lead => {
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
                      {visibleColumns.includes("company_name") && (
                        <td className="p-4">
                          <div className="font-bold text-zinc-900 truncate max-w-[130px]">{lead.company_name}</div>
                          {lead.full_name && (
                            <div className="text-[10px] text-zinc-400 font-medium truncate max-w-[130px]">
                              {lead.full_name} {lead.job_title ? `• ${lead.job_title}` : ""}
                            </div>
                          )}
                        </td>
                      )}
                      {visibleColumns.includes("website") && (
                        <td className="p-4">
                          <a href={lead.website} target="_blank" className="text-indigo-600 hover:underline inline-flex items-center gap-1">
                            {lead.website.replace("https://", "").replace("http://", "")}
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </td>
                      )}
                      {visibleColumns.includes("industry") && <td className="p-4 text-zinc-600">{lead.industry || "N/A"}</td>}
                      {visibleColumns.includes("location") && (
                        <td className="p-4 text-zinc-500">
                          {lead.city ? `${lead.city}, ` : ""}{lead.country || "N/A"}
                        </td>
                      )}
                      {visibleColumns.includes("email") && <td className="p-4 font-mono text-zinc-600">{lead.contact_email || "N/A"}</td>}
                      
                      {visibleColumns.includes("tags") && (
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1 max-w-[150px]">
                            {lead.tags && lead.tags.length > 0 ? (
                              lead.tags.slice(0, 3).map((tag, idx) => (
                                <span key={idx} className="bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded text-[9px] text-zinc-600 font-semibold uppercase">{tag}</span>
                              ))
                            ) : (
                              <span className="text-zinc-300">-</span>
                            )}
                          </div>
                        </td>
                      )}
                      
                      {visibleColumns.includes("fit_score") && (
                        <td className="p-4 text-center">
                          <button
                            onClick={() => setFitScoreLead(lead)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              (lead.fit_score || 0) >= 75 
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                                : (lead.fit_score || 0) >= 40 
                                ? "bg-amber-50 text-amber-700 border border-amber-100" 
                                : "bg-rose-50 text-rose-700 border border-rose-100"
                            }`}
                            title="Click to view explanation criteria"
                          >
                            {lead.fit_score !== null ? `${lead.fit_score}/100` : "N/A"}
                          </button>
                        </td>
                      )}
                      
                      {visibleColumns.includes("email_validation_status") && (
                        <td className="p-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
                            lead.email_validation_status === "valid" 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                              : lead.email_validation_status === "disposable" 
                              ? "bg-amber-50 text-amber-700 border-amber-100" 
                              : lead.email_validation_status === "role_address" 
                              ? "bg-sky-50 text-sky-700 border-sky-100" 
                              : lead.email_validation_status === "invalid" 
                              ? "bg-rose-50 text-rose-700 border-rose-100" 
                              : "bg-zinc-100 text-zinc-500 border-zinc-200"
                          }`}>
                            {lead.email_validation_status || "unchecked"}
                          </span>
                        </td>
                      )}

                      {visibleColumns.includes("lead_status") && (
                        <td className="p-4 text-center">
                          <button
                            onClick={() => handleToggleLeadStatus(lead.id, lead.lead_status)}
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold border transition-colors ${
                              lead.lead_status === "Approved" 
                                ? "bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100" 
                                : lead.lead_status === "Pending" 
                                ? "bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-200" 
                                : "bg-indigo-50 border-indigo-100 text-indigo-700"
                            }`}
                          >
                            {lead.lead_status}
                          </button>
                        </td>
                      )}

                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          
                          {/* Custom fields drawer button */}
                          <button 
                            onClick={() => setCustomFieldsLead(lead)}
                            className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700"
                            title="View Custom Fields Dictionary"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button 
                            onClick={() => handleEditClick(lead)}
                            className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700"
                            title="Edit Lead Details"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          
                          <button 
                            onClick={() => handleDeleteLead(lead.id, lead.company_name || lead.website)}
                            className="p-1 rounded hover:bg-rose-50 text-zinc-400 hover:text-rose-600"
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

        {/* Pagination Toolbar */}
        {!loadingLeads && totalPages > 1 && (
          <div className="px-6 py-3 bg-zinc-50/50 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500 font-sans">
            <div>
              Showing <span className="font-bold text-zinc-900">{startIndex + 1}</span> to <span className="font-bold text-zinc-900">{Math.min(startIndex + itemsPerPage, filteredLeads.length)}</span> of <span className="font-bold text-zinc-900">{filteredLeads.length}</span> prospects
            </div>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="px-2.5 py-1 border border-zinc-200 bg-white rounded hover:bg-zinc-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="px-2.5 py-1 border border-zinc-200 bg-white rounded hover:bg-zinc-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Bulk Action Bar Dashboard */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border border-zinc-200 px-6 py-3 rounded-full shadow-lg z-30 flex items-center gap-3 animate-fade-in font-sans">
          <span className="text-xs font-semibold text-zinc-600 whitespace-nowrap">
            <span className="text-zinc-950 font-extrabold">{selectedIds.size}</span> selected
          </span>
          
          <button 
            onClick={() => handleBulkAction("revalidate")}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 rounded-full text-[10px] font-bold shadow-sm"
          >
            <RefreshCw className="w-3 h-3 text-indigo-600" />
            Verify Emails
          </button>

          <button 
            onClick={() => handleBulkAction("research")}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 rounded-full text-[10px] font-bold shadow-sm"
          >
            <Sparkles className="w-3 h-3 text-amber-500" />
            AI Research
          </button>

          <button 
            onClick={() => { setBulkActionType("add"); setShowBulkTagModal(true); }}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 rounded-full text-[10px] font-bold shadow-sm"
          >
            Add Tags
          </button>

          <button 
            onClick={() => { setShowBulkEnrollModal(true); }}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 rounded-full text-[10px] font-bold shadow-sm"
          >
            Enroll Campaign
          </button>

          <button 
            onClick={() => handleBulkAction("archive")}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 rounded-full text-[10px] font-bold shadow-sm"
          >
            <Archive className="w-3 h-3 text-zinc-500" />
            Archive
          </button>

          <button 
            onClick={handleBulkExportCsv}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 rounded-full text-[10px] font-bold shadow-sm"
          >
            <Download className="w-3 h-3 text-indigo-600" />
            Export CSV
          </button>

          <button 
            onClick={handleBulkExport}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 rounded-full text-[10px] font-bold shadow-sm"
          >
            <Download className="w-3 h-3 text-emerald-600" />
            Export JSON
          </button>
          
          <button 
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-zinc-400 hover:text-zinc-600 font-semibold px-1"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Bulk Tag Modal popup */}
      {showBulkTagModal && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 font-sans">
          <div className="max-w-sm w-full bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-lg p-5 space-y-4">
            <h3 className="font-bold text-zinc-900 text-xs">Bulk {bulkActionType === "add" ? "Apply" : "Remove"} Tags</h3>
            <input 
              type="text" 
              placeholder="e.g. lead, warm, construction"
              value={bulkTagInput}
              onChange={e => setBulkTagInput(e.target.value)}
              className="w-full px-3 py-1.5 border border-zinc-200 rounded text-xs focus:outline-none"
            />
            <div className="flex justify-end gap-2 text-xs">
              <button onClick={() => setShowBulkTagModal(false)} className="px-3 py-1.5 border border-zinc-200 rounded">Cancel</button>
              <button 
                onClick={() => {
                  handleBulkAction(bulkActionType === "add" ? "add_tags" : "remove_tags", { tags: bulkTagInput.split(",").map(t => t.trim()) });
                  setShowBulkTagModal(false);
                  setBulkTagInput("");
                }} 
                className="px-3 py-1.5 bg-zinc-900 text-white rounded font-bold"
              >
                Confirm Tags
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Enroll Modal popup */}
      {showBulkEnrollModal && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 font-sans">
          <div className="max-w-sm w-full bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-lg p-5 space-y-4">
            <h3 className="font-bold text-zinc-900 text-xs">Bulk Enroll prospects in Campaign Sequence</h3>
            <select
              value={selectedCampaignId}
              onChange={e => setSelectedCampaignId(e.target.value)}
              className="w-full px-3 py-1.5 border border-zinc-200 rounded text-xs focus:outline-none"
            >
              <option value="">Select Target campaign sequence...</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="flex justify-end gap-2 text-xs">
              <button onClick={() => setShowBulkEnrollModal(false)} className="px-3 py-1.5 border border-zinc-200 rounded">Cancel</button>
              <button 
                onClick={() => {
                  handleBulkAction("enroll_campaign", { campaign_id: selectedCampaignId });
                  setShowBulkEnrollModal(false);
                  setSelectedCampaignId("");
                }}
                disabled={!selectedCampaignId}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded font-bold disabled:opacity-50"
              >
                Launch Enrollment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fit Score diagnosis popup */}
      {fitScoreLead && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 font-sans animate-fade-in">
          <div className="max-w-md w-full bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-lg p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <h3 className="font-bold text-zinc-900 text-xs">Fit Alignment Diagnosis - {fitScoreLead.company_name}</h3>
              <button onClick={() => setFitScoreLead(null)} className="text-zinc-400 hover:text-zinc-600"><X className="w-4 h-4" /></button>
            </div>
            
            <div className="text-center py-3">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xl font-black">
                {fitScoreLead.fit_score || 0}
              </div>
              <span className="text-[10px] text-zinc-400 block mt-1 uppercase font-bold tracking-wider">Score Value</span>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Calculated alignment reasons</span>
              <div className="max-h-48 overflow-y-auto space-y-2 text-xs text-zinc-600 leading-relaxed font-medium">
                {fitScoreLead.fit_score_reasons && fitScoreLead.fit_score_reasons.length > 0 ? (
                  fitScoreLead.fit_score_reasons.map((r, idx) => (
                    <div key={idx} className="flex gap-2 items-start bg-zinc-50 p-2 border border-zinc-200/50 rounded-lg">
                      <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                      <span>{r}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-zinc-400 text-center py-4">No scoring rules evaluated for this lead record yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom fields drawer viewer popup */}
      {customFieldsLead && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 font-sans animate-fade-in">
          <div className="max-w-md w-full bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-lg p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <h3 className="font-bold text-zinc-900 text-xs">Custom Metadata Dictionary - {customFieldsLead.company_name}</h3>
              <button onClick={() => setCustomFieldsLead(null)} className="text-zinc-400 hover:text-zinc-600"><X className="w-4 h-4" /></button>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {customFieldsLead.custom_fields && Object.keys(customFieldsLead.custom_fields).length > 0 ? (
                <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-200 text-xs font-sans">
                  {Object.entries(customFieldsLead.custom_fields).map(([k, v]) => (
                    <div key={k} className="p-3 flex justify-between gap-4">
                      <span className="font-bold text-zinc-800 uppercase text-[10px] tracking-wide">{k}</span>
                      <span className="text-zinc-600 text-right">{String(v)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-zinc-400 text-xs text-center py-8">No custom column attributes mapped for this lead profile.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Generating wizard modal popup */}
      {showGenModal && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 font-sans animate-fade-in">
          <div className="max-w-md w-full bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="font-bold text-zinc-900 text-xs">Bulk Generate Outreach Drafts</h3>
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
                <p className="text-zinc-500">Launch personalized email content generation via Gemini for the {generateForAll ? leads.length : selectedIds.size} target leads.</p>

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
                  <div className="text-xs font-bold text-zinc-900">Generating personalized drafts...</div>
                  <div className="text-[10px] text-zinc-500">Processing lead {genProgress} of {generateForAll ? leads.length : selectedIds.size}</div>
                </div>
                
                <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden max-w-xs mx-auto">
                  <div className="h-full bg-zinc-900 transition-all duration-300" style={{ width: `${(genProgress / (generateForAll ? leads.length : selectedIds.size)) * 100}%` }}></div>
                </div>
              </div>
            ) : (
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
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Lead Modal popup */}
      {showAddModal && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 font-sans">
          <div className="max-w-lg w-full bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-lg animate-fade-in flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center">
              <h3 className="font-bold text-zinc-950 text-sm">Add Lead Profile Manual Creation</h3>
              <button onClick={() => setShowAddModal(false)} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleAddLeadSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Company Name</label>
                  <input 
                    type="text" 
                    value={newCompany} 
                    onChange={e => setNewCompany(e.target.value)} 
                    placeholder="e.g. Apex solutions"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Website URL *</label>
                  <input 
                    type="text" 
                    value={newWebsite} 
                    onChange={e => setNewWebsite(e.target.value)} 
                    placeholder="e.g. apex-solutions.com"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">First Name</label>
                  <input 
                    type="text" 
                    value={newFirstName} 
                    onChange={e => setNewFirstName(e.target.value)} 
                    placeholder="John"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Last Name</label>
                  <input 
                    type="text" 
                    value={newLastName} 
                    onChange={e => setNewLastName(e.target.value)} 
                    placeholder="Doe"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Job Title</label>
                  <input 
                    type="text" 
                    value={newJobTitle} 
                    onChange={e => setNewJobTitle(e.target.value)} 
                    placeholder="VP Sales"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Industry</label>
                  <input 
                    type="text" 
                    value={newIndustry} 
                    onChange={e => setNewIndustry(e.target.value)} 
                    placeholder="HVAC"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Country</label>
                  <input 
                    type="text" 
                    value={newCountry} 
                    onChange={e => setNewCountry(e.target.value)} 
                    placeholder="USA"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">City</label>
                  <input 
                    type="text" 
                    value={newCity} 
                    onChange={e => setNewCity(e.target.value)} 
                    placeholder="Boston"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Contact Email</label>
                  <input 
                    type="email" 
                    value={newEmail} 
                    onChange={e => setNewEmail(e.target.value)} 
                    placeholder="john@apex.com"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Phone Number</label>
                  <input 
                    type="text" 
                    value={newPhone} 
                    onChange={e => setNewPhone(e.target.value)} 
                    placeholder="+16175550199"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Tags (Comma-separated)</label>
                <input 
                  type="text" 
                  value={newTags} 
                  onChange={e => setNewTags(e.target.value)} 
                  placeholder="warm, b2b, target"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
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

      {/* Edit Lead Modal popup */}
      {showEditModal && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 font-sans">
          <div className="max-w-lg w-full bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-lg animate-fade-in flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center">
              <h3 className="font-bold text-zinc-950 text-sm">Edit Prospect Lead</h3>
              <button onClick={() => setShowEditModal(false)} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
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

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">First Name</label>
                  <input 
                    type="text" 
                    value={editFirstName} 
                    onChange={e => setEditFirstName(e.target.value)} 
                    placeholder="First name"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Last Name</label>
                  <input 
                    type="text" 
                    value={editLastName} 
                    onChange={e => setEditLastName(e.target.value)} 
                    placeholder="Last name"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Job Title</label>
                  <input 
                    type="text" 
                    value={editJobTitle} 
                    onChange={e => setEditJobTitle(e.target.value)} 
                    placeholder="Job title"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
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
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">City</label>
                  <input 
                    type="text" 
                    value={editCity} 
                    onChange={e => setEditCity(e.target.value)} 
                    placeholder="City"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Phone Number</label>
                  <input 
                    type="text" 
                    value={editPhone} 
                    onChange={e => setEditPhone(e.target.value)} 
                    placeholder="Phone number"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Tags (Comma-separated)</label>
                  <input 
                    type="text" 
                    value={editTags} 
                    onChange={e => setEditTags(e.target.value)} 
                    placeholder="warm, tags"
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
                    <option value="Archived">Archived</option>
                  </select>
                </div>
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

      {/* Universal Import Wizard popup */}
      {showImportWizard && (
        <ImportWizardModal 
          isOpen={showImportWizard} 
          onClose={() => setShowImportWizard(false)} 
          onImportComplete={fetchLeads} 
          defaultSourceType={wizardSourceType}
        />
      )}

    </SidebarLayout>
  );
}
