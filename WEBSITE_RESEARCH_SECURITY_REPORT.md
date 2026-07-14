# Website Research Security Report

This report outlines the threat vectors, defenses, and validation mechanisms implemented to secure public-website lead enrichment research.

---

## 1. Threat Mitigation Strategies

### Server-Side Request Forgery (SSRF)
* **Rejection of Unsafe IP Ranges**:
  Resolves DNS records and filters out loopback (`127.0.0.0/8`), private (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), multicast (`224.0.0.0/4`), loopback IPv6 (`::1`), and reserved IP addresses.
* **AWS/GCP Instance Metadata Blocking**:
  Explicitly blocks `169.254.169.254` to prevent leaks of internal IAM credentials or metadata values.
* **Manual Redirect Validation**:
  Handles HTTP redirects (e.g. `301`, `302`) manually (`allow_redirects=False`). Re-resolves and validates the destination host's resolved IP address before making subsequent connections. Cap redirects at 3 to prevent loops.
* **Scheme Restriction**:
  Forces scheme whitelist validation. Rejects schemes other than `http` or `https` (e.g., `file://`, `gopher://`, `ftp://`).

### DNS Rebinding Defense
* **Socket Override Pinning**:
  Overwrites `socket.getaddrinfo` temporarily during the request via a Python context manager (`pinned_dns`). Pins DNS resolution of the request to the pre-verified safe IP address. This completely eliminates rebinding window opportunities.

### Resource Exhaustion / Denial of Service
* **Streaming Capped Length**:
  Retrieves data using stream chunks. Caps max response read limits at 500,000 bytes (500 KB) per page to defend against zip/decompression bomb attacks.
* **Strict Connection Timeouts**:
  Caps connection and response timeouts at 5 seconds per request.
* **MIME Verification**:
  Inspects headers and restricts media fetching to `text/html` or `text/plain` only, preventing arbitrary binaries or huge PDFs downloads.

### AI Prompt Injection Safeguards
* **Grounding Framing Isolation**:
  Delimits web content inside untrusted block flags (`=== EXTERNAL UNTRUSTED CONTENT START ===`).
* **Explicit AI Rules Instruction**:
  Instructs Gemini explicitly to ignore commands, prompts, or scripts embedded within the parsed text and treat the block strictly as factual web data.
* **Structured Output Validation**:
  Enforces Pydantic/JSON validation schemas on Gemini returns, filtering out unverified or broken structures.

---

## 2. Test Verification Outcomes

Automated tests verified the following cases (located at `tests/test_website_research_security.py`):
* **`test_is_safe_ip`**: Checks loopback, private class A/B/C, link-local, multicast, metadata, and public IPv4/IPv6 ranges.
* **`test_resolve_safe_ips`**: Verifies DNS resolves to safe lists and filters out private addresses.
* **`test_pinned_dns_context`**: Validates socket routing overrides.
* **`test_safe_fetch_rejects_private_ips`**: Assures requests to local resources are blocked.
* **`test_safe_fetch_redirect_to_localhost`**: Validates redirects to loopback addresses are blocked.
* **`test_safe_fetch_oversized_response`**: Confirms stream truncation at 500 KB.
* **`test_safe_fetch_unsupported_mime`**: Ensures non-HTML/text MIME types are rejected.
* **`test_safe_fetch_timeout`**: Verifies timeout exception raises.
* **`test_extract_visible_content_malformed`**: Checks bs4 unclosed tag and script stripping robustness.
* **`test_ai_summary_prompt_injection_warning`**: Assures safety directives are generated.

**Verification Results**: **All 64 tests pass successfully with 47.93% overall test coverage.**
