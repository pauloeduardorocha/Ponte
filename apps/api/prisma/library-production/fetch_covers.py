"""Pesquisa capas no Google Imagens sem chave. Python 3.10+ e Playwright."""

import argparse
import csv
import json
from pathlib import Path
import sys
import time
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit

FIELDS = ["registrationNumber", "title", "author", "cover_url", "status",
          "result_caption", "source_url", "search_url", "candidate_urls"]


class ImageSearchError(Exception):
    pass


def image_url(value):
    """Preserve real source URLs; exclude inline images and Google thumbnails."""
    parts = urlsplit(value or "")
    host = (parts.hostname or "").lower()
    if parts.scheme not in ("http", "https") or not host:
        return ""
    if host == "gstatic.com" or host.endswith(".gstatic.com"):
        return ""
    if parts.path.startswith(("/images/branding/", "/logos/")):
        return ""
    return value


def results_from_links(links):
    results, seen = [], set()
    for link in links:
        href = urljoin("https://www.google.com", link.get("href", ""))
        params = parse_qs(urlsplit(href).query)
        cover = image_url(params.get("imgurl", [""])[0])
        if cover and cover not in seen:
            seen.add(cover)
            results.append({"url": cover, "caption": link.get("caption", ""),
                            "source": params.get("imgrefurl", [""])[0]})
    return results


class GoogleImages:
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
        host, path = urlsplit(self.page.url).hostname or "", urlsplit(self.page.url).path
        if path.startswith("/sorry") or self.page.locator('iframe[src*="recaptcha"], #captcha-form').count():
            raise ImageSearchError("Google apresentou CAPTCHA/bloqueio. Lote interrompido; tente mais tarde no seu navegador. Não há contorno automático.")
        if host.startswith("consent.google."):
            raise ImageSearchError("Google exige consentimento. Abra a pesquisa manualmente; não foi possível obter resultados nesta sessão.")

    def links(self):
        return self.page.locator('a[href*="imgurl="]').evaluate_all(
            '(links) => links.map(a => ({href:a.href,caption:a.innerText || a.querySelector("img")?.alt || ""}))')

    def search(self, title, author):
        query = " ".join(part for part in (title.strip(), author.strip(), "capa livro") if part)
        search_url = "https://www.google.com/search?" + urlencode({"q": query, "udm": "2", "hl": "pt-PT"})
        try:
            response = self.page.goto(search_url, wait_until="domcontentloaded", timeout=40000)
            self.check_access()
            if response and response.status in (403, 429):
                raise ImageSearchError(f"Google bloqueou a pesquisa: HTTP {response.status}.")
            self.page.wait_for_timeout(1200)
            self.check_access()
            results = results_from_links(self.links())
            # Some layouts expose originals only after opening an image preview.
            if not results:
                thumbnails = self.page.locator("img").all()
                seen = set()
                for thumb in thumbnails[:30]:
                    box = thumb.bounding_box()
                    if not box or box["width"] < 60 or box["height"] < 80:
                        continue
                    thumb.click(timeout=5000)
                    self.page.wait_for_timeout(600)
                    self.check_access()
                    results.extend(results_from_links(self.links()))
                    preview = self.page.locator("img").evaluate_all('''(imgs) => imgs.map(i => ({
                        url:i.currentSrc || i.src, caption:i.alt,
                        width:i.getBoundingClientRect().width, height:i.getBoundingClientRect().height,
                        source:i.closest("a")?.href || ""
                    })).filter(i => i.width >= 180 && i.height >= 220 && i.height > i.width)''')
                    for item in preview:
                        url = image_url(item["url"])
                        if url and url not in seen:
                            seen.add(url)
                            results.append({"url":url,"caption":item["caption"],"source":item["source"]})
                    if results:
                        break
            unique = {item["url"]: item for item in reversed(results)}
            return search_url, list(reversed(list(unique.values())))[:self.limit]
        except ImageSearchError:
            raise
        except Exception:
            raise ImageSearchError("Falha ao ler o Google Imagens. A página pode ter mudado ou a ligação falhou.") from None


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
        with GoogleImages(args.browser, args.headed, args.candidates) as search:
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
