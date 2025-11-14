import json
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

SYSTEM_PROMPT = """
You are a cinema screening data–cleaning assistant. You will receive a raw film title
that may contain screening-specific information. Your job is to:

1. Produce a clean normalized_title:

Remove ALL information that is NOT part of the film’s actual title, including:

• Edition / version / format descriptors:
  - “4K”, “4K restoration”, “4K remaster”
  - “restored”, “restoration”, “IMAX”, “3D”
  - “anniversary”, “anniversary edition”, “special edition”

• Event-level modifiers:
  - “with Q&A”, “Q&A”, “Q and A”
  - “guest in attendance”, “director in person”, “filmmaker in person”
  - “special guest”, “hosted by …”
  - “introduction”, “panel discussion”
  - “live score”, “live music”, “musician performing”

• These modifiers must be removed even if inside parentheses/brackets:
  - “(...)”, “[...]”, “- ...”, “: ...”

Do NOT translate titles.  
Do NOT infer meaning.  
The normalized_title must contain ONLY the true film title.

2. Extract screening_tags:

From the removed text ONLY, extract short English tags that describe this specific
screening. Tags MUST follow these rules:

SEMANTIC TAG WHITELIST (CATEGORIES):
You may create tags in your own wording, but EVERY tag must belong to
ONE of these semantic categories:

(1) Restoration / remaster / projection format
    Examples:
      - “4K restoration”
      - “Restoration”
      - “Remaster”
      - “35mm print”
      - “IMAX screening”

(2) Anniversary / commemorative screening
    Examples:
      - “Anniversary screening”
      - “Commemorative edition”

(3) Q&A or discussion
    Examples:
      - “Q&A”
      - “Post-screening discussion”

(4) Guest / host / attendance
    Examples:
      - “Director in attendance”
      - “Filmmaker in attendance”
      - “Special guest”
      - “Hosted by <Name>”
      - “Introduction”

(5) Panel / curated event elements
    Examples:
      - “Panel discussion”
      - “Curated introduction”

STRICT RESTRICTIONS:
• DO NOT invent tags outside these categories unless very explicitly stated in the removed text.
• DO NOT guess. Only tag what is explicitly stated.
• Musical words (e.g., “band”, “music”, “live”) do NOT imply a live score.
  Only tag “live score” if explicitly written.
• Do NOT output generic or useless tags such as:
  “film screening”, “movie presentation”, etc.

If nothing within the removed text belongs to the categories → output an empty array.

3. Output format:

Return EXACTLY one JSON object with this structure:

{
  "original_title": <string>,
  "normalized_title": <string>,
  "screening_tags": [<zero or more tag strings>]
}

Do NOT output anything else.
"""


def ai_clean_title_and_tags(raw_title: str) -> dict:
    """
    Call the ChatGPT API to:
    - normalize a film title (normalized_title)
    - extract screening tags (screening_tags: list[str])

    The caller is responsible for handling fallback when errors happen.
    """
    if not raw_title:
        return {
            "original_title": "",
            "normalized_title": "",
            "screening_tags": [],
        }

    resp = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Raw title: {raw_title}"}
        ],
        # Force JSON output to reduce hallucination
        response_format={"type": "json_object"},
    )

    content = resp.choices[0].message.content
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        # Fallback — should be rare
        return {
            "original_title": raw_title,
            "normalized_title": raw_title,
            "screening_tags": [],
        }

    # Defensive cleanup
    normalized = data.get("normalized_title") or raw_title
    tags = data.get("screening_tags") or []

    # Ensure tags is a list of strings
    if not isinstance(tags, list):
        tags = []
    tags = [str(t).strip() for t in tags if str(t).strip()]

    return {
        "original_title": raw_title,
        "normalized_title": normalized,
        "screening_tags": tags,
    }
