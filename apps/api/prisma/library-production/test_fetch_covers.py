import csv
from io import StringIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import fetch_covers as covers


class CoverTests(unittest.TestCase):
    def test_extracts_original_url_source_and_caption(self):
        original = "https://publisher.example/capa.jpg?size=large&edition=2"
        links = [json.dumps({"murl": original, "purl": "https://publisher.example/livro", "t": "Livro — Autor"})]
        result = covers.results_from_metadata(links + links)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["url"], original)
        self.assertEqual(result[0]["source"], "https://publisher.example/livro")
        self.assertEqual(result[0]["caption"], "Livro — Autor")

    def test_excludes_inline_images_google_thumbnails_and_page_links(self):
        for url in ["data:image/png;base64,AAAA", "https://encrypted-tbn0.gstatic.com/image", "javascript:alert(1)", ""]:
            self.assertEqual(covers.image_url(url), "")
        self.assertEqual(covers.results_from_metadata(["bad json", "null", json.dumps({"purl":"https://shop.example/book"})]), [])

    def test_marks_search_result_as_unverified_instead_of_inventing_author_match(self):
        search = MagicMock()
        search.search.return_value = ("https://bing.com/images/search?q=livro", [{"url":"https://publisher.example/capa.jpg", "caption":"Livro", "source":"https://publisher.example"}])
        result = covers.find_cover("Livro", "Autora", search, "00001")
        self.assertEqual(result["status"], "REVIEW_IMAGE_SEARCH")
        self.assertEqual(result["registrationNumber"], "00001")
        self.assertEqual(len(json.loads(result["candidate_urls"])), 1)

    def test_reads_inventory_preserving_register(self):
        rows = list(covers.read_books(Path(__file__).with_name("inventory.json")))
        self.assertEqual(len(rows), 384)
        self.assertEqual(rows[0][2], "00001")

    def test_detects_captcha_without_attempting_to_solve_it(self):
        search = covers.BingImages()
        search.page = MagicMock(url="https://www.bing.com/turing/captcha")
        search.page.locator.return_value.inner_text.return_value = "Verify you are human"
        with self.assertRaisesRegex(covers.ImageSearchError, "CAPTCHA"):
            search.check_access()

    @patch.object(covers, "BingImages")
    def test_retains_csv_rows_when_bing_blocks_batch(self, factory):
        search = factory.return_value.__enter__.return_value
        search.search.side_effect = [("https://bing.com/images/search", [{"url":"https://publisher.example/capa.jpg", "caption":"Livro", "source":""}]), covers.ImageSearchError("CAPTCHA")]
        with tempfile.TemporaryDirectory() as folder:
            source, output = Path(folder)/"input.csv", Path(folder)/"output.csv"
            source.write_text("registrationNumber,title,author\n00001,Livro Um,Autora\n00002,Livro Dois,Autora\n", encoding="utf-8")
            with patch("sys.stderr", new=StringIO()):
                code = covers.main(["--input",str(source),"--output",str(output),"--delay","0"])
            self.assertEqual(code, 2)
            with output.open(encoding="utf-8-sig",newline="") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["registrationNumber"], "00001")

    @patch.object(covers, "BingImages")
    def test_cli_needs_no_key_and_reports_empty_extraction(self, factory):
        factory.return_value.__enter__.return_value.search.return_value = ("https://bing.com/images/search", [])
        with patch.dict("os.environ", {}, clear=True), patch("sys.stdout",new=StringIO()) as out, patch("sys.stderr",new=StringIO()):
            code = covers.main(["Livro","Autora","--json"])
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(out.getvalue())["status"], "NO_IMAGE_EXTRACTED")


if __name__ == "__main__":
    unittest.main()
