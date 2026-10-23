"""Enrich edition metadata and export an offline review package; never writes a database."""
import argparse
import copy
import csv
import json
from pathlib import Path
import re
import time

from fetch_openlibrary_covers import fetch_json
from research_inventory import export, isbn_values, merge, normalized, write_json


def enrich(state, folder):
    path = folder / "edition-cache.json"
    cache = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    for number, record in enumerate(state["books"].values(), 1):
        candidates = [c for c in record["candidates"] if c.get("isbn13") and
                      re.fullmatch(r"https://openlibrary.org/books/OL\d+M", c["source_url"])]
        candidates.sort(key=lambda c: (c.get("author_score", 0), c.get("title_score", 0), bool(c.get("cover_url"))), reverse=True)
        # One best edition per source book, shared editions fetched only once.
        for candidate in candidates[:1]:
            url = candidate["source_url"] + ".json"
            if url not in cache:
                time.sleep(1.1)
                try:
                    cache[url] = fetch_json(url)
                except RuntimeError as exc:
                    record["flags"].append("EDITION_FETCH_ERROR: " + str(exc))
                    if "429" in str(exc) or "403" in str(exc):
                        raise
                    continue
                write_json(path, cache)
            data = cache[url]
            candidate["isbn13"], candidate["rejected_isbns"] = isbn_values(data.get("isbn_13", []) + data.get("isbn_10", []))
            for target, key in [("publishers", "publishers"), ("publication_places", "publish_places"),
                                ("contributors", "contributions"), ("identifiers", "identifiers")]:
                if data.get(key):
                    candidate[target] = data[key]
            for target, key in [("pages", "number_of_pages"), ("pagination", "pagination"),
                                ("format", "physical_format"), ("edition", "edition_name"), ("subtitle", "subtitle")]:
                if data.get(key):
                    candidate[target] = data[key]
            if data.get("publish_date"):
                candidate["publication_dates"] = [data["publish_date"]]
            if data.get("languages"):
                candidate["languages"] = [v["key"].split("/")[-1] for v in data["languages"]]
            covers = [v for v in data.get("covers", []) if isinstance(v, int) and v > 0]
            if covers:
                candidate["cover_url"] = f"https://covers.openlibrary.org/b/id/{covers[0]}-L.jpg?default=false"
            candidate["metadata_evidence"] = "EDITION_JSON"
        if number % 40 == 0:
            print(json.dumps({"edition_enrichment_progress": number, "total": len(state["books"])}), flush=True)


def candidate_flags(record, candidate):
    flags = ["EDICAO_FISICA_POR_CONFIRMAR"]
    if not record["original"].get("author"):
        flags.append("AUTOR_AUSENTE_NO_ACERVO")
    if candidate.get("author_evidence_method") == "SEARCH_RESULT_TEXT":
        flags.append("METADADOS_DO_RESULTADO_DE_PESQUISA")
    if len(candidate.get("isbn13", [])) > 1:
        flags.append("MULTIPLOS_ISBNS_NA_FONTE")
    text = normalized(" ".join(str(candidate.get(k, "")) for k in ["format", "edition", "matched_title", "notes"]))
    if re.search(r"\b(ebook|e book|kindle|digital|epub|pdf)\b", text):
        flags.append("POSSIVEL_EDICAO_DIGITAL")
    if re.search(r"\b(box|kit|colecao|collection|set|volume|volumes)\b", text):
        flags.append("CONFERIR_VOLUME_OU_COLECAO")
    return flags


def consolidate(base, web):
    state = copy.deepcopy(base)
    for candidate in web["evidence"]:
        candidate = copy.deepcopy(candidate)
        candidate["isbn13"], candidate["rejected_isbns"] = isbn_values(candidate.get("isbn13", []))
        merge(state["books"][candidate["registrationNumber"]], [candidate])
    for key in web["done"]:
        stages = state["books"][key]["search_stages"]
        if "web_catalogues" not in stages:
            stages.append("web_catalogues")
    for record in state["books"].values():
        for candidate in record["candidates"]:
            candidate["review_flags"] = candidate_flags(record, candidate)
            candidate["physically_confirmed"] = False
        record["review_status"] = ("ISBN candidato" if any(c.get("isbn13") for c in record["candidates"]) else
                                    "Só metadados" if record["candidates"] else "Sem correspondência")
    state["methodology"] = {
        "date": "2026-10-22", "physical_editions_confirmed": 0, "database_updates": 0,
        "isbn_policy": "ISBN-10/13 com dígito verificador válido, normalizados para ISBN-13. Validade matemática não confirma a edição.",
        "sources": "Open Library: pesquisa de todas as obras, dados de edição. Pesquisa web complementar dos 307 registos sem ISBN na primeira etapa.",
        "web_evidence": "Metadados de resultados indexados. Páginas não verificadas individualmente. Conferir a ficha e o exemplar antes de importar.",
        "edition_policy": "Alternativas preservadas por URL. Editora, ano, idioma e ISBN pertencem à mesma linha candidata e não devem ser combinados entre linhas.",
        "missing_policy": "Campo vazio significa informação não encontrada. Autor ausente na fonte reduz a segurança da correspondência.",
    }
    return state


def deliver(state, folder):
    for record in state["books"].values():
        for candidate in record["candidates"]:
            candidate["review_flags"] = candidate_flags(record, candidate)
    export(state, folder)
    records = list(state["books"].values())
    stats = json.loads((folder / "summary.json").read_text(encoding="utf-8"))
    stats.update({
        "books_without_isbn": sum(not any(c.get("isbn13") for c in r["candidates"]) for r in records),
        "books_without_matches": sum(not r["candidates"] for r in records),
        "edition_candidates": sum(len(r["candidates"]) for r in records),
        "books_with_isbn_but_missing_source_author": sum(not r["original"].get("author") and any(c.get("isbn13") for c in r["candidates"]) for r in records),
        "books_with_pages": sum(any(c.get("pages") for c in r["candidates"]) for r in records),
        "books_with_cover_url": sum(any(c.get("cover_url") for c in r["candidates"]) for r in records),
        "books_with_publishers": sum(any(c.get("publishers") for c in r["candidates"]) for r in records),
        "books_with_publication_dates": sum(any(c.get("publication_dates") for c in r["candidates"]) for r in records),
        "books_with_languages": sum(any(c.get("languages") for c in r["candidates"]) for r in records),
        "books_with_search_warnings": sum(bool(r.get("flags")) for r in records),
        "relaxed_searched": sum("relaxed" in r["search_stages"] for r in records),
        "web_searched": sum("web_catalogues" in r["search_stages"] for r in records),
        "physical_editions_confirmed": 0,
    })
    write_json(folder / "summary.json", stats, indent=2)
    details = []
    for record in records:
        for candidate in record["candidates"]:
            details.append({"registrationNumber": record["original"]["register"], **candidate})
    fields = ["registrationNumber", "matched_title", "matched_authors", "isbn13", "publishers", "publication_dates",
              "languages", "pages", "format", "edition", "subtitle", "subjects", "cover_url", "review_flags", "source", "source_url", "metadata_evidence", "notes"]
    with (folder / "edicoes-candidatas.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for candidate in details:
            writer.writerow({k: " | ".join(map(str, v)) if isinstance(v, list) else v for k, v in candidate.items() if k in fields})
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--enrich", action="store_true")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    state = consolidate(json.loads((args.input / "research.json").read_text(encoding="utf-8")),
                        json.loads((args.input / "web-research.json").read_text(encoding="utf-8")))
    if args.enrich:
        enrich(state, args.input)
    deliver(state, args.output)
