"""Site vitrine multilingue : la page française générée est traduite texte par texte (identifiants stables),
puis chaque langue reçoit son adresse, son en-tête (canonique, hreflang, aperçus), son image d'aperçu et le sélecteur.
Les textes sans traduction restent en français ; tests.py signale tout texte manquant."""
import hashlib, html, json, os, re
from pages import SLUGS

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = 'https://evoly.me'
LANGS = [  # (code, nom dans sa langue, locale Open Graph, locale des nombres)
    ('fr', 'Français', 'fr_FR', 'fr-FR'), ('en', 'English', 'en_GB', 'en-IE'), ('es', 'Español', 'es_ES', 'es-ES'),
    ('de', 'Deutsch', 'de_DE', 'de-DE'), ('it', 'Italiano', 'it_IT', 'it-IT'), ('pt', 'Português', 'pt_PT', 'pt-PT'), ('nl', 'Nederlands', 'nl_NL', 'nl-NL'),
]
X_DEFAULT = 'en'
LEGAL = ['cgu', 'conditions-de-vente', 'privacy', 'cookies', 'legal', 'sous-traitance']
TEXT_ATTRS = ('alt', 'aria-label', 'title', 'placeholder', 'data-toast', 'aria-valuetext', 'value', 'data-eyebrow')
META_TEXT = ('description', 'og:title', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image:alt')
# textes affichés par le script de la page (gabarits {n}, {p}…)
JS = {
    'paidOne': 'Paiement confirmé : le billet est envoyé par e-mail.',
    'paidMany': 'Paiement confirmé : vos {n} billets sont envoyés par e-mail.',
    'calcLive': 'Pour {n} billets à {p} : {free} de commission avec Evoly Free, {pro} avec Evoly Pro abonnement compris. Vous percevez {net}.',
    'calcProSaves': 'Le Pro vous fait économiser {x} à ce volume.',
    'calcProFrom': 'Le Pro devient rentable dès {n} billets à ce prix.',
    'calcFreeBest': 'À ce prix, l’offre Free est la plus avantageuse.',
    'resaleToast': 'Achat simulé : le billet de Thomas est désactivé et celui de Léa a été envoyé par e-mail.',
    'dayJ': 'Jour J', 'dayMinus': 'J-{n}', 'tierPresale': 'Prévente', 'tierNormal': 'Normal', 'tierDay': 'Jour J',
    'yearly': 'Soit 295,80\u202f€ facturés une fois par an', 'monthly': 'Facturé chaque mois',
    'menuOpen': 'Ouvrir le menu',
    'menuClose': 'Fermer le menu',
    'resaleBought': 'Achat simulé',
    'buyOnDay': 'pour un achat le jour J',
    'buyAt': 'pour un achat à {d}',
    'logoTooBig': 'Choisissez une image de moins de 5 Mo.',
    'logoColors': 'Couleurs tirées de votre logo. Ajustez-les si besoin.',
    'logoImported': 'Logo importé. Choisissez vos couleurs ci-dessous.',
    'logoInvalid': 'Ce fichier ne ressemble pas à une image. Essayez un PNG, un JPG ou un SVG.',
    'feedNow': 'à l’instant',
    'feedMin': 'il y a {n} min',
    'feedVip': 'Balcon VIP',
    'feedPit': 'Fosse',
    'feedOne': '1 billet',
    'feedMany': '{n} billets',
}

key = lambda s: hashlib.sha1(s.encode('utf-8')).hexdigest()[:8]
norm = lambda s: ' '.join(html.unescape(s).split())
TOKEN = re.compile(r'(<!--.*?-->|<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>|<[^>]+>)', re.S | re.I)
ATTR = re.compile(r'(\s(%s)=")([^"]*)(")' % '|'.join(map(re.escape, TEXT_ATTRS)))
META = re.compile(r'(<meta (?:name|property)="(%s)" content=")([^"]*)(")' % '|'.join(map(re.escape, META_TEXT)))
translatable = lambda t: bool(t) and any(c.isalpha() for c in t) and not t.startswith(('http', '{', '#'))

def _ld_strings(obj, out):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ('name', 'description', 'text', 'unitText') and isinstance(v, str): out.append(v)
            else: _ld_strings(v, out)
    elif isinstance(obj, list):
        for v in obj: _ld_strings(v, out)

def collect(page):
    """Textes traduisibles de la page, dans l'ordre d'apparition, sans doublon."""
    out = []
    for part in TOKEN.split(page):
        if not part: continue
        if part.lower().startswith('<script') and 'application/ld+json' in part[:80]:
            _ld_strings(json.loads(re.sub(r'^<script[^>]*>|</script>$', '', part)), out)
        elif part.startswith('<!--') or part.lower().startswith(('<script', '<style')):
            continue
        elif part.startswith('<'):
            out += [norm(m.group(3)) for m in ATTR.finditer(part)] + [norm(m.group(3)) for m in META.finditer(part)]
        else:
            out.append(norm(part))
    out += list(JS.values())
    return list(dict.fromkeys(t for t in out if translatable(t)))

def _tr(text, table):
    t = norm(text)
    return table.get(key(t), t) if translatable(t) else t

def _ld_translate(obj, table):
    if isinstance(obj, dict): return {k: (_tr(v, table) if k in ('name', 'description', 'text', 'unitText') and isinstance(v, str) else _ld_translate(v, table)) for k, v in obj.items()}
    if isinstance(obj, list): return [_ld_translate(v, table) for v in obj]
    return obj

# montants et pourcentages isolés (sans lettres, donc hors traduction) : écrits au format de chaque pays
NUM_FMT = {  # (séparateur de milliers, séparateur décimal, gabarit monétaire, espace avant %)
    'en': (',', '.', '€{n}', ''), 'nl': ('.', ',', '€ {n}', ''), 'de': ('.', ',', '{n} €', '\u00a0'),
    'es': ('.', ',', '{n} €', '\u00a0'), 'it': ('.', ',', '{n} €', ''), 'pt': ('\u00a0', ',', '{n} €', ''),
}
MONEY = re.compile(r'(\d{1,3}(?:[\u202f\u00a0 ]\d{3})+|\d+)(?:,(\d{1,2}))?[\u202f\u00a0 ]?€')
PCT = re.compile(r'(\d+)(?:,(\d+))?[\u202f\u00a0 ]?%')

def localize_numbers(text, code):
    if code not in NUM_FMT or any(c.isalpha() for c in text): return text
    thou, dec, money, pct_space = NUM_FMT[code]
    def num(i, d, group=True):
        i = re.sub(r'\D', '', i)
        if group and len(i) > 3 and not (code == 'es' and len(i) == 4): i = f'{int(i):,}'.replace(',', thou)
        return i + (dec + d if d else '')
    text = MONEY.sub(lambda m: money.format(n=num(m.group(1), m.group(2))), text)
    return PCT.sub(lambda m: num(m.group(1), m.group(2), False) + pct_space + '%', text)

def translate(page, table):
    parts = []
    for part in TOKEN.split(page):
        if not part: parts.append(part); continue
        if part.lower().startswith('<script') and 'application/ld+json' in part[:80]:
            head = re.match(r'^<script[^>]*>', part).group(0)
            data = _ld_translate(json.loads(part[len(head):-len('</script>')]), table)
            parts.append(head + json.dumps(data, ensure_ascii=False) + '</script>')
        elif part.startswith('<!--') or part.lower().startswith(('<script', '<style')):
            parts.append(part)
        elif part.startswith('<'):
            part = ATTR.sub(lambda m: m.group(1) + html.escape(_tr(m.group(3), table), quote=True) + m.group(4), part)
            parts.append(META.sub(lambda m: m.group(1) + html.escape(_tr(m.group(3), table), quote=True) + m.group(4), part))
        else:
            lead, trail = re.match(r'^\s*', part).group(0), re.search(r'\s*$', part).group(0)
            t = norm(part)
            if not translatable(t): parts.append(localize_numbers(part, table.get('__lang__', '')) if ('€' in part or '%' in part) else part); continue
            out = table.get(key(t), t)
            # traduction qui commence par une ponctuation (« , que… », « -Marketing ») : pas d'espace devant
            if out[:1] in ',.;:!?)-»”': lead = ''
            parts.append(lead + html.escape(out, quote=False) + trail)
    return ''.join(parts)

def path_of(code, pid='home'):
    if pid == 'home': return '/' if code == 'fr' else f'/{code}/'
    return f'/{SLUGS[pid][code]}/' if code == 'fr' else f'/{code}/{SLUGS[pid][code]}/'

def url_of(code, pid='home'): return SITE + path_of(code, pid)

def file_of(dist, code, pid):
    if pid == 'home': return os.path.join(dist, 'evoly-billetterie.html') if code == 'fr' else os.path.join(dist, code, 'index.html')
    return os.path.join(dist, SLUGS[pid][code], 'index.html') if code == 'fr' else os.path.join(dist, code, SLUGS[pid][code], 'index.html')

def relink(page, code):
    """Liens internes vers la même langue : /plan-de-salle/ → /en/seating-plan/, / et /#tarifs → /en/ et /en/#tarifs."""
    if code == 'fr': return page
    for pid, slugs in SLUGS.items():
        page = page.replace(f'href="/{slugs["fr"]}/', f'href="/{code}/{slugs[code]}/')
    return re.sub(r'href="/(#[\w-]*)?"', lambda m: f'href="/{code}/{m.group(1) or ""}"', page)

def head_for(page, code, og_locale, pid='home'):
    """En-tête propre à la langue : lang, canonique, hreflang, image d'aperçu, données de langue pour le script."""
    alternates = ''.join(f'<link rel="alternate" hreflang="{c}" href="{url_of(c, pid)}">' for c, *_ in LANGS) + f'<link rel="alternate" hreflang="x-default" href="{url_of(X_DEFAULT, pid)}">'
    page = re.sub(r'<html lang="[a-z-]+"', f'<html lang="{code}"', page, count=1)
    page = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{url_of(code, pid)}">' + alternates, page, count=1)
    page = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{url_of(code, pid)}">', page, count=1)
    page = re.sub(r'<meta property="og:locale" content="[^"]*">', f'<meta property="og:locale" content="{og_locale}">' + ''.join(f'<meta property="og:locale:alternate" content="{l}">' for c, _, l, _ in LANGS if c != code), page, count=1)
    page = page.replace(f'{SITE}/og.png', f'{SITE}/og-{code}.png' if code != 'fr' else f'{SITE}/og.png')
    page = page.replace('"inLanguage": "fr"', f'"inLanguage": "{code}"')
    if pid != 'home': page = page.replace(f'{SITE}/{SLUGS[pid]["fr"]}/', url_of(code, pid))   # données structurées
    return page

def switcher(code, label, pid='home'):
    opts = ''.join(f'<option value="{path_of(c, pid)}" lang="{c}"{" selected" if c == code else ""}>{name}</option>' for c, name, *_ in LANGS)
    return f'<label class="lang-switch"><span class="sr-only">{label}</span><select aria-label="{label}" onchange="location.href=this.value">{opts}</select></label>'

def menu_langs(code, label, pid='home'):
    """Langues dans le menu mobile (le sélecteur de l'en-tête y est masqué) : liens directs, faciles à toucher."""
    links = ''.join(f'<a href="{path_of(c, pid)}" hreflang="{c}" lang="{c}"{' aria-current="page"' if c == code else ''}>{name}</a>' for c, name, *_ in LANGS)
    return f'<nav class="menu__langs" aria-label="{label}">{links}</nav>'

def footer_links(code, pid='home'):
    return '<nav class="lang-links" aria-label="Languages">' + ' · '.join(f'<a href="{path_of(c, pid)}" hreflang="{c}" lang="{c}"{" aria-current=\"page\"" if c == code else ""}>{name}</a>' for c, name, *_ in LANGS) + '</nav>'

LANG_CSS = '.lang-switch select{appearance:none;background:transparent;color:inherit;border:1.5px solid currentColor;border-radius:999px;padding:.45em 1.9em .45em .9em;font:inherit;font-size:.85em;cursor:pointer;background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 13px) 55%,calc(100% - 9px) 55%;background-size:4px 4px;background-repeat:no-repeat}.lang-switch select option{color:#222}.lang-links{display:flex;flex-wrap:wrap;justify-content:center;gap:.4em;padding:1.2em 1em 2em;font-size:.85em;opacity:.8}.lang-links a{color:inherit}@media (max-width:760px){.nav__actions .lang-switch{display:none}}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.menu__langs{display:flex;flex-wrap:wrap;gap:8px}.menu__langs a{display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border-radius:999px;border:1.5px solid rgba(255,246,240,.35);color:inherit;text-decoration:none;font-size:.9rem}.menu__langs a[aria-current]{background:var(--rose);border-color:var(--rose);color:var(--charbon);font-weight:600}'

def decorate(page, code, table, pid='home'):
    label = table.get(key('Langue'), 'Langue') if code != 'fr' else 'Langue'
    js = {k: table.get(key(v), v) for k, v in JS.items()} if code != 'fr' else JS
    locale = next(n for c, _, _, n in LANGS if c == code)
    page = page.replace('<a class="nav__login"', switcher(code, label, pid) + '<a class="nav__login"', 1)
    page = page.replace('<div class="menu__foot">', '<div class="menu__foot">' + menu_langs(code, label, pid), 1)
    page = page.replace('</style>', LANG_CSS + '</style>', 1)
    page = page.replace('</body>', footer_links(code, pid) + '</body>', 1)
    return page.replace('<script>\n', f'<script>window.EVOLY_I18N={json.dumps({"locale": locale, "t": js}, ensure_ascii=False)};\n', 1)

def sitemap():
    def group(pid, prio):
        alt = ''.join(f'<xhtml:link rel="alternate" hreflang="{c}" href="{url_of(c, pid)}"/>' for c, *_ in LANGS) + f'<xhtml:link rel="alternate" hreflang="x-default" href="{url_of(X_DEFAULT, pid)}"/>'
        return ''.join(f'  <url><loc>{url_of(c, pid)}</loc>{alt}<priority>{prio}</priority></url>\n' for c, *_ in LANGS)
    body = group('home', '1.0') + ''.join(group(pid, '0.8') for pid in SLUGS)
    legal = ''.join(f'  <url><loc>{SITE}/{p}</loc><priority>0.2</priority></url>\n' for p in LEGAL)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n{body}{legal}</urlset>\n'

def load(code):
    path = os.path.join(HERE, 'i18n', f'{code}.json')
    return json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}

def build_all(pages_fr, dist):
    """Écrit chaque page dans chaque langue (accueil et pages), avec son en-tête, son sélecteur et le sitemap."""
    source = list(dict.fromkeys(t for h in pages_fr.values() for t in collect(h)))
    json.dump({key(t): t for t in source + ['Langue']}, open(os.path.join(HERE, 'i18n', 'source.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    written = {}
    for code, _, og_locale, _ in LANGS:
        table = load(code) if code != 'fr' else {}
        for pid, page_fr in pages_fr.items():
            page = translate(page_fr, {**table, '__lang__': code}) if code != 'fr' else page_fr
            page = decorate(relink(head_for(page, code, og_locale, pid), code), code, table, pid)
            target = file_of(dist, code, pid)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            open(target, 'w', encoding='utf-8').write(page)
        written[code] = sum(1 for t in source if key(t) in table) if code != 'fr' else len(source)
    open(os.path.join(dist, 'sitemap.xml'), 'w', encoding='utf-8').write(sitemap())
    return len(source), written
