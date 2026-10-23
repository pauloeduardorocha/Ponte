"""Open Library cover candidates with edition/title/author checks. No key or dependencies."""

import argparse
import csv
from difflib import SequenceMatcher
import json
from pathlib import Path
import re
import sys
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

FIELDS = ["registrationNumber", "title", "author", "status", "cover_url",
          "matched_title", "matched_authors", "edition_url", "work_url",
          "languages", "title_score", "author_score", "candidate_urls"]
API_FIELDS = "key,title,author_name,editions,editions.key,editions.title,editions.language,editions.cover_i"


def normalized(value):
    value = unicodedata.normalize("NFKD", value or "").casefold()
    return " ".join(re.findall(r"[a-z0-9]+", "".join(c for c in value if not unicodedata.combining(c))))


def main_title(title):
    # Source spreadsheets often append a subtitle to the catalog title.
    return re.split(r"\s+[-–—]\s+|:\s+", title, maxsplit=1)[0].strip()


def similarity(left, right):
    left, right = normalized(left), normalized(right)
    return SequenceMatcher(None, left, right).ratio() if left and right else 0


def author_similarity(left, right):
    a, b = normalized(left).split(), normalized(right).split()
    if a and b and a[-1] == b[-1] and len(a) == len(b):
        if all(x == y or (min(len(x), len(y)) == 1 and x[0] == y[0]) for x, y in zip(a, b)):
            return 1.0
    return similarity(" ".join(sorted(a)), " ".join(sorted(b)))


def quote(value):
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'


def search_clause(book):
    search_title = main_title(book["title"]) if normalized(book.get("author")) else book["title"]
    clause = "title:" + quote(search_title)
    if normalized(book.get("author")):
        # Surname finds initials/full-name variants; returned names are checked locally.
        clause += " AND author:" + quote(normalized(book["author"]).split()[-1])
    return "(" + clause + ")"


def read_books(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        if path.suffix.lower() == ".json":
            data = json.load(source)
            rows = data if isinstance(data, list) else data.get("books")
        else:
            rows = list(csv.DictReader(source))
    if not isinstance(rows, list):
        raise ValueError("O JSON deve conter books ou ser uma lista.")
    for row in rows:
        title = str(row.get("title") or "").strip()
        if not title:
            raise ValueError("Cada livro exige title.")
        yield {"title": title, "author": str(row.get("author") or "").strip(),
               "registrationNumber": str(row.get("registrationNumber") or row.get("register") or row.get("id") or "")}


def fetch_json(url):
    request = Request(url, headers={"User-Agent": "PonteLibraryCoverReview/1.0 (+https://igrejaponte.com)", "Accept": "application/json"})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=40) as response:
                return json.load(response)
        except HTTPError as error:
            if error.code >= 500 and attempt < 2:
                time.sleep(2 ** (attempt + 1))
                continue
            raise RuntimeError(f"Open Library HTTP {error.code}; execução interrompida.") from None
        except (URLError, TimeoutError):
            if attempt < 2:
                time.sleep(2 ** (attempt + 1))
                continue
            raise RuntimeError("Falha de rede ao consultar Open Library.") from None


def candidates_for(book, docs):
    candidates = []
    for work in docs:
        authors = work.get("author_name", [])
        author_score = max((author_similarity(book["author"], a) for a in authors), default=0)
        if book["author"] and author_score < 0.8:
            continue
        # A work's cover can belong to another translation. Use only edition covers.
        for edition in work.get("editions", {}).get("docs", []):
            source_title = main_title(book["title"]) if book["author"] else book["title"]
            matched_title = main_title(edition.get("title", "")) if book["author"] else edition.get("title", "")
            title_score = similarity(source_title, matched_title)
            cover = edition.get("cover_i")
            key = edition.get("key", "")
            if title_score < 0.88 or not isinstance(cover, int) or cover <= 0 or not re.fullmatch(r"/books/OL\d+M", key):
                continue
            candidates.append({"cover_url": f"https://covers.openlibrary.org/b/id/{cover}-L.jpg?default=false",
                               "matched_title": edition.get("title", ""),
                               "matched_authors": "; ".join(authors),
                               "edition_url": "https://openlibrary.org" + key,
                               "work_url": "https://openlibrary.org" + work.get("key", ""),
                               "languages": "; ".join(edition.get("language", [])),
                               "title_score": round(title_score, 3), "author_score": round(author_score, 3)})
    return sorted(candidates, key=lambda c: (c["title_score"], c["author_score"]), reverse=True)


def result_for(book, docs):
    result = dict.fromkeys(FIELDS, "")
    result.update(book, status="NO_CONFIDENT_EDITION_COVER", candidate_urls="[]")
    candidates = candidates_for(book, docs)
    if candidates:
        result.update(candidates[0], status="REVIEW_EDITION" if book["author"] else "REVIEW_MISSING_AUTHOR",
                      candidate_urls=json.dumps(candidates[:3], ensure_ascii=False))
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("title", nargs="?")
    parser.add_argument("author", nargs="?", default="")
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--cache", type=Path, help="Cache JSON de respostas de pesquisa")
    parser.add_argument("--limit", type=int, default=20, help="Máximo de livros, padrão piloto de 20")
    args = parser.parse_args(argv)
    if bool(args.title) == bool(args.input) or (args.input and not args.output) or args.limit < 1:
        parser.error("Use título [autor] ou --input ficheiro --output novo.csv; --limit deve ser positivo.")
    try:
        books = list(read_books(args.input))[:args.limit] if args.input else [{"title": args.title, "author": args.author, "registrationNumber": ""}]
        if args.output and args.output.exists():
            raise FileExistsError(f"A saída já existe: {args.output}")
        cache = json.loads(args.cache.read_text(encoding="utf-8")) if args.cache and args.cache.exists() else {}
        target = args.output.open("x", encoding="utf-8-sig", newline="") if args.output else None
        try:
            writer = csv.DictWriter(target, fieldnames=FIELDS) if target else None
            if writer:
                writer.writeheader()
            # Batch four titles into each search; no hundreds of individual-book calls.
            for start in range(0, len(books), 4):
                batch = books[start:start + 4]
                query = " OR ".join(search_clause(book) for book in batch)
                docs = []
                for page in range(1, 4):
                    url = "https://openlibrary.org/search.json?" + urlencode({"q": query, "fields": API_FIELDS, "lang": "pt", "limit": 100, "page": page})
                    if url not in cache:
                        time.sleep(1.1)
                        cache[url] = fetch_json(url)
                        if args.cache:
                            args.cache.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
                    data = cache[url]
                    docs.extend(data.get("docs", []))
                    if page * 100 >= data.get("numFound", 0):
                        break
                    if page == 3:
                        raise RuntimeError("Pesquisa excedeu 300 obras. Reduza o lote antes de classificar os resultados.")
                for book in batch:
                    result = result_for(book, docs)
                    if writer:
                        writer.writerow(result)
                        target.flush()
                        print(f"{book['registrationNumber']} · {result['status']} · {book['title']}", file=sys.stderr)
                    else:
                        print(json.dumps(result, ensure_ascii=False, indent=2))
        finally:
            if target:
                target.close()
        return 0
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Erro: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
