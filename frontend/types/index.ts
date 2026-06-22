export interface Lead {
  id: string;
  row_number?: string;
  website: string;
  pain_points?: string;
  erp_approach?: string;
  contact_email?: string;
  status: "Pending" | "Generating" | "Processed" | "Failed";
  created_at: string;
}

export interface EmailDraft {
  id: string;
  lead_id: string;
  website_subject?: string;
  website_body?: string;
  erp_subject?: string;
  erp_body?: string;
  approve_website: "YES" | "NO";
  approve_erp: "YES" | "NO";
  website_status: "Pending" | "Sent" | "Failed";
  erp_status: "Pending" | "Sent" | "Failed";
  last_error?: string;
  created_at: string;
}

export interface CampaignMetrics {
  totalLeads: number;
  draftsPending: number;
  approvedCount: number;
  emailsSent: number;
}
