import time
import logging
from typing import Dict, Any, List, Optional
from google import genai
from app.config import settings
from app.services.error_service import GeminiQuotaError

logger = logging.getLogger("outreachops.services.gemini")

class GeminiService:
    """
    AI Generation Service for personalizing email pitches.
    Implements structured retries and ordered model fallbacks.
    """
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.model_list = settings.gemini_models

    def _get_client(self) -> genai.Client:
        if not self.api_key:
            raise GeminiQuotaError(
                message="Gemini API Key is not configured. Add GEMINI_API_KEY to your environment."
            )
        try:
            return genai.Client(api_key=self.api_key)
        except Exception as e:
            logger.error(f"Failed to initialize Gemini GenAI Client: {e}")
            raise GeminiQuotaError(message="Could not initialize Gemini Client", details={"error": str(e)})

    def parse_email(self, raw_text: str) -> Dict[str, str]:
        """
        Parses SUBJECT: and BODY: tags out of generated Gemini text.
        Ref: parse_email() lines 286-304 in coldmail_fixed_genai.py
        """
        raw_text = raw_text.strip()
        subject = "Quick thought on your business"
        body = raw_text

        lines = raw_text.splitlines()
        for i, line in enumerate(lines):
            clean_line = line.strip().replace("**", "").replace("__", "").strip()
            normalized = clean_line.upper()
            if normalized.startswith("SUBJECT:"):
                subject = clean_line.split(":", 1)[1].strip() or subject
            elif normalized.startswith("BODY:"):
                body = "\n".join(lines[i + 1 :]).strip() or body
                break

        # Cleanup Markdown formatting symbols
        subject = subject.replace("**", "").strip().strip('"')
        body = body.replace("**", "").strip()

        return {"subject": subject, "body": body}

    def generate_email_content(self, prompt: str) -> Dict[str, Any]:
        """
        Executes generation over the model fallback list with exponential backoff retries.
        """
        if settings.DEMO_MODE and not self.api_key:
            logger.info("Demo Mode active and no GEMINI_API_KEY provided. Returning mock email content.")
            prompt_lower = prompt.lower()
            if "erp" in prompt_lower or "scheduling" in prompt_lower or "dispatch" in prompt_lower:
                subject = "Operational efficiency suggestions"
                body = (
                    "Hi there,\n\nI was looking at your construction operations and noticed that managing "
                    "subcontractor schedules manually can lead to conflicts.\n\nImplementing a centralized "
                    "job scheduling dashboard would help streamline dispatch and keep everyone in sync.\n\n"
                    "Would you be open to a brief chat next week to see how this works?\n\nBest,\nAdmin"
                )
            else:
                subject = "Improving website conversions"
                body = (
                    "Hi there,\n\nI was reviewing your website and noticed some mobile layout shifts "
                    "that might be hurting your visitor conversions.\n\nOptimizing your mobile page speeds "
                    "and fixing those layout shifts could help retain more prospects.\n\nWould you be open "
                    "to a quick call about this?\n\nBest,\nAdmin"
                )
            return {
                "subject": subject,
                "body": body,
                "model_used": "gemini-mock-demo",
                "raw_output": f"SUBJECT: {subject}\nBODY:\n{body}",
                "error": None
            }

        client = self._get_client()
        last_error = None

        for model_name in self.model_list:
            def api_call():
                return client.models.generate_content(
                    model=model_name,
                    contents=prompt
                )

            # Retry with exponential backoff helper
            attempt = 0
            retries = 3
            delay = 2.0
            backoff_factor = 2.0
            
            while attempt < retries:
                try:
                    logger.info(f"Attempting email generation with model: {model_name} (Attempt {attempt+1}/{retries})")
                    response = api_call()
                    raw_text = getattr(response, "text", "")
                    if not raw_text:
                        raise ValueError("Gemini returned an empty text payload")
                        
                    parsed = self.parse_email(raw_text)
                    return {
                        "subject": parsed["subject"],
                        "body": parsed["body"],
                        "model_used": model_name,
                        "raw_output": raw_text,
                        "error": None
                    }
                except Exception as e:
                    last_error = e
                    err_str = str(e).lower()
                    # Check if error is retryable (429 Rate Limit, 503 Overloaded)
                    is_transient = "429" in err_str or "503" in err_str or "quota" in err_str or "exhausted" in err_str or "overloaded" in err_str
                    
                    if not is_transient or attempt == retries - 1:
                        logger.error(f"Non-retryable model failure for {model_name}: {e}")
                        break
                    
                    logger.warning(f"Transient error encountered, retrying model {model_name} in {delay}s: {e}")
                    time.sleep(delay)
                    delay *= backoff_factor
                    attempt += 1

        # If we exhausted all models, raise GeminiQuotaError
        err_msg = f"Gemini generation exhausted all configured models. Last exception: {last_error}"
        logger.error(err_msg)
        raise GeminiQuotaError(
            message="Gemini quota exceeded or service unavailable across all models.",
            details={"last_error": str(last_error)}
        )

    def generate_prompt_text(self, prompt: str) -> str:
        """
        Executes generation over the model fallback list to get raw text response.
        """
        if settings.DEMO_MODE and not self.api_key:
            return (
                "You write cold emails for a web development agency.\n\n"
                "Company website: {website}\n"
                "Key issues: {pain_points}\n"
                "ERP modules: {erp_approach}\n"
                "Agency name: {YOUR_AGENCY_NAME}\n"
                "Signature: {signature}\n\n"
                "Write one email that highlights these details."
            )

        client = self._get_client()
        last_error = None

        for model_name in self.model_list:
            def api_call():
                return client.models.generate_content(
                    model=model_name,
                    contents=prompt
                )

            attempt = 0
            retries = 3
            delay = 2.0
            backoff_factor = 2.0
            
            while attempt < retries:
                try:
                    logger.info(f"Attempting prompt text generation with model: {model_name} (Attempt {attempt+1})")
                    response = api_call()
                    raw_text = getattr(response, "text", "")
                    if not raw_text:
                        raise ValueError("Gemini returned an empty text payload")
                    return raw_text.strip()
                except Exception as e:
                    last_error = e
                    err_str = str(e).lower()
                    is_transient = "429" in err_str or "503" in err_str or "quota" in err_str or "exhausted" in err_str or "overloaded" in err_str
                    if not is_transient or attempt == retries - 1:
                        break
                    time.sleep(delay)
                    delay *= backoff_factor
                    attempt += 1

        return (
            "You write cold emails for a web development agency.\n\n"
            "Company website: {website}\n"
            "Key issues: {pain_points}\n"
            "ERP modules: {erp_approach}\n"
            "Agency name: {YOUR_AGENCY_NAME}\n"
            "Signature: {signature}\n\n"
            "Write one email that highlights these details."
        )
