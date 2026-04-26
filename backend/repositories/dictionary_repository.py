from models.database import DatabaseManager


class DictionaryRepository:
    """Persistence boundary for dictionary-adjacent DB lookups."""

    def __init__(self, db: DatabaseManager):
        self.db = db

    def get_word_family_payload(self, word: str) -> dict:
        return {
            "word": word,
            "roots": self.db.get_roots_for_word(word),
            "family": self.db.get_word_family(word),
        }
