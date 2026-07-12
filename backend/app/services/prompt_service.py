import logging

logger = logging.getLogger("outreachops.services.prompt")

BANNED_PHRASES = [
    "I hope this email finds you well",
    "It is a shame",
    "I have been looking into",
    "friction",
    "bottleneck",
    "streamline",
    "leverage",
    "costly overhead",
    "lost trust",
    "missed revenue",
    "seamless",
    "fragmented",
    "administrative burden",
    "unlock growth",
    "game changer",
    "scale your business",
    "we noticed that",
    "I noticed that",
]


class PromptService:
    """
    Service to compile dynamic instruction sets based on tone, length, and CTA configurations.
    """

    def get_banned_phrases_instruction(self) -> str:
        """Returns the prompt instruction listing banned phrases."""
        phrases_list = ", ".join([f'"{p}"' for p in BANNED_PHRASES])
        return (
            f"CRITICAL: Do NOT use any of the following banned phrases in the subject or body: {phrases_list}. "
            f"If you use any of these phrases, the email will be rejected immediately."
        )

    def build_erp_prompt(
        self,
        website: str,
        erp_approach: str,
        tone: str,
        length: str,
        cta: str,
        signature: str,
    ) -> str:
        """Compiles instructions for ERP custom solutions."""
        word_bounds = "60-90 words" if length == "short" else "80-120 words"

        tone_instruction = ""
        if tone == "founder-style":
            tone_instruction = "Write like an experienced builder providing a realistic workflow critique."
        elif tone == "direct":
            tone_instruction = "Write in a direct, practical operational tone."
        elif tone == "friendly":
            tone_instruction = (
                "Write in a warm, consultative operational efficiency tone."
            )
        else:  # premium-simple
            tone_instruction = (
                "Write in a clean, minimal, high-end software agency founder tone."
            )

        cta_instruction = ""
        if cta == "suggestion-first":
            cta_instruction = "End with a short suggestion-first call to action (e.g. asking if they want to review a workflow draft)."
        elif cta == "direct":
            cta_instruction = "End with a direct call to action for a brief chat."
        else:  # soft
            cta_instruction = "End with a soft call to action asking if they are looking into scheduling upgrades."

        banned_inst = self.get_banned_phrases_instruction()

        prompt = f"""
{tone_instruction}

TASK:
Write one operational cold email suggestion for the company with website: {website}.
Address this specific operational pain: {erp_approach}.
Start with a realistic workflow pain for their industry.
Do not overuse buzzwords like "portal", "dashboard", or "ERP". Instead, reference real operational tasks.
Mention only one practical system implementation idea.

COMPLIANCE RULES:
- Length: STRICTLY {word_bounds} only.
- Length bounds: Max 3 paragraphs.
- No generic sales openings or email fluff.
{cta_instruction}
{banned_inst}

Signature (copy exactly at the end):
{signature}

RETURN FORMAT:
You must output exactly this format with nothing else:
SUBJECT: [Clean 3-5 word subject line, no quotes]
BODY:
[Email content paragraphs]
[Signature]
""".strip()
        return prompt
