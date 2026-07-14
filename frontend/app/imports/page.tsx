"use client";

import React, { useState, useEffect, useRef } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { useToast } from "@/components/Toast";
import { 
  FileSpreadsheet, AlertCircle, CheckCircle2, 
  HelpCircle, RefreshCw, ChevronRight, ChevronLeft, Download, Plus, Layers
} from "lucide-react";

interface MappingPreset {
  id: string;
  name: string;
  field_mapping: Record<string, string>;
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

export default function ImportsPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [sourceType, setSourceType] = useState<"file" | "sheets">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Google Sheets input states
  const [sheetUrl, setSheetUrl] = useState("");
  const [worksheetName, setWorksheetName] = useState("Sheet1");

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

  useEffect(() => {
    fetchPresets();
  }, []);

  const fetchPresets = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/imports/mappings`);
      if (res.ok) {
        const data = await res.json();
        setPresets(data || []);
      }
    } catch (e) {
      console.error("Failed to load presets:", e);
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
        if (h_lower === "email" || h_lower === "contactemail" || h_lower === "emailaddress") {
          suggestions[h] = "contact_email";
        } else if (h_lower === "website" || h_lower === "url" || h_lower === "domain") {
          suggestions[h] = "website";
        } else if (h_lower === "company" || h_lower === "companyname" || h_lower === "org") {
          suggestions[h] = "company_name";
        } else {
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
      toast(`Applied preset: ${selected.name}`, "info");
    }
  };

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
        toast("Please enter a Google Sheet URL.", "error");
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
        setHeaders(data.headers || []);
        setSampleRows(data.sample_rows || []);
        setTotalRows(data.total_rows || 0);
        autoSuggestMappings(data.headers || []);
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
        setValidCount(data.valid_count || 0);
        setErrorCount(data.error_count || 0);
        setPreviewItems(data.preview_items || []);
        setErrorsList(data.errors_list || []);
        setActivePreviewTab((data.valid_count || 0) > 0 ? "valid" : "errors");
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
        toast(`Successfully imported ${data.imported} prospects!`, "success");
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
    setWorksheetName("Sheet1");
    setHeaders([]);
    setSampleRows([]);
    setFingerprint("");
    setMappings({});
    setNewPresetName("");
    setSummary(null);
  };

  return (
    <SidebarLayout>
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-950 tracking-tight">Universal Ingest Wizard</h2>
          <p className="text-xs text-zinc-500">Configure B2B list mappings dynamically in 4 quick stages</p>
        </div>
      </div>

      {/* Steps indicators */}
      <div className="bg-white px-8 py-4 border border-zinc-200 rounded-xl flex items-center justify-between text-xs font-semibold text-zinc-400">
        <div className={`flex items-center gap-2 ${step >= 1 ? "text-indigo-600 font-bold" : ""}`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${step >= 1 ? "border-indigo-600 bg-indigo-50" : "border-zinc-200"}`}>1</span>
          Data Source
        </div>
        <div className="h-[1px] bg-zinc-200 flex-1 mx-4"></div>
        <div className={`flex items-center gap-2 ${step >= 2 ? "text-indigo-600 font-bold" : ""}`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${step >= 2 ? "border-indigo-600 bg-indigo-50" : "border-zinc-200"}`}>2</span>
          Column Mappings
        </div>
        <div className="h-[1px] bg-zinc-200 flex-1 mx-4"></div>
        <div className={`flex items-center gap-2 ${step >= 3 ? "text-indigo-600 font-bold" : ""}`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${step >= 3 ? "border-indigo-600 bg-indigo-50" : "border-zinc-200"}`}>3</span>
          Validate & Preview
        </div>
        <div className="h-[1px] bg-zinc-200 flex-1 mx-4"></div>
        <div className={`flex items-center gap-2 ${step >= 4 ? "text-indigo-600 font-bold" : ""}`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${step >= 4 ? "border-indigo-600 bg-indigo-50" : "border-zinc-200"}`}>4</span>
          Import Outcome
        </div>
      </div>

      {/* Main card */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 min-h-[400px] flex flex-col justify-between shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        
        {/* Step 1: Choose Source */}
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
                className="border-2 border-dashed border-zinc-200 hover:border-zinc-300 p-12 rounded-xl text-center cursor-pointer transition-colors space-y-2 bg-zinc-50/30"
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
              <div className="space-y-4 max-w-lg mx-auto bg-zinc-50/45 p-6 border border-zinc-200 rounded-xl">
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
                    placeholder="e.g. Sheet1"
                    value={worksheetName}
                    onChange={(e) => setWorksheetName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 font-medium"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-zinc-100">
              <button
                type="button"
                onClick={handleParseSource}
                disabled={parsing}
                className="px-4 py-2 bg-zinc-900 text-white rounded font-bold text-xs hover:bg-zinc-800 flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {parsing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                Analyze Data Source
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Map columns */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex justify-between items-center gap-4 bg-zinc-50 border border-zinc-200 p-4 rounded-xl">
              <div>
                <div className="text-xs font-bold text-zinc-800">Load Mapping Preset</div>
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

              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
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
              <input
                type="text"
                placeholder="e.g. My Website List, Leads CSV Preset"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none font-medium"
              />
            </div>

            <div className="flex justify-between pt-4 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 border border-zinc-200 text-zinc-700 rounded font-bold text-xs hover:bg-zinc-50 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                type="button"
                onClick={handlePreviewMappings}
                disabled={validating}
                className="px-4 py-2 bg-zinc-900 text-white rounded font-bold text-xs hover:bg-zinc-800 flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {validating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                Validate & Preview Rows
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Validate & Preview */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setActivePreviewTab("valid")}
                className={`flex-1 p-3 rounded-lg border text-center transition-all ${activePreviewTab === "valid" ? "border-emerald-600 bg-emerald-50 text-emerald-700 font-bold" : "border-zinc-200 text-zinc-400"}`}
              >
                <div className="text-xs">Valid Records ({validCount})</div>
              </button>
              <button
                type="button"
                onClick={() => setActivePreviewTab("errors")}
                className={`flex-1 p-3 rounded-lg border text-center transition-all ${activePreviewTab === "errors" ? "border-rose-600 bg-rose-50 text-rose-700 font-bold" : "border-zinc-200 text-zinc-400"}`}
              >
                <div className="text-xs">Malformed Records ({errorCount})</div>
              </button>
            </div>

            <div className="border border-zinc-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[250px]">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead className="bg-zinc-50/50 text-zinc-500 font-bold border-b border-zinc-200">
                    <tr>
                      <th className="p-2.5">Row</th>
                      <th className="p-2.5">Email</th>
                      <th className="p-2.5">Website</th>
                      {activePreviewTab === "errors" && <th className="p-2.5">Validation Failures</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {activePreviewTab === "valid" ? (
                      previewItems.slice(0, 10).map((item, i) => (
                        <tr key={i} className="hover:bg-zinc-50/20">
                          <td className="p-2.5 font-mono text-zinc-400">#{item.source_row_number}</td>
                          <td className="p-2.5 font-semibold text-zinc-900">{item.contact_email}</td>
                          <td className="p-2.5 text-zinc-600">{item.website}</td>
                        </tr>
                      ))
                    ) : (
                      errorsList.slice(0, 10).map((item, i) => (
                        <tr key={i} className="hover:bg-rose-50/10">
                          <td className="p-2.5 font-mono text-rose-500">#{item.row}</td>
                          <td className="p-2.5 text-zinc-400">{item.email || "Missing"}</td>
                          <td className="p-2.5 text-zinc-400">{item.website || "Missing"}</td>
                          <td className="p-2.5 text-rose-600 font-bold truncate max-w-[200px]" title={item.reason}>
                            {item.reason}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {errorCount > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-[10px] text-rose-700 flex items-center justify-between">
                <span>Some records failed layout constraints check. You can download the error spreadsheet.</span>
                <button
                  type="button"
                  onClick={handleDownloadErrors}
                  className="px-2.5 py-1 bg-white hover:bg-rose-100 border border-rose-200 rounded text-rose-700 font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Download Errors
                </button>
              </div>
            )}

            <div className="flex justify-between pt-4 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 border border-zinc-200 text-zinc-700 rounded font-bold text-xs hover:bg-zinc-50 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                type="button"
                onClick={handleCommitImport}
                disabled={committing || validCount === 0}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-xs flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
              >
                {committing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Commit Prospects to DB
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Import Outcome */}
        {step === 4 && summary && (
          <div className="space-y-6 text-center py-6">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto text-emerald-600 shadow-sm">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-extrabold text-zinc-900">Import Operations Completed!</h4>
              <p className="text-xs text-zinc-500">Universal mapped database imports has processed successfully</p>
            </div>

            <div className="max-w-md mx-auto grid grid-cols-2 gap-4 border border-zinc-100 bg-zinc-50/50 p-4 rounded-xl text-left text-xs font-semibold text-zinc-600">
              <div>Total Source Records:</div>
              <div className="font-mono text-zinc-900 text-right">{summary.total_processed}</div>
              <div>Successfully Imported:</div>
              <div className="font-mono text-emerald-600 text-right font-bold">{summary.imported}</div>
              <div>Duplicates Discarded:</div>
              <div className="font-mono text-zinc-500 text-right">{summary.duplicates || 0}</div>
              <div>Invalid Skipped:</div>
              <div className="font-mono text-rose-500 text-right">{summary.failed || 0}</div>
            </div>

            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={resetWizard}
                className="px-6 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded font-bold text-xs shadow-sm uppercase tracking-wider"
              >
                Import New File
              </button>
            </div>
          </div>
        )}

      </div>
    </SidebarLayout>
  );
}
