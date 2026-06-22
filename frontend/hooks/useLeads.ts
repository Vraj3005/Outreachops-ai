import { useState, useEffect } from "react";

export function useLeads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // In full implementation, fetch from:
    // fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/leads`)
  }, []);

  return { leads, loading };
}
