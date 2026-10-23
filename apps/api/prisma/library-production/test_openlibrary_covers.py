import unittest
from fetch_openlibrary_covers import result_for, author_similarity, search_clause, read_books
from pathlib import Path


def work(edition_title="Cristianismo puro e simples", author="C. S. Lewis", cover=10581887):
    return {"key": "/works/OL71056W", "title": "Mere Christianity", "cover_i": 6538891,
            "author_name": [author], "editions": {"docs": [{"key": "/books/OL31895729M",
            "title": edition_title, "cover_i": cover, "language": ["por"]}]}}


class OpenLibraryTests(unittest.TestCase):
    def setUp(self):
        self.book = {"registrationNumber": "00228", "title": "Cristianismo puro e simples", "author": "C.S. Lewis"}

    def test_uses_matched_edition_cover_instead_of_work_translation(self):
        result = result_for(self.book, [work()])
        self.assertIn("/10581887-L.jpg", result["cover_url"])
        self.assertNotIn("6538891", result["cover_url"])
        self.assertEqual(result["registrationNumber"], "00228")
        self.assertEqual(result["status"], "REVIEW_EDITION")

    def test_rejects_another_language_title_or_unrelated_author(self):
        for doc in [work(edition_title="Mere Christianity"), work(author="Outro Autor")]:
            self.assertEqual(result_for(self.book, [doc])["cover_url"], "")

    def test_does_not_fall_back_to_work_cover_when_edition_has_none(self):
        self.assertEqual(result_for(self.book, [work(cover=None)])["cover_url"], "")

    def test_author_initials_allow_full_names_but_not_different_people(self):
        self.assertEqual(author_similarity("J. C. Ryle", "John Charles Ryle"), 1)
        self.assertLess(author_similarity("J. C. Ryle", "James Andrew Ryle"), 0.8)

    def test_subtitles_do_not_hide_matching_title_and_author(self):
        self.book["title"] = "Cristianismo puro e simples: uma introdução"
        self.assertEqual(result_for(self.book, [work()])["status"], "REVIEW_EDITION")

    def test_missing_author_is_marked_explicitly_for_review(self):
        self.book["author"] = ""
        self.assertEqual(result_for(self.book, [work()])["status"], "REVIEW_MISSING_AUTHOR")

    def test_query_escapes_special_characters(self):
        self.assertIn('title:"A \\"capa\\""', search_clause({"title": 'A "capa"', "author": "Lewis"}))

    def test_pilot_has_20_distinct_source_registers(self):
        books = list(read_books(Path(__file__).with_name("openlibrary-pilot-20.json")))
        self.assertEqual(len(books), 20)
        self.assertEqual(len({book["registrationNumber"] for book in books}), 20)


if __name__ == "__main__":
    unittest.main()
