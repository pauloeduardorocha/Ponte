"""Pesquisa capas no Bing Imagens sem chave. Python 3.10+ e Playwright."""

import argparse
import csv
import json
from pathlib import Path
import sys
import time
from urllib.parse import urlencode, urlsplit

FIELDS = ["registrationNumber", "title", "author", "cover_url", "status",
          "result_caption", "source_url", "search_url", "candidate_urls"]


class ImageSearchError(Exception):
    pass


def image_url(value):
    """Preserve real source URLs; exclude inline images and search thumbnails."""
    parts = urlsplit(value or "")
    host = (parts.hostname or "").lower()
    if parts.scheme not in ("http", "https") or not host:
        return ""
    if host == "gstatic.com" or host.endswith(".gstatic.com"):
        return ""
    if host == "mm.bing.net" or host.endswith(".mm.bing.net"):
        return ""
    if parts.path.startswith(("/images/branding/", "/logos/")):
        return ""
    return value


def results_from_metadata(records):
    results, seen = [], set()
    for raw in records:
        try:
            item = json.loads(raw)
        except (ValueError, TypeError):
            continue
        if not isinstance(item, dict):
            continue
        cover = image_url(item.get("murl", ""))
        if cover and cover not in seen:
            seen.add(cover)
            results.append({"url": cover, "caption": item.get("t", ""),
                            "source": item.get("purl", "")})
    return results


class BingImages:
    def __init__(self, browser="chromium", headed=False, candidates=3):
        self.browser_name, self.headed, self.limit = browser, headed, candidates
        self.runtime = self.browser = None

    def __enter__(self):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            raise ImageSearchError("Instale: python -m pip install playwright; python -m playwright install chromium") from None
        self.runtime = sync_playwright().start()
        try:
            options = {"headless": not self.headed}
            if self.browser_name != "chromium":
                options["channel"] = self.browser_name
            self.browser = self.runtime.chromium.launch(**options)
            self.page = self.browser.new_page(locale="pt-PT", viewport={"width": 1280, "height": 900})
            self.page.set_default_timeout(10000)
            return self
        except Exception:
            self.__exit__(None, None, None)
            raise ImageSearchError("Não foi possível abrir o navegador. Execute python -m playwright install chromium ou use --browser chrome/msedge.") from None

    def __exit__(self, *_):
        try:
            if self.browser:
                self.browser.close()
        finally:
            if self.runtime:
                self.runtime.stop()

    def check_access(self):
        path = urlsplit(self.page.url).path.lower()
        challenge = self.page.locator('iframe[src*="captcha"], iframe[src*="challenge"], #b_captcha, #captcha')
        text = self.page.locator("body").inner_text(timeout=5000).casefold()
        if "captcha" in path or "/turing/" in path or challenge.count() or any(
            phrase in text for phrase in ("verify you are human", "verifique se é humano",
                                         "solve the challenge", "unusual traffic", "tráfego incomum")
        ):
            raise ImageSearchError("Bing apresentou CAPTCHA/bloqueio. Lote interrompido; não há contorno automático.")

    def search(self, title, author):
        query = " ".join(part for part in (title.strip(), author.strip(), "capa livro") if part)
        search_url = "https://www.bing.com/images/search?" + urlencode({"q": query})
        try:
            from playwright.sync_api import TimeoutError as BrowserTimeout
            response = self.page.goto(search_url, wait_until="domcontentloaded", timeout=40000)
            if response and response.status >= 400:
                raise ImageSearchError(f"Bing respondeu HTTP {response.status}; lote interrompido.")
            self.check_access()
            try:
                self.page.locator('a.iusc[m]').first.wait_for(state="attached", timeout=10000)
            except BrowserTimeout:
                self.check_access()
                return search_url, []
            self.check_access()
            records = self.page.locator('a.iusc[m]').evaluate_all(
                '(links) => links.slice(0,50).map(a => a.getAttribute("m"))')
            return search_url, results_from_metadata(records)[:self.limit]
        except ImageSearchError:
            raise
        except Exception:
            raise ImageSearchError("Falha ao ler o Bing Imagens. A página pode ter mudado ou a ligação falhou.") from None


def find_cover(title, author, search, registration_number=""):
    search_url, candidates = search.search(title, author)
    result = dict.fromkeys(FIELDS, "")
    result.update(registrationNumber=registration_number, title=title, author=author,
                  status="NO_IMAGE_EXTRACTED", search_url=search_url, candidate_urls="[]")
    if candidates:
        first = candidates[0]
        result.update(cover_url=first["url"], result_caption=first["caption"],
                      source_url=first["source"], status="REVIEW_IMAGE_SEARCH",
                      candidate_urls=json.dumps(candidates, ensure_ascii=False))
    return result


def read_books(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        if path.suffix.lower() == ".json":
            data = json.load(source)
            rows = data if isinstance(data, list) else data.get("books")
            if not isinstance(rows, list):
                raise ValueError("O JSON deve ser uma lista ou conter a chave books.")
        else:
            rows = list(csv.DictReader(source))
    for row in rows:
        title = str(row.get("title") or "").strip()
        if not title:
            raise ValueError("Cada linha deve ter title preenchido; author é opcional.")
        yield (title, str(row.get("author") or "").strip(),
               str(row.get("registrationNumber") or row.get("register") or row.get("id") or ""))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("title", nargs="?")
    parser.add_argument("author", nargs="?", default="")
    parser.add_argument("--input", type=Path, help="CSV title,author ou inventory.json")
    parser.add_argument("--output", type=Path, help="CSV novo para revisão")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--delay", type=float, default=2.0)
    parser.add_argument("--browser", choices=["chromium", "chrome", "msedge"], default="chromium")
    parser.add_argument("--headed", action="store_true", help="Mostrar o navegador")
    parser.add_argument("--candidates", type=int, default=3, choices=range(1, 11))
    args = parser.parse_args(argv)
    if bool(args.title) == bool(args.input):
        parser.error("Informe título ou --input, exclusivamente.")
    if args.input and not args.output:
        parser.error("--input exige --output.")
    if args.delay < 0:
        parser.error("--delay deve ser positivo ou zero.")
    try:
        books = list(read_books(args.input)) if args.input else [(args.title, args.author, "")]
        # Fail before opening the browser if a previous review would be overwritten.
        if args.output and args.output.exists():
            raise FileExistsError(f"A saída já existe: {args.output}")
        with BingImages(args.browser, args.headed, args.candidates) as search:
            if not args.output:
                result = find_cover(*books[0][:2], search, books[0][2])
                print(json.dumps(result, ensure_ascii=False, indent=2) if args.json else result["cover_url"])
                if not result["cover_url"]:
                    print("Nenhuma URL original extraída. Consulte search_url no modo --json.", file=sys.stderr)
                    return 1
                return 0
            with args.output.open("x", encoding="utf-8-sig", newline="") as target:
                writer = csv.DictWriter(target, fieldnames=FIELDS)
                writer.writeheader()
                for index, (title, author, registration) in enumerate(books):
                    if index:
                        time.sleep(args.delay)
                    writer.writerow(find_cover(title, author, search, registration))
                    target.flush()
                    print(f"{index + 1}/{len(books)} · {registration} · {title}", file=sys.stderr)
        return 0
    except (ImageSearchError, OSError, ValueError) as exc:
        print(f"Erro: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
