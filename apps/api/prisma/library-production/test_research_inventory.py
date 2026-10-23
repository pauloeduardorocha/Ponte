import copy
import unittest

from research_inventory import clause, from_work, merge, isbn_values
from consolidate_inventory_research import consolidate


class InventoryResearchTests(unittest.TestCase):
    def setUp(self):
        self.book = {"register": "00001", "title": "Teologia Sistemática", "author": "Wayne Grudem"}
        self.work = {"key": "/works/OL1W", "author_name": ["Wayne Grudem"],
                     "isbn": ["9780310286707"], "editions": {"docs": [{"key": "/books/OL1M", "title": "Teologia Sistemática", "isbn": ["0310286700"]}]}}

    def test_edition_isbn_does_not_leak_from_work(self):
        self.work["editions"]["docs"][0]["isbn"] = []
        self.assertEqual(from_work(self.book, self.work)[0]["isbn13"], [])

    def test_different_author_is_rejected(self):
        self.work["author_name"] = ["Louis Berkhof"]
        self.assertEqual(from_work(self.book, self.work), [])

    def test_different_language_title_is_rejected(self):
        self.work["editions"]["docs"][0]["title"] = "Systematic Theology"
        self.assertEqual(from_work(self.book, self.work), [])

    def test_invalid_checksum_is_rejected(self):
        accepted, rejected = isbn_values(["9780310286708", "0310286700"])
        self.assertEqual(accepted, ["9780310286707"])
        self.assertEqual(rejected, ["9780310286708"])

    def test_broader_query_uses_supported_and_terms(self):
        query = clause(self.book, broad=True)
        self.assertIn("teologia AND sistematica", query)
        self.assertNotIn("~", query)

    def test_merge_is_idempotent(self):
        record = {"candidates": []}
        candidates = from_work(self.book, self.work)
        merge(record, candidates)
        merge(record, candidates)
        self.assertEqual(len(record["candidates"]), 1)

    def test_consolidation_preserves_source_and_requires_review(self):
        book = {**self.book, "author": None}
        base = {"books": {"00001": {"original": book, "candidates": [], "search_stages": ["exact"], "flags": []}}}
        before = copy.deepcopy(base)
        evidence = {"registrationNumber": "00001", "source_url": "https://example.com/book", "isbn13": ["0310286700"], "format": "ebook"}
        result = consolidate(base, {"evidence": [evidence], "done": ["00001"]})
        self.assertEqual(base, before)
        candidate = result["books"]["00001"]["candidates"][0]
        self.assertFalse(candidate["physically_confirmed"])
        self.assertIn("AUTOR_AUSENTE_NO_ACERVO", candidate["review_flags"])
        self.assertIn("POSSIVEL_EDICAO_DIGITAL", candidate["review_flags"])
        self.assertEqual(candidate["isbn13"], ["9780310286707"])


if __name__ == "__main__":
    unittest.main()
