class TagService:
    @staticmethod
    def get_tags_for_word(word, html_content=""):
        """
        Analyze word and HTML content to extract tags like CET4, CET6, GRE, TOEFL, IELTS.
        """
        tags = []
        
        # Simple keyword matching in HTML content (from Youdao)
        if "CET4" in html_content:
            tags.append("CET4")
        if "CET6" in html_content:
            tags.append("CET6")
        if "KY" in html_content or "考研" in html_content:
            tags.append("考研")
        if "TOEFL" in html_content:
            tags.append("TOEFL")
        if "IELTS" in html_content:
            tags.append("IELTS")
        if "GRE" in html_content:
            tags.append("GRE")
            
        return tags

    @staticmethod
    def format_tags(tags):
        """Format list of tags into a comma-separated string."""
        if not tags:
            return ""
        return ",".join(tags)
