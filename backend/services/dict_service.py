import requests
from bs4 import BeautifulSoup
from datetime import datetime

from .tag_service import TagService
from .word_family_service import WordFamilyService
from .multi_dict_service import get_session, MultiDictService


class DictService:
    @staticmethod
    def translate_text(text):
        """Translate English text to Chinese using Youdao mobile site."""
        try:
            url = "http://m.youdao.com/translate"
            data = {"inputtext": text, "type": "AUTO"}
            session = get_session()
            r = session.post(url, data=data, timeout=5)
            soup = BeautifulSoup(r.text, 'html.parser')

            res_ul = soup.find('ul', id='translateResult')
            if res_ul:
                tgt = res_ul.find('li')
                if tgt:
                    return tgt.get_text().strip()

            generate_div = soup.find('div', class_='generate')
            if generate_div:
                return generate_div.get_text().strip()
        except Exception as e:
            print(f"Translation error: {e}")
        return None

    @staticmethod
    def search_word(word, sources=None):
        """
        Search word on Youdao and optionally other dictionaries.
        Returns a dictionary structure compatible with old format but enriched.
        """
        
        # 1. First, search Youdao as base (because it's the primary source for most parsing logic)
        youdao_result = DictService._search_youdao_base(word)
        
        # 2. If multi-source search is requested (or default behavior)
        if sources is None:
            # Default sources logic could be here, but for now we trust the caller 
            # or default to just Youdao if sources is empty/None to save time?
            # Actually, let's default to ALL if not specified, to match user request "richer"
            # But normally we might want to make it configurable. 
            # For backward compatibility with existing frontend call (search_word(word)),
            # let's just return Youdao unless specifically asked for more?
            # No, user wants optimization. Let's do aggregate search.
            pass

        # Perform aggregate search
        # If youdao search failed, we still might want to try others?
        # But our aggregate_search logic takes youdao_result as input.
        
        aggregated = MultiDictService.aggregate_search(word, enabled_dicts=sources, youdao_result=youdao_result)
        
        if not aggregated['primary']:
            return None
            
        # Merge best info into primary result
        primary = aggregated['primary']
        
        # Enrich phonetic if missing or better available
        best_phonetic = MultiDictService.get_best_phonetic(aggregated['sources'])
        if best_phonetic and (not primary.get('phonetic') or len(best_phonetic) > len(primary.get('phonetic', ''))):
             primary['phonetic'] = best_phonetic

        # Enrich examples (merge all)
        all_examples = MultiDictService.get_all_examples(aggregated['sources'])
        if all_examples:
            primary['example'] = all_examples
            
        # Add the full sources data to the result so frontend can display tabs
        primary['sources_data'] = aggregated['sources']
        
        return primary

    @staticmethod
    def _search_youdao_base(word):
        """
        Original Youdao search logic to parse specific fields like roots, tags, etc.
        """
        try:
            url = f"https://dict.youdao.com/w/eng/{word}"
            session = get_session()
            resp = session.get(url, timeout=10)

            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, 'html.parser')
                if soup.find('div', class_='error-wrapper'):
                    return None

                phonetic = ""
                phs = soup.find_all('span', class_='phonetic')
                if phs and len(phs) > 0:
                    try:
                        phonetic = phs[1].get_text() if len(phs) > 1 else phs[0].get_text()
                    except (IndexError, AttributeError):
                        phonetic = ""

                meaning = ""
                trans = soup.find('div', class_='trans-container')
                if trans:
                    ul = trans.find('ul')
                    if ul:
                        try:
                            meaning = "\n".join([li.get_text() for li in ul.find_all('li') if not li.get('class')])
                        except (AttributeError, TypeError):
                            meaning = ""
                if not meaning:
                    meaning = "暂无释义"

                example = ""
                bi = soup.find('div', id='bilingual')
                if bi:
                    li_elem = bi.find('li')
                    if li_elem:
                        p = li_elem.find_all('p')
                        if p and len(p) >= 2:
                            try:
                                example = f"{p[0].get_text(separator=' ', strip=True)}\n{p[1].get_text(separator=' ', strip=True)}"
                            except (IndexError, AttributeError):
                                example = ""

                # Parse Roots
                roots = ""
                root_marker = soup.find(string=lambda t: "词根" in t if t else False)
                if root_marker:
                    root_container = root_marker.find_parent('div')
                    if root_container:
                        raw_root = root_container.get_text(separator=' ', strip=True)
                        roots = raw_root.replace("词根", "[词根]").replace("  ", " ").strip()

                if not roots:
                    rel = soup.find('div', id='relWordTab')
                    if rel:
                        roots = rel.get_text(separator=' ', strip=True)

                # Parse Synonyms
                synonyms = ""
                syn_div = soup.find('div', id='synonyms')
                if syn_div:
                    synonyms = syn_div.get_text(separator=' ', strip=True)
                if not synonyms:
                    syn_marker = soup.find(string=lambda t: "同近义词" in t if t else False)
                    if syn_marker:
                        syn_container = syn_marker.find_parent('div')
                        if syn_container:
                            synonyms = syn_container.get_text(separator=' ', strip=True)

                # Parse Tags (CET4, GRE, etc.)
                tags = TagService.get_tags_for_word(word, resp.text)

                # Extract word family information
                word_families = WordFamilyService.extract_root_from_word(word)
                if roots:
                    parsed_roots = WordFamilyService.parse_roots_text(roots)
                    existing_roots = {f['root'] for f in word_families}
                    for pr in parsed_roots:
                        if pr['root'] not in existing_roots:
                            word_families.append(pr)

                return {
                    "word": word,
                    "phonetic": phonetic,
                    "meaning": meaning,
                    "example": example,
                    "roots": roots,
                    "synonyms": synonyms,
                    "tags": TagService.format_tags(tags),
                    "word_families": word_families,
                    "date": datetime.now().strftime('%Y-%m-%d'),
                }
        except Exception as e:
            print(f"Search error: {e}")
        return None