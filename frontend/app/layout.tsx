import "./globals.css";
import React from "react";
import { ToastProvider } from "@/components/Toast";

export const metadata = {
  title: "OutreachOps AI — AI-Powered B2B Outreach SaaS",
  description: "Automate cold email workflow: Ingest leads from Google Sheets, generate custom website audits and ERP pitches using Gemini, review and send via Gmail.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light">
      <body className="antialiased selection:bg-indigo-100 selection:text-indigo-900">
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
