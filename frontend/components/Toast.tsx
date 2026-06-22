"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle, XCircle, AlertCircle, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 space-y-2 max-w-sm w-full">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`p-4 rounded-xl shadow-sm border flex items-start justify-between gap-3 animate-fade-in bg-white text-zinc-900 border-zinc-200 border-l-4 ${
              t.type === "success" 
                ? "border-l-emerald-500" 
                : t.type === "error" 
                ? "border-l-rose-500" 
                : "border-l-indigo-500"
            }`}
          >
            <div className="flex gap-2.5 items-center font-sans">
              {t.type === "success" && <CheckCircle className="w-4.5 h-4.5 text-emerald-500 shrink-0" />}
              {t.type === "error" && <XCircle className="w-4.5 h-4.5 text-rose-500 shrink-0" />}
              {t.type === "info" && <AlertCircle className="w-4.5 h-4.5 text-indigo-500 shrink-0" />}
              <span className="text-xs font-semibold leading-normal">{t.message}</span>
            </div>
            <button 
              onClick={() => removeToast(t.id)} 
              className="text-zinc-400 hover:text-zinc-600 transition-colors p-0.5 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
