# Key by (source_name.lower(), alias_name.lower()) → canonical name
CINEMA_ALIASES = {
    ("viff", "the rio theatre"): "Rio Theatre",
    ("viff", "rio theatre"): "Rio Theatre",
    ("cinematheque", "the cinematheque"): "The Cinematheque",
}


def resolve_cinema_alias(source: str, scraped_name: str) -> str | None:
    k = (source.strip().lower(), scraped_name.strip().lower())
    return CINEMA_ALIASES.get(k)
