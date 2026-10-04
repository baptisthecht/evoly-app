"""Contrôle du site vitrine multilingue (après python3 build.py) : chaque langue complète et bien reliée aux autres."""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import i18n
from pages import SLUGS

def check():
    errors = []
    source = json.load(open(os.path.join(HERE, 'i18n', 'source.json'), encoding='utf-8'))
    for code, name, og_locale, _ in i18n.LANGS:
      for pid in ['home', *SLUGS]:
        path = i18n.file_of(os.path.join(HERE, 'dist'), code, pid)
        page = open(path, encoding='utf-8').read()
        if code != 'fr' and pid == 'home':
            table = i18n.load(code)
            missing = [k for k in source if k not in table]
            if missing: errors.append(f'{code} : {len(missing)} textes sans traduction ({missing[:5]})')
        if f'<html lang="{code}"' not in page: errors.append(f'{code} : attribut lang')
        if f'<link rel="canonical" href="{i18n.url_of(code, pid)}">' not in page: errors.append(f'{code}/{pid} : canonique')
        if len(re.findall(r'<link rel="alternate" hreflang="[a-z-]+"', page)) != len(i18n.LANGS) + 1: errors.append(f'{code} : hreflang')
        if f'<meta property="og:locale" content="{og_locale}">' not in page: errors.append(f'{code} : og:locale')
        img = 'og.png' if code == 'fr' else f'og-{code}.png'
        if f'https://evoly.me/{img}' not in page or not os.path.exists(os.path.join(HERE, 'dist', img)): errors.append(f'{code} : image d’aperçu {img}')
        if not re.search(r'<option value="[^"]+" lang="%s" selected>' % code, page): errors.append(f'{code} : sélecteur de langue')
        json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', page, re.S).group(1))
    sitemap = open(os.path.join(HERE, 'dist', 'sitemap.xml'), encoding='utf-8').read()
    if sitemap.count('<loc>') != (1 + len(SLUGS)) * len(i18n.LANGS) + len(i18n.LEGAL): errors.append('sitemap : nombre de pages')
    # liens internes vers la bonne langue (hors sélecteur de langue et liens entre versions, qui mènent exprès aux autres langues)
    strip = lambda h: re.sub(r'<nav class="lang-links".*?</nav>|<select.*?</select>', '', h, flags=re.S)
    for code in [c for c, *_ in i18n.LANGS if c != 'fr']:
        for pid in ['home', *SLUGS]:
            body = strip(open(i18n.file_of(os.path.join(HERE, 'dist'), code, pid), encoding='utf-8').read())
            if any(f'href="/{SLUGS[x]["fr"]}/' in body for x in SLUGS): errors.append(f'{code}/{pid} : lien interne vers une page française')
            if re.search(r'<use[^>]*href="/', body): errors.append(f'{code}/{pid} : icône cassée')
    return errors

if __name__ == '__main__':
    errs = check()
    print('\n'.join(errs) if errs else f'site vitrine : {1 + len(SLUGS)} pages × {len(i18n.LANGS)} langues, complètes et reliées')
    sys.exit(1 if errs else 0)
