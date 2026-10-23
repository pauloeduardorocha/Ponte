import json
from pathlib import Path
import unittest

from prepare_isbn_review import canonical_isbn, read_books, review_rows


class ISBNReviewTests(unittest.TestCase):
    def test_validates_both_formats_and_preserves_leading_zero(self):
        self.assertEqual(canonical_isbn("0-85476-469-0"), "9780854764693")
        self.assertEqual(canonical_isbn("978-0-85476-469-3"), "9780854764693")
        self.assertEqual(canonical_isbn("0-8044-2957-X"), "9780804429573")

    def test_rejects_invalid_check_digits_and_unrelated_eans(self):
        for value in ["9780854764694", "0854764691", "1234567890128", "not an ISBN"]:
            with self.assertRaises(ValueError):
                canonical_isbn(value)

    def fixture(self):
        root = Path(__file__).parent
        return (list(read_books(root / "openlibrary-pilot-20.json")),
                json.loads((root / "isbn-pilot-evidence.json").read_text(encoding="utf-8"))["candidates"])

    def test_every_source_candidate_has_a_valid_isbn_and_a_provenance_url(self):
        books, evidence = self.fixture()
        rows = list(review_rows(books, evidence))
        matched = {row["registrationNumber"] for row in rows if row.get("isbn13")}
        self.assertEqual(len(matched), 16)
        self.assertEqual(sum(row["status"] == "NO_ISBN_FOUND" for row in rows), 4)
        self.assertTrue(all(row["physically_confirmed"] == "false" for row in rows))
        self.assertEqual(sum(row["status"] == "REVIEW_BOX_OR_VOLUME" for row in rows), 1)

    def test_rejects_candidates_for_unknown_registers(self):
        books, evidence = self.fixture()
        evidence[0]["registrationNumber"] = "99999"
        with self.assertRaisesRegex(ValueError, "Registo"):
            list(review_rows(books, evidence))

    def test_does_not_merge_different_editions_into_one_isbn_pair(self):
        books, evidence = self.fixture()
        evidence[0]["isbns"] = ["9781630584689", "9781593107031"]
        with self.assertRaisesRegex(ValueError, "edições diferentes"):
            list(review_rows(books, evidence))

    def test_keeps_original_author_instead_of_silently_correcting_it(self):
        books, evidence = self.fixture()
        row = next(row for row in review_rows(books, evidence) if row["registrationNumber"] == "00313")
        self.assertEqual(row["source_author"], "Wayne Gruden")
        self.assertEqual(row["matched_authors"], "Wayne Grudem")


if __name__ == "__main__":
    unittest.main()
