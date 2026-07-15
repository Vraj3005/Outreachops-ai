"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

// Module-level token cache to avoid calling getSession() on every fetch
let cachedToken: string | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 4 * 60 * 1000; // 4 minutes

async function getCachedToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < cacheExpiry) {
    return cachedToken;
  }

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

  cachedToken = token;
  cacheExpiry = now + CACHE_TTL_MS;
  return token;
}

// Allow external invalidation (e.g. on logout)
export function invalidateTokenCache() {
  cachedToken = null;
  cacheExpiry = 0;
}

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
          const token = await getCachedToken();

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
