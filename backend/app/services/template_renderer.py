import re
from typing import Dict, Any, Tuple, Set, List

class SafeTemplateRenderer:
    # Pattern to match {{variable_name}} or {{variable_name|fallback}}
    # Allowing dots for namespaces, e.g. campaign.objective, and custom.pain_points
    # Variable format: {{namespace.var|fallback}} or {{var|fallback}}
    PATTERN = re.compile(r"\{\{([a-zA-Z0-9_\.\-]+)(?:\|([^}]+))?\}\}")

    ALLOWED_VARIABLES = {
        # Lead
        "first_name", "last_name", "full_name", "company_name", "job_title", 
        "contact_email", "website", "industry", "country", "city",
        # Campaign
        "campaign.name", "campaign.objective", "campaign.offer", 
        "campaign.value_proposition", "campaign.target_audience", "campaign.cta",
        # Research
        "research.summary", "research.services", "research.observations", "research.sources",
        # Sender
        "sender.name", "sender.company", "sender.website", "sender.phone", "sender.signature",
        # Sequence
        "sequence.step_number", "sequence.previous_subject"
    }

    @classmethod
    def render(cls, template: str, context: Dict[str, Any], max_size: int = 10000) -> Tuple[str, Set[str], Set[str]]:
        """
        Renders the template safely.
        Returns:
            (rendered_text, used_variables, missing_variables)
        """
        if not template:
            return "", set(), set()

        rendered = template
        used = set()
        missing = set()

        # Find all template matches
        for match in cls.PATTERN.finditer(template):
            placeholder = match.group(0)
            var_path = match.group(1).strip()
            fallback = match.group(2)
            if fallback is not None:
                fallback = fallback.strip()

            val = cls._resolve_path(var_path, context)
            if val is not None and str(val).strip() != "":
                sanitized_val = cls.sanitize_value(var_path, val)
                used.add(var_path)
                rendered = rendered.replace(placeholder, sanitized_val)
            else:
                if fallback is not None:
                    # Sanitize fallback value as well
                    sanitized_fallback = cls.sanitize_value(var_path, fallback)
                    rendered = rendered.replace(placeholder, sanitized_fallback)
                else:
                    missing.add(var_path)
                    rendered = rendered.replace(placeholder, "")

        # Cap maximum output size
        if len(rendered) > max_size:
            rendered = rendered[:max_size] + "... [Render size limit reached]"

        return rendered, used, missing

    @classmethod
    def validate_syntax(cls, template: str) -> Tuple[bool, List[str], Set[str], Set[str]]:
        """
        Validates template syntax and variables.
        Returns:
            (is_valid, errors_list, detected_variables_set, unknown_variables_set)
        """
        errors = []
        detected_variables = set()
        unknown_variables = set()

        if not template:
            return True, [], set(), set()

        # 1. Check unbalanced braces
        # A simple check: count occurrences of '{' and '}' and ensure they form proper pairs.
        # Check if there are nested braces e.g. {{{ or }}} which are malformed
        if len(re.findall(r"\{\{\{", template)) > 0 or len(re.findall(r"\}\}\}", template)) > 0:
            errors.append("Malformed template braces: triple braces are not supported.")

        open_count = len(re.findall(r"\{\{", template))
        close_count = len(re.findall(r"\}\}", template))
        if open_count != close_count:
            errors.append(f"Unbalanced template braces: found {open_count} opening '{{{{' and {close_count} closing '}}}}'.")

        # 2. Check for unmatched single braces inside the text that look like typos (e.g. {first_name})
        # Wait, some legitimate markdown might use single { or }, so we only raise warning if it's `{word}`
        single_brace_vars = re.findall(r"(?<!\{)\{([a-zA-Z0-9_\.\-]+)\}(?!\})", template)
        for var in single_brace_vars:
            errors.append(f"Possible malformed placeholder '{{{var}}}' - did you mean '{{{{{var}}}}}'?")

        # 3. Extract and check variables
        for match in cls.PATTERN.finditer(template):
            var_path = match.group(1).strip()
            detected_variables.add(var_path)
            
            # Check namespace whitelist
            is_valid_var = False
            if var_path in cls.ALLOWED_VARIABLES:
                is_valid_var = True
            elif var_path.startswith("custom."):
                is_valid_var = True
            
            if not is_valid_var:
                unknown_variables.add(var_path)

        is_valid = len(errors) == 0 and len(unknown_variables) == 0
        return is_valid, errors, detected_variables, unknown_variables

    @classmethod
    def sanitize_value(cls, var_path: str, val: Any) -> str:
        if val is None:
            return ""
        val_str = str(val)
        
        # 1. Cap maximum lengths per field category
        if var_path.startswith("research."):
            max_len = 5000
        elif var_path.startswith("custom."):
            max_len = 2000
        else:
            max_len = 500
            
        if len(val_str) > max_len:
            val_str = val_str[:max_len]
            
        # 2. If it's research/custom, strip existing XML tag boundaries to prevent escaping
        if var_path.startswith("research.") or var_path.startswith("custom."):
            val_str = re.sub(r"</?[a-zA-Z0-9_\.\-]+>", "", val_str)
            val_str = val_str.replace("-->", "").replace("]]>", "")
            
        # 3. For short text fields, strip newlines, carriage returns, and instruction command phrases
        short_fields = {
            "first_name", "last_name", "full_name", "company_name", "job_title", 
            "contact_email", "website", "industry", "country", "city",
            "sender.name", "sender.company", "sender.website", "sender.phone"
        }
        if var_path in short_fields:
            val_str = val_str.replace("\n", " ").replace("\r", " ")
            injection_commands = [
                "ignore previous", "system instruction", "system prompt",
                "override rules", "forget instructions", "you must output",
                "hacked", "hack"
            ]
            for cmd in injection_commands:
                val_str = re.sub(re.escape(cmd), "", val_str, flags=re.IGNORECASE)
                
        # 4. Wrap research in XML tag boundaries
        if var_path.startswith("research."):
            tag_name = var_path.replace(".", "_")
            val_str = f"<{tag_name}>{val_str}</{tag_name}>"
            
        return val_str

    @classmethod
    def _resolve_path(cls, path: str, context: Dict[str, Any]) -> Any:
        if "." not in path:
            return context.get(path)

        parts = path.split(".")
        current = context
        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None
        return current
