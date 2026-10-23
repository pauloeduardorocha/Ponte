"""Select a provisional edition without merging metadata across alternatives."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from research_inventory import normalized, title_match, isbn_values


LANGUAGES = {"por": "pt", "portugues": "pt", "portuguese": "pt", "eng": "en", "ingles": "en", "english": "en",
             "rum": "ro", "ron": "ro", "romana": "ro", "romanian": "ro", "romeno": "ro", "spa": "es", "espanhol": "es",
             "spanish": "es", "fra": "fr", "fre": "fr", "frances": "fr", "french": "fr", "ger": "de", "deu": "de", "alemo": "de", "ita": "it"}


def first(items):
    return next((str(v).strip() for v in items or [] if str(v).strip()), None)


def rank(record, candidate):
    text = normalized(str(candidate.get("format", "")) + " " + str(candidate.get("matched_title", "")))
    digital = bool(re.search(r"\b(ebook|e book|kindle|epub|pdf|digital)\b", text))
    metadata = sum(bool(candidate.get(k)) for k in ["publishers", "publication_dates", "languages", "pages", "edition", "cover_url"])
    return (bool(candidate.get("isbn13")), not digital,
            round(title_match(record["original"]["title"], candidate.get("matched_title", "")), 1),
            candidate.get("metadata_evidence") == "EDITION_JSON", metadata,
            candidate.get("author_score", 0), candidate.get("source_url", ""))


def select(record):
    if not record["candidates"]:
        return {"fields": {}, "source_url": None, "provisional": True}
    chosen = max(record["candidates"], key=lambda c: rank(record, c))
    isbns, rejected = isbn_values(chosen.get("isbn13", []))
    if rejected:
        raise ValueError("Invalid candidate ISBN")
    year_text = first(chosen.get("publication_dates")) or ""
    years = re.findall(r"\b(1[4-9]\d{2}|20[0-2]\d)\b", year_text)
    language = first(chosen.get("languages"))
    if language:
        language = LANGUAGES.get(normalized(language), language if re.fullmatch(r"[a-z]{2}(?:-[A-Za-z]{2})?", language) else None)
    pages = str(chosen.get("pages", ""))
    fields = {"isbn": first(isbns), "publisher": first(chosen.get("publishers")),
              "year": int(years[0]) if len(set(years)) == 1 else None, "language": language,
              "pages": int(pages) if pages.isdigit() and 0 < int(pages) < 100000 else None,
              "edition": chosen.get("edition") or None, "cover": chosen.get("cover_url") or None,
              "subtitle": chosen.get("subtitle") or None, "author": chosen.get("matched_authors") or None,
              "keywords": chosen.get("subjects", [])[:20]}
    for name, limit in [("publisher", 200), ("edition", 80), ("subtitle", 200), ("author", 200), ("cover", 2000)]:
        if fields[name] and len(fields[name]) > limit:
            fields[name] = None  # Full value remains in research JSON.
    return {"fields": {k: v for k, v in fields.items() if v is not None and v != []},
            "source_url": chosen["source_url"], "isbn_alternatives": isbns, "provisional": True,
            "policy": "One candidate source per book; fill missing fields only; preserve all alternatives."}


def prepare(state, fingerprint):
    return {"sourceHash": fingerprint, "books": [
        {"registrationNumber": key, "original": r["original"], "research": r,
         "selection": select(r)} for key, r in state["books"].items()], "methodology": state["methodology"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    data = args.input.read_bytes()
    plan = prepare(json.loads(data), hashlib.sha256(data).hexdigest())
    args.output.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"books": len(plan["books"]), "selected_isbn": sum(bool(b["selection"]["fields"].get("isbn")) for b in plan["books"])}))
