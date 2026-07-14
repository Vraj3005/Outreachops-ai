"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  X, FileSpreadsheet, AlertCircle, CheckCircle2, 
  HelpCircle, RefreshCw, ChevronRight, ChevronLeft, Download, Plus 
} from "lucide-react";
import { useToast } from "./Toast";

interface MappingPreset {
  id: string;
  name: string;
  field_mapping: Record<string, string>;
}

interface ImportWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  defaultSourceType?: "file" | "sheets";
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const STANDARD_FIELDS = [
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "full_name", label: "Full Name" },
  { value: "company_name", label: "Company Name" },
  { value: "job_title", label: "Job Title" },
  { value: "contact_email", label: "Contact Email (Required)" },
  { value: "phone", label: "Phone" },
  { value: "website", label: "Website (Required)" },
  { value: "industry", label: "Industry" },
  { value: "country", label: "Country" },
  { value: "city", label: "City" },
  { value: "tags", label: "Tags (Comma-separated)" }
];

export default function ImportWizardModal({ isOpen, onClose, onImportComplete, defaultSourceType = "file" }: ImportWizardModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [sourceType, setSourceType] = useState<"file" | "sheets">(defaultSourceType);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSourceType(defaultSourceType);
    }
  }, [isOpen, defaultSourceType]);
  
  // Google Sheets input states
  const [sheetUrl, setSheetUrl] = useState("");
  const [worksheetName, setWorksheetName] = useState("Demo");

  // Parsing outputs
  const [parsing, setParsing] = useState(false);
  const [fingerprint, setFingerprint] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);

  // Presets states
  const [presets, setPresets] = useState<MappingPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  
  // Mapping configuration states
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [newPresetName, setNewPresetName] = useState("");

  // Validation / Preview states
  const [validating, setValidating] = useState(false);
  const [validCount, setValidCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [previewItems, setPreviewItems] = useState<any[]>([]);
  const [errorsList, setErrorsList] = useState<any[]>([]);
  const [activePreviewTab, setActivePreviewTab] = useState<"valid" | "errors">("valid");

  // Committing states
  const [committing, setCommitting] = useState(false);
  const [summary, setSummary] = useState<any>(null);

  // Load presets on mount
  useEffect(() => {
    if (isOpen) {
      fetchPresets();
    }
  }, [isOpen]);

  const fetchPresets = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/imports/mappings`);
      if (res.ok) {
        const data = await res.json();
        setPresets(data);
      }
    } catch (e) {
      console.error("Failed to load mapping presets:", e);
    }
  };

  if (!isOpen) return null;

  // STEP 1: PARSE SOURCE DATA
  const handleParseSource = async () => {
    setParsing(true);
    const formData = new FormData();

    if (sourceType === "file") {
      if (!selectedFile) {
        toast("Please select a file to upload.", "error");
        setParsing(false);
        return;
      }
      formData.append("file", selectedFile);
    } else {
      if (!sheetUrl.trim()) {
        toast("Please enter a Google Sheet URL or ID.", "error");
        setParsing(false);
        return;
      }
      formData.append("sheet_url", sheetUrl.trim());
      formData.append("worksheet_name", worksheetName.trim() || "Sheet1");
    }

    try {
      const res = await fetch(`${API_URL}/api/v1/imports/parse`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setFingerprint(data.fingerprint);
        setHeaders(data.headers);
        setSampleRows(data.sample_rows);
        setTotalRows(data.total_rows);
        
        // Auto-suggest mappings first
        autoSuggestMappings(data.headers);
        setStep(2);
      } else {
        const err = await res.json();
        toast(err.detail || "Failed to parse data source.", "error");
      }
    } catch (e) {
      toast("Connection error parsing data source.", "error");
    } finally {
      setParsing(false);
    }
  };

  const autoSuggestMappings = (headersList: string[], presetMapping?: Record<string, string>) => {
    const suggestions: Record<string, string> = {};
    const preset = presetMapping || {};

    headersList.forEach(h => {
      if (preset[h]) {
        suggestions[h] = preset[h];
        return;
      }
      
      const h_lower = h.toLowerCase().replace(/_/g, "").replace(/ /g, "").replace(/-/g, "");
      
      // Attempt fuzzy matches
      let matched = false;
      for (const tf of STANDARD_FIELDS) {
        const tf_clean = tf.value.replace(/_/g, "");
        if (h_lower === tf_clean) {
          suggestions[h] = tf.value;
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        // Aliases
        if (h_lower === "email" || h_lower === "contactemail" || h_lower === "emailaddress") {
          suggestions[h] = "contact_email";
        } else if (h_lower === "website" || h_lower === "url" || h_lower === "domain") {
          suggestions[h] = "website";
        } else if (h_lower === "company" || h_lower === "companyname" || h_lower === "org") {
          suggestions[h] = "company_name";
        } else if (h_lower === "painpoints" || h_lower === "websitepainpoints") {
          suggestions[h] = "custom_fields.pain_points";
        } else if (h_lower === "erpapproach" || h_lower === "erp") {
          suggestions[h] = "custom_fields.erp_approach";
        } else if (h_lower === "row" || h_lower === "rownum") {
          suggestions[h] = "source_row_number";
        } else {
          // Normalize unmatched columns to custom fields
          const normal_name = h.toLowerCase().replace(/ /g, "_").replace(/-/g, "_").replace(/[^a-z0-9_]/g, "");
          suggestions[h] = `custom_fields.${normal_name}`;
        }
      }
    });

    setMappings(suggestions);
  };

  const handleApplyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (!presetId) return;

    const selected = presets.find(p => p.id === presetId);
    if (selected) {
      autoSuggestMappings(headers, selected.field_mapping);
      toast(`Applied preset: ${selected.name}`);
    }
  };

  // STEP 2: PREVIEW & VALIDATE MAPPINGS
  const handlePreviewMappings = async () => {
    setValidating(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/imports/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprint,
          field_mapping: mappings
        })
      });

      if (res.ok) {
        const data = await res.json();
        setValidCount(data.valid_count);
        setErrorCount(data.error_count);
        setPreviewItems(data.preview_items);
        setErrorsList(data.errors_list);
        
        setActivePreviewTab(data.valid_count > 0 ? "valid" : "errors");
        setStep(3);
      } else {
        const err = await res.json();
        toast(err.detail || "Validation check failed.", "error");
      }
    } catch (e) {
      toast("Network error during validation check.", "error");
    } finally {
      setValidating(false);
    }
  };

  // STEP 3: COMMIT IMPORT LEADS
  const handleCommitImport = async () => {
    setCommitting(true);
    const sourceName = sourceType === "file" 
      ? (selectedFile?.name || "CSV Upload") 
      : `Sheet: ${sheetUrl.substring(0, 20)}...`;

    try {
      const res = await fetch(`${API_URL}/api/v1/imports/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprint,
          field_mapping: mappings,
          source_name: sourceName,
          source_type: sourceType === "file" ? "csv" : "google_sheets",
          preset_name: newPresetName.trim() || undefined
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSummary(data);
        toast(`Successfully imported ${data.imported} prospects!`);
        setStep(4);
      } else {
        const err = await res.json();
        toast(err.detail || "Commit import failed.", "error");
      }
    } catch (e) {
      toast("Network error committing database inserts.", "error");
    } finally {
      setCommitting(false);
    }
  };

  const handleDownloadErrors = () => {
    window.open(`${API_URL}/api/v1/imports/errors/download?fingerprint=${fingerprint}`, "_blank");
  };

  const resetWizard = () => {
    setStep(1);
    setSelectedFile(null);
    setSheetUrl("");
    setWorksheetName("Demo");
    setHeaders([]);
    setSampleRows([]);
    setFingerprint("");
    setMappings({});
    setNewPresetName("");
    setSummary(null);
  };

  return (
    <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-4xl bg-white rounded-xl border border-zinc-200 shadow-xl overflow-hidden flex flex-col max-h-[85vh] animate-fade-in">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
          <div>
            <h3 className="font-bold text-zinc-900 text-sm">Universal Leads Ingest Wizard</h3>
            <p className="text-[11px] text-zinc-500">Configure B2B lists mappings dynamically in 4 quick stages</p>
          </div>
          <button 
            onClick={() => {
              resetWizard();
              onClose();
            }} 
            className="text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Wizard Steps indicator */}
        <div className="px-8 py-3 bg-white border-b border-zinc-100 flex items-center justify-between text-xs font-semibold text-zinc-400">
          <div className={`flex items-center gap-2 ${step >= 1 ? "text-indigo-600" : ""}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${step >= 1 ? "border-indigo-600 bg-indigo-50" : "border-zinc-200"}`}>1</span>
            Data Source
          </div>
          <div className="h-[1px] bg-zinc-100 flex-1 mx-4"></div>
          <div className={`flex items-center gap-2 ${step >= 2 ? "text-indigo-600" : ""}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${step >= 2 ? "border-indigo-600 bg-indigo-50" : "border-zinc-200"}`}>2</span>
            Column Mappings
          </div>
          <div className="h-[1px] bg-zinc-100 flex-1 mx-4"></div>
          <div className={`flex items-center gap-2 ${step >= 3 ? "text-indigo-600" : ""}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${step >= 3 ? "border-indigo-600 bg-indigo-50" : "border-zinc-200"}`}>3</span>
            Validate & Preview
          </div>
          <div className="h-[1px] bg-zinc-100 flex-1 mx-4"></div>
          <div className={`flex items-center gap-2 ${step >= 4 ? "text-indigo-600" : ""}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${step >= 4 ? "border-indigo-600 bg-indigo-50" : "border-zinc-200"}`}>4</span>
            Import Outcome
          </div>
        </div>

        {/* Step Contents */}
        <div className="flex-1 p-6 overflow-y-auto min-h-[300px]">

          {/* STEP 1: CHOOSE SOURCE */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setSourceType("file")}
                  className={`flex-1 p-5 rounded-xl border text-center space-y-2 transition-all ${sourceType === "file" ? "border-indigo-600 bg-indigo-50/40 shadow-sm" : "border-zinc-200 hover:bg-zinc-50"}`}
                >
                  <FileSpreadsheet className={`w-8 h-8 mx-auto ${sourceType === "file" ? "text-indigo-600" : "text-zinc-400"}`} />
                  <div className="text-xs font-bold text-zinc-900">Upload Spreadsheet file</div>
                  <div className="text-[10px] text-zinc-400">Supports standard CSV or XLSX files</div>
                </button>

                <button
                  type="button"
                  onClick={() => setSourceType("sheets")}
                  className={`flex-1 p-5 rounded-xl border text-center space-y-2 transition-all ${sourceType === "sheets" ? "border-indigo-600 bg-indigo-50/40 shadow-sm" : "border-zinc-200 hover:bg-zinc-50"}`}
                >
                  <FileSpreadsheet className={`w-8 h-8 mx-auto ${sourceType === "sheets" ? "text-emerald-600" : "text-zinc-400"}`} />
                  <div className="text-xs font-bold text-zinc-900">Link Google Sheet</div>
                  <div className="text-[10px] text-zinc-400">Authorize and read spreadsheet tabs directly</div>
                </button>
              </div>

              {sourceType === "file" ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-zinc-200 hover:border-zinc-300 p-8 rounded-xl text-center cursor-pointer transition-colors space-y-2 bg-zinc-50/30"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    accept=".csv,.xlsx"
                    className="hidden"
                  />
                  <div className="w-10 h-10 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center mx-auto text-zinc-500">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  {selectedFile ? (
                    <div>
                      <span className="text-xs font-bold text-indigo-600">{selectedFile.name}</span>
                      <span className="text-[10px] text-zinc-400 block">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-xs font-bold text-zinc-800">Click to upload spreadsheet file</span>
                      <span className="text-[10px] text-zinc-400 block">Maximum file size: 10MB</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4 max-w-lg mx-auto bg-zinc-50/40 p-5 border border-zinc-200 rounded-xl">
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 font-bold block uppercase tracking-wider">Google Sheets URL or Key</label>
                    <input
                      type="text"
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 font-medium placeholder-zinc-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 font-bold block uppercase tracking-wider">Worksheet Tab name</label>
                    <input
                      type="text"
                      placeholder="e.g. LeadList, Sheet1"
                      value={worksheetName}
                      onChange={(e) => setWorksheetName(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 font-medium"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: MAP COLUMNS */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center gap-4 bg-zinc-50 border border-zinc-200 p-4 rounded-xl">
                <div>
                  <div className="text-xs font-bold text-zinc-800">Load Mapping preset</div>
                  <div className="text-[10px] text-zinc-400">Match headers automatically with custom models</div>
                </div>
                <select
                  value={selectedPresetId}
                  onChange={(e) => handleApplyPreset(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-zinc-200 text-zinc-900 rounded-lg text-xs font-medium focus:outline-none"
                >
                  <option value="">Select preset mapping...</option>
                  {presets.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <div className="text-xs font-bold text-zinc-900 border-b border-zinc-100 pb-2">Fields Mapping Dashboard</div>
                
                <div className="grid grid-cols-2 gap-4 text-[10px] text-zinc-400 font-extrabold uppercase tracking-wider pb-1">
                  <div>Source Header (Uploaded file)</div>
                  <div>Target Field (Outreach Database)</div>
                </div>

                <div className="space-y-2.5 max-h-[35vh] overflow-y-auto pr-1">
                  {headers.map(header => (
                    <div key={header} className="grid grid-cols-2 gap-4 items-center bg-zinc-50/50 p-2 border border-zinc-200/50 rounded-lg">
                      <span className="text-xs font-semibold text-zinc-800 truncate" title={header}>{header}</span>
                      
                      <select
                        value={mappings[header] || ""}
                        onChange={(e) => setMappings({ ...mappings, [header]: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none"
                      >
                        <option value="">Do Not Import</option>
                        <optgroup label="Standard B2B Fields">
                          {STANDARD_FIELDS.map(sf => (
                            <option key={sf.value} value={sf.value}>{sf.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Custom Attributes mapping">
                          <option value={`custom_fields.${header.toLowerCase().replace(/[^a-z0-9_]/g, "")}`}>
                            Map as Custom field: {header}
                          </option>
                        </optgroup>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1 bg-zinc-50 border border-zinc-200/80 p-4 rounded-xl max-w-md">
                <label className="text-[10px] text-zinc-400 font-bold block uppercase tracking-wider">Save Mapping configuration Preset (Optional)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. My Website List, Leads CSV Preset"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: VALIDATION AND PREVIEW */}
          {step === 3 && (
            <div className="space-y-6">
              
              {/* Outcome summary bar */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-xl text-center">
                  <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Total Mapped Rows</div>
                  <span className="text-xl font-bold text-zinc-950">{totalRows}</span>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl text-center">
                  <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mb-1">Valid Records</div>
                  <span className="text-xl font-bold text-emerald-700">{validCount}</span>
                </div>
                <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl text-center relative group">
                  <div className="text-[10px] text-rose-600 font-bold uppercase tracking-wider mb-1">Row Errors</div>
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-xl font-bold text-rose-700">{errorCount}</span>
                    {errorCount > 0 && (
                      <button 
                        onClick={handleDownloadErrors}
                        className="p-1 rounded bg-rose-100 text-rose-700 hover:bg-rose-200 transition-colors"
                        title="Download error logs sheet CSV"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabs selector */}
              <div className="flex border-b border-zinc-200">
                <button
                  type="button"
                  onClick={() => setActivePreviewTab("valid")}
                  className={`px-4 py-2 border-b-2 font-bold text-xs transition-colors ${activePreviewTab === "valid" ? "border-indigo-600 text-indigo-600" : "border-transparent text-zinc-500 hover:text-zinc-900"}`}
                >
                  Mapped Leads Preview ({validCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActivePreviewTab("errors")}
                  className={`px-4 py-2 border-b-2 font-bold text-xs transition-colors ${activePreviewTab === "errors" ? "border-indigo-600 text-indigo-600" : "border-transparent text-zinc-500 hover:text-zinc-900"}`}
                >
                  Validation Row Errors ({errorCount})
                </button>
              </div>

              {/* Tab Contents */}
              <div className="max-h-[30vh] overflow-y-auto border border-zinc-200 rounded-lg bg-zinc-50/20">
                {activePreviewTab === "valid" ? (
                  previewItems.filter(p => p.is_valid).length === 0 ? (
                    <div className="p-8 text-center text-xs text-zinc-400">No valid records matching required fields.</div>
                  ) : (
                    <table className="w-full text-[11px] text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-400 font-semibold uppercase tracking-wider">
                          <th className="p-2.5">Row</th>
                          <th className="p-2.5">Company Name</th>
                          <th className="p-2.5">Website</th>
                          <th className="p-2.5">Contact Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewItems.filter(p => p.is_valid).slice(0, 5).map((log, idx) => (
                          <tr key={idx} className="border-b border-zinc-200 bg-white">
                            <td className="p-2.5 font-mono text-zinc-400">{log.row_number}</td>
                            <td className="p-2.5 font-bold text-zinc-800">{log.preview_data.company_name}</td>
                            <td className="p-2.5 text-zinc-600">{log.preview_data.website}</td>
                            <td className="p-2.5 text-zinc-600 font-mono">{log.preview_data.email}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                ) : (
                  errorsList.length === 0 ? (
                    <div className="p-8 text-center text-xs text-zinc-400">Perfect! No validation warnings or duplicate flags detected.</div>
                  ) : (
                    <div className="divide-y divide-zinc-200">
                      {errorsList.map((log, idx) => (
                        <div key={idx} className="p-3 bg-white flex items-start gap-3">
                          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-xs font-bold text-zinc-800">Row {log.row_number} failed validation:</span>
                            <div className="text-[10px] text-zinc-500 font-medium mt-1">
                              {log.errors.map((e: string, i: number) => <div key={i}>• {e}</div>)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* STEP 4: SUMMARY */}
          {step === 4 && summary && (
            <div className="text-center py-8 space-y-6 max-w-md mx-auto">
              <div className="w-14 h-14 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-center mx-auto text-emerald-600 shadow-sm">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-zinc-950">Ingestion Complete</h3>
                <p className="text-xs text-zinc-500">Universal mapped database imports has processed successfully</p>
              </div>

              <div className="bg-zinc-50 border border-zinc-200 p-5 rounded-xl text-left space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 font-semibold">Total Leads sync processed:</span>
                  <span className="font-bold text-zinc-900">{summary.total_processed}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 font-semibold">Saved successfully:</span>
                  <span className="font-bold text-emerald-600">{summary.imported}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 font-semibold">Skipped / Errored duplicates:</span>
                  <span className="font-bold text-rose-600">{summary.failed_rows}</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-100 flex justify-between bg-zinc-50/50">
          {step > 1 && step < 4 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-zinc-200 hover:bg-zinc-100/50 text-zinc-500 rounded-lg text-xs font-semibold"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Back
            </button>
          ) : <div />}

          {step === 1 && (
            <button
              onClick={handleParseSource}
              disabled={parsing || (sourceType === "file" && !selectedFile) || (sourceType === "sheets" && !sheetUrl.trim())}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
            >
              {parsing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Parsing list...
                </>
              ) : (
                <>
                  Parse Source
                  <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}

          {step === 2 && (
            <button
              onClick={handlePreviewMappings}
              disabled={validating}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
            >
              {validating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Analyzing headers...
                </>
              ) : (
                <>
                  Run Validation check
                  <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}

          {step === 3 && (
            <button
              onClick={handleCommitImport}
              disabled={committing || validCount === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
            >
              {committing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Syncing leads...
                </>
              ) : (
                <>
                  Sync Valid Leads ({validCount})
                  <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}

          {step === 4 && (
            <button
              onClick={() => {
                resetWizard();
                onImportComplete();
                onClose();
              }}
              className="px-6 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold shadow-sm"
            >
              Done
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
