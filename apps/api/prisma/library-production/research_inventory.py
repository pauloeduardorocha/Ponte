"""Research selected library books using batched, cached Open Library metadata."""

import argparse
import csv
import hashlib
import json
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlencode

from fetch_openlibrary_covers import author_similarity, fetch_json, main_title, normalized, quote, similarity
from prepare_isbn_review import canonical_isbn

SEARCH_FIELDS = ",".join([
    "key", "title", "author_name", "first_publish_year", "subject", "editions",
    "editions.key", "editions.title", "editions.isbn", "editions.publisher",
    "editions.publish_date", "editions.language", "editions.cover_i",
    "editions.number_of_pages", "editions.physical_format", "editions.edition_name",
])
CSV_FIELDS = ["registrationNumber", "source_title", "source_author", "source_collection",
              "status", "candidate_isbns", "edition_candidates", "matched_titles", "matched_authors",
              "publishers", "publication_dates", "languages", "formats", "pages", "source_urls",
              "flags", "search_stages", "physically_confirmed"]


def write_json(path, data, indent=None):
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=indent), encoding="utf-8")
    for attempt in range(8):
        try:
            temporary.replace(path)
            break
        except PermissionError:
            if attempt == 7:
                raise
            time.sleep(0.25 * (attempt + 1))


def author_parts(value):
    return [re.sub(r"^(dr|pr|pastor|rev)\.?\s+", "", part.strip(), flags=re.I)
            for part in re.split(r";|\s+&\s+", value or "") if part.strip()]


def title_match(source, target):
    a, b = normalized(main_title(source)), normalized(main_title(target))
    score = similarity(a, b)
    # Preserve substantial shared titles despite a catalogue's promotional prefix.
    if len(a.split()) >= 4 and a in b:
        score = max(score, 0.96)
    return score


def clause(book, broad=False):
    title = main_title(book["title"]) if book.get("author") else book["title"]
    authors = author_parts(book.get("author"))
    if not broad or not authors:
        title_query = "title:" + quote(title)
    else:
        stop = {"a", "o", "os", "as", "de", "do", "da", "dos", "das", "e", "the", "of", "and", "in", "to", "for", "your", "with", "um", "uma"}
        words = [w for w in normalized(title).split() if w not in stop and len(w) > 2][:4]
        if len(words) < 2:
            return clause(book)
        title_query = "title:(" + " AND ".join(words) + ")"
    if authors:
        surname = normalized(authors[0]).split()
        if surname:
            title_query += " AND author:" + quote(surname[-1])
    return "(" + title_query + ")"


def isbn_values(values):
    valid, rejected = set(), []
    for value in values or []:
        try:
            valid.add(canonical_isbn(str(value)))
        except ValueError:
            rejected.append(str(value))
    return sorted(valid), rejected


def from_work(book, work):
    authors = work.get("author_name", [])
    expected = author_parts(book.get("author"))
    author_score = max((author_similarity(a, b) for a in expected for b in authors), default=0)
    if expected and author_score < 0.8:
        return []
    found = []
    for edition in work.get("editions", {}).get("docs", []):
        key = edition.get("key", "")
        score = title_match(book["title"], edition.get("title", ""))
        if score < (0.88 if expected else 0.98) or not re.fullmatch(r"/books/OL\d+M", key):
            continue
        isbns, rejected = isbn_values(edition.get("isbn", []))
        cover = edition.get("cover_i")
        found.append({
            "source": "Open Library", "source_url": "https://openlibrary.org" + key,
            "work_url": "https://openlibrary.org" + work.get("key", ""),
            "matched_title": edition.get("title", ""), "matched_authors": "; ".join(authors),
            "isbn13": isbns, "rejected_isbns": rejected,
            "publishers": edition.get("publisher", []), "publication_dates": edition.get("publish_date", []),
            "languages": edition.get("language", []), "format": edition.get("physical_format", ""),
            "pages": edition.get("number_of_pages", ""), "edition": edition.get("edition_name", ""),
            "subjects": work.get("subject", [])[:20], "first_publish_year": work.get("first_publish_year"),
            "cover_url": f"https://covers.openlibrary.org/b/id/{cover}-L.jpg?default=false" if isinstance(cover, int) and cover > 0 else "",
            "title_score": round(score, 3), "author_score": round(author_score, 3),
            "physically_confirmed": False,
        })
    return found


def merge(record, candidates):
    existing = {item["source_url"] for item in record["candidates"]}
    for candidate in candidates:
        if candidate["source_url"] not in existing:
            record["candidates"].append(candidate)
            existing.add(candidate["source_url"])


def manual_candidate(candidate):
    isbns, rejected = isbn_values(candidate["isbns"])
    return {"source": candidate.get("source_type", "manual research"),
            "source_url": candidate["source_url"], "matched_title": candidate["matched_title"],
            "matched_authors": candidate["matched_authors"], "isbn13": isbns, "rejected_isbns": rejected,
            "publishers": [candidate["publisher"]] if candidate.get("publisher") else [],
            "publication_dates": [candidate["year"]] if candidate.get("year") else [],
            "languages": [candidate["language"]] if candidate.get("language") else [],
            "format": candidate.get("format", ""), "notes": candidate.get("notes", ""),
            "physically_confirmed": False}


def unique_text(candidates, field):
    values = set()
    for candidate in candidates:
        value = candidate.get(field, "")
        values.update(str(v) for v in value if v) if isinstance(value, list) else values.add(str(value)) if value else None
    return " | ".join(sorted(values))


def export(state, folder):
    records = list(state["books"].values())
    with (folder / "books.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for record in records:
            source, candidates = record["original"], record["candidates"]
            has_isbn = any(c.get("isbn13") for c in candidates)
            status = "ISBN_CANDIDATES_REVIEW" if has_isbn else "METADATA_ONLY_REVIEW" if candidates else "UNRESOLVED"
            flags = list(record.get("flags", []))
            if not source.get("author"):
                flags.append("MISSING_SOURCE_AUTHOR")
            if any(c.get("format") == "box" for c in candidates):
                flags.append("BOX_OR_VOLUME_UNCONFIRMED")
            writer.writerow({"registrationNumber": source["register"], "source_title": source["title"],
                             "source_author": source.get("author"), "source_collection": source.get("collection"),
                             "status": status, "candidate_isbns": unique_text(candidates, "isbn13"),
                             "edition_candidates": len(candidates), "matched_titles": unique_text(candidates, "matched_title"),
                             "matched_authors": unique_text(candidates, "matched_authors"),
                             "publishers": unique_text(candidates, "publishers"),
                             "publication_dates": unique_text(candidates, "publication_dates"),
                             "languages": unique_text(candidates, "languages"), "formats": unique_text(candidates, "format"),
                             "pages": unique_text(candidates, "pages"), "source_urls": unique_text(candidates, "source_url"),
                             "flags": " | ".join(sorted(set(flags))), "search_stages": "; ".join(record["search_stages"]),
                             "physically_confirmed": "false"})
    summary = {"books": len(records), "books_with_isbn_candidates": sum(any(c.get("isbn13") for c in r["candidates"]) for r in records),
               "books_with_metadata": sum(bool(r["candidates"]) for r in records),
               "searched": sum(bool(r["search_stages"]) for r in records), "database_updates": 0}
    write_json(folder / "summary.json", summary, indent=2)
    write_json(folder / "research.json", state, indent=2)
    return summary


def run(args):
    source_bytes = args.input.read_bytes()
    fingerprint = hashlib.sha256(source_bytes).hexdigest()
    books = json.loads(source_bytes)["books"]
    args.output.mkdir(exist_ok=True)
    path = args.output / "research.json"
    if path.exists():
        if not args.resume:
            raise ValueError("A pesquisa já existe; use --resume.")
        state = json.loads(path.read_text(encoding="utf-8"))
        if state["source_sha256"] != fingerprint:
            raise ValueError("A fonte mudou; use outra pasta.")
    else:
        state = {"version": 1, "source_sha256": fingerprint, "books": {
            book["register"]: {"original": book, "candidates": [], "search_stages": [], "flags": []} for book in books}}
        if args.evidence:
            for candidate in json.loads(args.evidence.read_text(encoding="utf-8"))["candidates"]:
                merge(state["books"][candidate["registrationNumber"]], [manual_candidate(candidate)])
    cache_path = args.output / "search-cache.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    for stage in ["exact", "relaxed"]:
        pending = [r for r in state["books"].values() if stage not in r["search_stages"] and
                   (stage == "exact" or not any(c.get("isbn13") for c in r["candidates"]))]
        for start in range(0, len(pending), 4):
            group = pending[start:start + 4]
            query = " OR ".join(clause(r["original"], broad=stage == "relaxed") for r in group)
            docs, error = [], ""
            try:
                for page in range(1, 4):
                    url = "https://openlibrary.org/search.json?" + urlencode({"q": query, "fields": SEARCH_FIELDS, "limit": 100, "page": page})
                    if url not in cache:
                        time.sleep(1.1)
                        cache[url] = fetch_json(url)
                        write_json(cache_path, cache)
                    data = cache[url]
                    docs.extend(data.get("docs", []))
                    if page * 100 >= data.get("numFound", 0):
                        break
                    if page == 3:
                        error = "SEARCH_TRUNCATED"
            except RuntimeError as exc:
                error = "SEARCH_ERROR: " + str(exc)
            for record in group:
                for work in docs:
                    merge(record, from_work(record["original"], work))
                record["search_stages"].append(stage)
                if error:
                    record["flags"].append(error)
            summary = export(state, args.output)
            print(json.dumps({"stage": stage, "batch_end": start + len(group), "stage_total": len(pending), **summary}), flush=True)
            if "HTTP 429" in error or "HTTP 403" in error:
                raise RuntimeError(error)
    print(json.dumps(export(state, args.output)), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--evidence", type=Path)
    parser.add_argument("--resume", action="store_true")
    try:
        run(parser.parse_args())
    except (ValueError, OSError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(2)
