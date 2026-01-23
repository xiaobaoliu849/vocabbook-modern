"""
Dictionary Service
词典查询服务
"""
import requests
from bs4 import BeautifulSoup
from datetime import datetime


def get_session():
    """Get a configured requests session"""
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })
    return session


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
    def search_word(word):
        """
        Search word on Youdao.
        Returns a dictionary with word info, or None if not found/error.
        dict keys: word, phonetic, meaning, example, date
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

                # Parse Tags (simplified)
                tags = ""

                return {
                    "word": word,
                    "phonetic": phonetic,
                    "meaning": meaning,
                    "example": example,
                    "roots": roots,
                    "synonyms": synonyms,
                    "tags": tags,
                    "date": datetime.now().strftime('%Y-%m-%d'),
                }
        except Exception as e:
            print(f"Search error: {e}")
        return None
