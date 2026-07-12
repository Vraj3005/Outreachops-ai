"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function FetchInterceptor() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      const originalFetch = window.fetch;
      window.fetch = async (input, init) => {
        let url = "";
        if (typeof input === "string") {
          url = input;
        } else if (input instanceof URL) {
          url = input.toString();
        } else {
          url = input.url;
        }

        const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

        // Append JWT credentials for our backend routes only
        if (url.startsWith(API_URL)) {
          let token = "mock-valid-token";
          
          if (supabase) {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (session) {
                token = session.access_token;
              }
            } catch (e) {
              console.warn("Failed to get supabase session: ", e);
            }
          }

          const newInit = { ...init };
          const headers = new Headers(newInit.headers || {});
          if (!headers.has("Authorization")) {
            headers.set("Authorization", `Bearer ${token}`);
          }
          newInit.headers = headers;
          return originalFetch(input, newInit);
        }

        return originalFetch(input, init);
      };
    }
  }, []);

  return null;
}
