class WordFamilyService:
    @staticmethod
    def extract_root_from_word(word):
        """
        Attempt to extract root/affix information.
        This is a placeholder. A real implementation might use a database of etymology.
        """
        # Return empty list as we don't have a local etymology DB yet.
        return []

    @staticmethod
    def parse_roots_text(roots_text):
        """
        Parse raw roots text from dictionary (e.g. "[词根] ag=do, act, 表示'做，代理'")
        Returns list of dicts: {'root': 'ag', 'meaning': 'do, act'}
        """
        results = []
        if not roots_text:
            return results
            
        # Example format: [词根] cede=go(走)
        # Or: 词根：...
        
        try:
            # Remove header
            text = roots_text.replace("[词根]", "").replace("词根", "").strip()
            
            # Simple parsing strategy
            # Split by common delimiters if multiple roots
            parts = text.split("；") 
            
            for part in parts:
                if "=" in part:
                    root, meaning = part.split("=", 1)
                    results.append({
                        "root": root.strip(),
                        "meaning": meaning.strip()
                    })
        except Exception:
            pass
            
        return results
