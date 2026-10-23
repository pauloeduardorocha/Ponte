"""Validate sourced ISBN candidates and export a review CSV. Never writes to the database."""

import argparse
import csv
import json
from pathlib import Path
import re

from fetch_openlibrary_covers import read_books

FIELDS = ["registrationNumber", "source_title", "source_author", "status", "isbn13",
          "isbn_as_published", "matched_title", "matched_authors", "language", "publisher",
          "year", "format", "source_type", "source_url", "notes", "physically_confirmed"]


def canonical_isbn(value):
    isbn = re.sub(r"[\s-]", "", value).upper()
    if re.fullmatch(r"\d{9}[\dX]", isbn):
        digits = [int(c) if c != "X" else 10 for c in isbn]
        if sum((10 - index) * digit for index, digit in enumerate(digits)) % 11:
            raise ValueError(f"ISBN-10 inválido: {value}")
        prefix = "978" + isbn[:9]
        check = (10 - sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(prefix)) % 10) % 10
        return prefix + str(check)
    if re.fullmatch(r"97[89]\d{10}", isbn):
        if sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(isbn)) % 10 == 0:
            return isbn
    raise ValueError(f"ISBN inválido: {value}")


def review_rows(books, evidence):
    known = {book["registrationNumber"] for book in books}
    grouped = {}
    for candidate in evidence:
        register = candidate["registrationNumber"]
        if register not in known:
            raise ValueError(f"Registo não pertence à entrada: {register}")
        if not candidate.get("source_url", "").startswith("https://"):
            raise ValueError("Cada candidato exige uma URL de fonte HTTPS.")
        if not candidate.get("matched_title") or not candidate.get("matched_authors"):
            raise ValueError("Cada candidato exige título e autor encontrados.")
        isbns = {canonical_isbn(value) for value in candidate["isbns"]}
        if len(isbns) != 1:
            raise ValueError("Separe ISBNs de edições diferentes em candidatos distintos.")
        grouped.setdefault(register, []).append({**candidate, "isbn13": isbns.pop()})
    for book in books:
        base = {"registrationNumber": book["registrationNumber"], "source_title": book["title"],
                "source_author": book["author"], "physically_confirmed": "false"}
        candidates = grouped.get(book["registrationNumber"], [])
        if not candidates:
            yield {**base, "status": "NO_ISBN_FOUND", "notes": "Pesquisa sem ISBN candidato suficiente; não prova inexistência de ISBN."}
        for candidate in candidates:
            row = {key: candidate.get(key, "") for key in FIELDS}
            row.update(base, isbn13=candidate["isbn13"], isbn_as_published="; ".join(candidate["isbns"]),
                       status="REVIEW_BOX_OR_VOLUME" if candidate.get("format") == "box" else "REVIEW_EDITION")
            yield row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    books = list(read_books(args.input))
    evidence = json.loads(args.evidence.read_text(encoding="utf-8"))["candidates"]
    rows = list(review_rows(books, evidence))
    with args.output.open("x", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    matched = {row["registrationNumber"] for row in rows if row.get("isbn13")}
    print(json.dumps({"books": len(books), "books_with_candidates": len(matched),
                      "unresolved": len(books) - len(matched), "candidate_rows": sum(bool(row.get("isbn13")) for row in rows),
                      "database_updates": 0}, ensure_ascii=False))


if __name__ == "__main__":
    main()
