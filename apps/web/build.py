"""Evoly, landing organisateurs : assemble la page à partir des sources.

  python3 build.py          -> dist/evoly-billetterie.html (Google Fonts + jsDelivr)
  python3 build.py --test   -> test.html hors ligne (polices/libs locales : EVOLY_FONTS, EVOLY_LIBS)
"""
import math, random, base64, sys, os, re, html as H

HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'paths.py'), encoding='utf-8').read())  # E, V, L, Y, OLOGO, LIVE, O
TEST = '--test' in sys.argv

REGISTER = 'https://app.evoly.me/register'
REGISTER_PRO = 'https://app.evoly.me/register?plan=pro'
LOGIN = 'https://app.evoly.me/login'
EXT = 'target="_blank" rel="noopener"'


def num(v):
    v = round(v, 2)
    return str(int(v)) if v == int(v) else ('%.2f' % v).rstrip('0').rstrip('.')


O_SEGS = [s.strip() + ' Z' for s in O.split('Z') if s.strip()]
CHADS = ''.join('<path d="%s"/>' % s for s in O_SEGS)
SPARK = 'M50 0C54 36 64 46 100 50C64 54 54 64 50 100C46 64 36 54 0 50C36 46 46 36 50 0Z'
BLOB = 'M28 26C46 6 74 22 58 42C44 58 22 52 30 70C38 88 68 86 78 66'


def spiral(turns=3.05, r0=3.5, r1=40, spt=40, a0=-1.2):
    n = int(turns * spt); pts = []
    for i in range(n + 1):
        t = i / n; th = a0 + t * turns * 2 * math.pi; r = r0 + (r1 - r0) * t
        pts.append((r * math.cos(th), r * math.sin(th)))
    d = 'M%s %s' % (num(pts[0][0]), num(pts[0][1]))
    for i in range(len(pts) - 1):
        p0 = pts[i - 1] if i > 0 else pts[i]; p1 = pts[i]; p2 = pts[i + 1]
        p3 = pts[i + 2] if i + 2 < len(pts) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += 'C%s %s %s %s %s %s' % tuple(num(v) for v in (*c1, *c2, *p2))
    return d


SPIRAL = spiral()


def barcode(seed, x, y, w, h, fill='#222222'):
    rnd = random.Random(seed); bars = []; pos = 0
    while pos < 96:
        bw = rnd.choice([1, 1, 1, 2, 2, 3, 4]); gap = rnd.choice([1, 1, 2, 2, 3])
        bars.append((pos, bw)); pos += bw + gap
    k = w / pos
    rects = ''.join('<rect x="%s" y="%s" width="%s" height="%s"/>' % (num(x + p * k), num(y), num(b * k), num(h)) for p, b in bars)
    return '<g fill="%s">%s</g>' % (fill, rects)


def qr(seed, n=21):
    rnd = random.Random(seed)
    g = [[None] * n for _ in range(n)]
    for fx, fy in ((0, 0), (n - 7, 0), (0, n - 7)):
        for i in range(7):
            for j in range(7):
                g[fy + j][fx + i] = (i in (0, 6) or j in (0, 6)) or (2 <= i <= 4 and 2 <= j <= 4)
    for r in range(n):
        for c in range(n):
            if g[r][c] is None:
                near = (r < 8 and c < 8) or (r < 8 and c >= n - 8) or (r >= n - 8 and c < 8)
                g[r][c] = False if near else rnd.random() < .48
    rects = ''.join('<rect x="%d" y="%d" width="1" height="1"/>' % (c, r) for r in range(n) for c in range(n) if g[r][c])
    return '<svg viewBox="0 0 %d %d" shape-rendering="crispEdges" aria-hidden="true"><g fill="#222222">%s</g></svg>' % (n, n, rects)


def icon(sid, w, h, cls='', style=''):
    c = f' class="{cls}"' if cls else ''
    s = f' style="{style}"' if style else ''
    return f'<svg{c}{s} viewBox="0 0 {w} {h}" aria-hidden="true" focusable="false"><use href="#{sid}" width="{w}" height="{h}"/></svg>'


def b64svg(svg):
    return 'url("data:image/svg+xml;base64,%s")' % base64.b64encode(svg.encode()).decode()


def wave_tile(color):
    rows = ''.join(f"<path d='M-400 {y} Q-300 {y-70} -200 {y} T0 {y} T200 {y} T400 {y} T600 {y}'/>" for y in (-55, 55, 165))
    return b64svg(f"<svg xmlns='http://www.w3.org/2000/svg' width='400' height='110' viewBox='0 0 400 110'><g fill='none' stroke='{color}' stroke-width='46' stroke-linecap='round'>{rows}</g></svg>")


NOISE = b64svg("<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .95 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>")

CHECK = icon('i-check', 24, 24)

# ------------------------------------------------------------------ sprite
SPRITE = f'''<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<symbol id="logo" viewBox="10 4 380 286"><g fill="currentColor"><path d="{LIVE}"/><path d="{E}"/><path d="{V}"/><path d="{OLOGO}"/><path d="{L}"/><path d="{Y}"/></g></symbol>
<symbol id="i-o" viewBox="-50 -50 100 100"><path fill="currentColor" d="{O}"/></symbol>
<symbol id="i-spark" viewBox="0 0 100 100"><path fill="currentColor" d="{SPARK}"/></symbol>
<symbol id="i-blob" viewBox="0 0 100 100"><path d="{BLOB}" fill="none" stroke="currentColor" stroke-width="21" stroke-linecap="round" stroke-linejoin="round"/><g fill="currentColor"><circle cx="26" cy="27" r="13"/><circle cx="80" cy="66" r="14"/><circle cx="62" cy="18" r="9"/></g></symbol>
<symbol id="st-blob" viewBox="-7 -9 114 112"><path d="{BLOB}" fill="none" stroke="#fff" stroke-width="35" stroke-linecap="round" stroke-linejoin="round"/><g fill="#fff"><circle cx="26" cy="27" r="20"/><circle cx="80" cy="66" r="21"/><circle cx="62" cy="18" r="16"/></g><path d="{BLOB}" fill="none" stroke="currentColor" stroke-width="21" stroke-linecap="round" stroke-linejoin="round"/><g fill="currentColor"><circle cx="26" cy="27" r="13"/><circle cx="80" cy="66" r="14"/><circle cx="62" cy="18" r="9"/></g></symbol>
<symbol id="st-spark" viewBox="-10 -10 120 120"><path d="{SPARK}" fill="#fff" stroke="#fff" stroke-width="16" stroke-linejoin="round"/><path d="{SPARK}" fill="currentColor"/></symbol>
<symbol id="st-o" viewBox="-60 -60 120 120"><circle r="58" fill="#fff"/><path fill="currentColor" d="{O}"/></symbol>
<symbol id="i-spiral" viewBox="-50 -50 100 100"><path d="{SPIRAL}" fill="none" stroke="currentColor" stroke-width="8.5" stroke-linecap="round"/></symbol>
<symbol id="i-ticket" viewBox="0 0 120 72"><path d="M12 4H108A8 8 0 0 1 116 12V26A10 10 0 0 0 116 46V60A8 8 0 0 1 108 68H12A8 8 0 0 1 4 60V46A10 10 0 0 0 4 26V12A8 8 0 0 1 12 4Z" fill="none" stroke="currentColor" stroke-width="6"/><path d="M20 22H66M20 36H58M20 50H50" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M87 13V59" stroke="currentColor" stroke-width="5" stroke-dasharray="5 6"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-left" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-right" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-link" viewBox="0 0 24 24"><path d="M10.5 13.5a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1 1M13.5 10.5a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1-1" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></symbol>
<symbol id="i-mail" viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M4.5 7.5l7.5 5.6 7.5-5.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2"/></symbol>
<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></symbol>
<symbol id="i-upload" viewBox="0 0 24 24"><path d="M12 15.5V4.5M7.5 9L12 4.5 16.5 9M4.5 15.5v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-minus" viewBox="0 0 24 24"><path d="M6 12h12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></symbol>
<symbol id="i-phone" viewBox="0 0 24 24"><rect x="6.5" y="2.5" width="11" height="19" rx="2.8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.5 18.2h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
<symbol id="i-card" viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="2.8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2.5 9.6h19M6 15h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
<symbol id="i-bank" viewBox="0 0 24 24"><path d="M3.5 9.5L12 4.5l8.5 5M5.5 10.5v6.5M10 10.5v6.5M14 10.5v6.5M18.5 10.5v6.5M3.5 20h17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.01" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></symbol>
</defs></svg>'''

# ------------------------------------------------------------------ billets (hero + revente)
HX, HY, HS = 556, 88, .76


def ticket(pid, *, title_text, fill='#FFF6F0', ink='#222222', label='EVOLY · BILLET', lines=('NUIT', 'ÉLECTRIQUE'),
           meta='SAM. 14 NOV · 21:00 · HALL 7, PARIS', serial='N° 000742', blob='#FFB8E8', target='composte ici',
           stamp=('COMPOSTÉ', 'sam. 14 nov., 21:04'), stamp_bg='#FFB8E8', stamp_ink='#222222', holeable=True):
    hole = (f'<g class="t-hole" data-at="translate({HX} {HY})" transform="translate({HX} {HY}) scale(0)">'
            f'<path fill="#000" transform="scale({HS})" d="{O}"/></g>') if holeable else ''
    tgt = (f'<g class="t-target"><circle cx="{HX}" cy="{HY}" r="41" fill="none" stroke="{ink}" stroke-width="2" stroke-dasharray="3 6" stroke-linecap="round" opacity=".6"/>'
           f'<text class="tk-small" x="{HX}" y="153" text-anchor="middle">{target}</text></g>') if target else ''
    stp = (f'<g transform="translate({HX} 152) rotate(-6)"><g class="t-stamp"><rect x="-66" y="-22" width="132" height="44" rx="10" fill="{stamp_bg}"/>'
           f'<text class="tk-stamp-t" y="1" text-anchor="middle" style="fill:{stamp_ink}">{stamp[0]}</text>'
           f'<text class="tk-stamp-s" y="15" text-anchor="middle" style="fill:{stamp_ink}">{stamp[1]}</text></g></g>') if stamp else ''
    chads = f'<g class="t-chads" transform="translate({HX} {HY}) scale({HS})" fill="{fill}">{CHADS}</g>' if holeable else ''
    return f'''<svg class="tk__svg" viewBox="0 0 640 280" role="img" aria-labelledby="{pid}-t">
<title id="{pid}-t">{title_text}</title>
<defs><mask id="{pid}-mask" maskUnits="userSpaceOnUse" x="-20" y="-20" width="680" height="320">
<rect x="-20" y="-20" width="680" height="320" fill="#fff"/>
<circle cx="470" cy="0" r="16" fill="#000"/><circle cx="470" cy="280" r="16" fill="#000"/>{hole}
</mask></defs>
<rect width="640" height="280" rx="22" fill="{fill}" mask="url(#{pid}-mask)"/>
<use href="#i-spark" x="40" y="38" width="18" height="18" style="color:{ink}"/>
<text class="tk-label" x="66" y="53">{label}</text>
<text class="tk-title" x="36" y="126">{lines[0]}</text>
<text class="tk-title" x="36" y="184">{lines[1]}</text>
<text class="tk-meta" x="40" y="236">{meta}</text>
<use href="#i-blob" x="344" y="16" width="108" height="108" style="color:{blob}"/>
<line x1="470" y1="28" x2="470" y2="252" stroke="{ink}" stroke-width="3" stroke-dasharray="7 8" stroke-linecap="round"/>
{tgt}
{barcode(pid + '-bc', 511, 178, 90, 60, ink)}
<text class="tk-serial" x="{HX}" y="258" text-anchor="middle">{serial}</text>
<text class="tk-admit" transform="translate(624 140) rotate(90)" text-anchor="middle">ADMIT ONE</text>
{stp}
{chads}
</svg>'''


BUY_TICKET = ticket('buyt', title_text='Votre billet pour Nuit Électrique', target='billet valide', stamp=None, holeable=False)
OLD_TICKET = ticket('rso', title_text='Billet de Thomas pour Nuit Électrique, fosse', label='BILLET DE THOMAS',
                    meta='SAM. 14 NOV · 21:00 · FOSSE', serial='N° 000318', target='billet valide',
                    stamp=('DÉSACTIVÉ', 'revendu à 21:42'), stamp_bg='#222222', stamp_ink='#FFF6F0')
NEW_TICKET = ticket('rsn', title_text='Nouveau billet de Léa pour Nuit Électrique, fosse', fill='#FFB8E8', label='BILLET DE LÉA',
                    meta='SAM. 14 NOV · 21:00 · FOSSE', serial='N° 000913', blob='#222222', target='billet valide',
                    stamp=None, holeable=False)

# ------------------------------------------------------------------ page événement (rail)
DEMO_BUY = 'Démo : vos participants réservent en deux taps, frais affichés avant paiement.'
DEMO_RS = 'Démo : paiement par carte, l’ancien billet est désactivé et le nouveau part par e-mail.'
TICKETS = [
    dict(title='Prévente', tag='prévente', tags='tarif', meta=[('lieu', 'Hall 7, Paris'), ('accès', 'Fosse')], price='18 €', left='Tarif de lancement', tone='creme', cta=('Épuisé', None), st=('st-o', 120, 120, '--s:60px;--r:18deg;top:58px;right:-14px;color:#222222')),
    dict(title='Fosse', tag='tarif', tags='tarif', meta=[('lieu', 'Hall 7, Paris'), ('accès', 'Fosse')], price='24 €', left='Plus que 38 places', tone='lilas', cta=('Réserver', DEMO_BUY), st=None),
    dict(title='Balcon VIP', tag='tarif', tags='tarif', meta=[('lieu', 'Hall 7, Paris'), ('accès', 'Balcon, vestiaire inclus')], price='45 €', left='Plus que 12 places', tone='bulle', cta=('Réserver', DEMO_BUY), st=None),
    dict(title='Fosse', tag='revente', tags='revente', meta=[('vendu par', 'un participant'), ('accès', 'Fosse')], price='24 €', left='Revente sécurisée', tone='creme', cta=('Acheter', DEMO_RS), st=('st-spark', 120, 120, '--s:60px;--r:-10deg;top:58px;right:-14px;color:#FFB8E8')),
    dict(title='Balcon VIP', tag='revente', tags='revente', meta=[('vendu par', 'un participant'), ('accès', 'Balcon, vestiaire inclus')], price='45 €', left='Revente sécurisée', tone='lilas', cta=('Acheter', DEMO_RS), st=None),
    dict(title='Fosse', tag='revente', tags='revente', meta=[('vendu par', 'un participant'), ('accès', 'Fosse')], price='24 €', left='Revente sécurisée', tone='bulle', cta=('Acheter', DEMO_RS), st=None),
]
cards = []
for i, t in enumerate(TICKETS):
    st = ''
    if t['st']:
        sid, w, h, style = t['st']
        st = f'<span class="diecut" style="{style}">{icon(sid, w, h)}</span>'
    meta = ''.join(f'<dt>{k}</dt><dd>{v}</dd>' for k, v in t['meta'])
    label, msg = t['cta']
    if msg:
        cta = f'<button class="btn tcard__cta" type="button" data-toast="{H.escape(msg)}">{label}</button>'
    else:
        cta = f'<button class="btn tcard__cta is-soldout" type="button" disabled>{label}</button>'
    tagcls = 'tag tag--rs' if t['tag'] == 'revente' else 'tag'
    cards.append(f'''<article class="tcard tcard--{t['tone']}" data-tags="{t['tags']}" aria-label="{t['title']}, {t['tag']}, {t['price']}">
{st}<div class="tcard__main">
<div class="tcard__top"><span class="{tagcls}">{t['tag']}</span><span class="tcard__date"><b>14</b><span>nov.<br>sam.</span></span></div>
<h4 class="tcard__title">{t['title']}</h4>
<dl class="tcard__meta">{meta}</dl>
</div>
<div class="tcard__perf" aria-hidden="true"><i></i></div>
<div class="tcard__stub">
<p class="tcard__price">{t['price']}</p>
<p class="tcard__left">{t['left']}</p>
<svg class="tcard__bar" viewBox="0 0 64 40" aria-hidden="true">{barcode('ev%d' % i, 0, 0, 64, 40)}</svg>
{cta}
</div>
</article>''')
CARDS = '\n'.join(cards)

# ------------------------------------------------------------------ paliers (prix dynamiques)
TIERS = [
    ('PRÉVENTE', '18 €', 'JUSQU’À J-15', '#FFF6F0', 'PALIER 1'),
    ('NORMAL', '24 €', 'DE J-14 À J-1', '#FBE3F5', 'PALIER 2'),
    ('JOUR J', '29 €', 'SAM. 14 NOV.', '#FFB8E8', 'PALIER 3'),
]
tiers_html = []
mid = (len(TIERS) - 1) / 2
for i, (l1, l2, period, bg, stamp) in enumerate(TIERS):
    x = (i - mid) * 60; y = abs(i - mid) * 14; r = (i - mid) * 10
    cls = 'stack__pos is-on' if i == 0 else 'stack__pos is-off'
    tiers_html.append(f'''<div class="{cls}"><div class="stack__t" style="--x:{num(x)}px;--y:{num(y)}px;--rot:{num(r)}deg">
<svg viewBox="0 0 420 190" aria-hidden="true">
<defs><mask id="tr-m{i}" maskUnits="userSpaceOnUse" x="0" y="0" width="420" height="190"><rect width="420" height="190" fill="#fff"/><circle cx="300" cy="0" r="12" fill="#000"/><circle cx="300" cy="190" r="12" fill="#000"/><path fill="#000" transform="translate(360 72) scale(.46)" d="{O}"/></mask></defs>
<rect width="420" height="190" rx="16" fill="{bg}" mask="url(#tr-m{i})"/>
<use href="#i-spark" x="22" y="22" width="12" height="12" style="color:#222222"/>
<text class="mt-label" x="40" y="32">NUIT ÉLECTRIQUE</text>
<text class="mt-title" x="20" y="86">{l1}</text>
<text class="mt-title mt-price" x="20" y="130">{l2}</text>
<text class="mt-meta" x="22" y="166">{period}</text>
<line x1="300" y1="18" x2="300" y2="172" stroke="#222222" stroke-width="2" stroke-dasharray="6 6" stroke-linecap="round"/>
<text class="mt-stamp" x="360" y="126" text-anchor="middle">{stamp}</text>
{barcode('tier%d' % i, 322, 138, 76, 30)}
</svg></div></div>''')
TIERS_HTML = '\n'.join(tiers_html)

# ------------------------------------------------------------------ comparatif
YES = f'<span class="yes">{CHECK}<span class="vh">Oui</span></span>'
NO = '<span class="no"><span aria-hidden="true">—</span><span class="vh">Non</span></span>'
ROWS = [
    ('Frais sur un billet à 30 €, carte comprise', '1,30 €', '1,30 €', '1,36 € en moyenne'),
    ('Commission de 1 € maximum par billet', '1 € maximum', '0,70 € maximum', 'Rare'),
    ('Revente intégrée, sans passer par un site tiers', YES, YES, 'Rare'),
    ('Prix affiché sans frais ajoutés à l’acheteur', YES, YES, 'Une partie'),
    ('Billets gratuits sans commission ni limite', YES, YES, 'Fréquent'),
    ('E-mails automatiques et campagnes intégrés', NO, YES, 'Fréquent'),
]
TROWS = ''.join(f'<tr><th scope="row">{a}</th><td>{b}</td><td class="p">{c}</td><td class="eb">{d}</td></tr>' for a, b, c, d in ROWS)

# ------------------------------------------------------------------ offres
def plan_items(items):
    out = []
    for it in items:
        txt, new = (it, False) if isinstance(it, str) else it
        tag = '<span class="new">nouveau</span>' if new else ''
        out.append(f'<li>{CHECK}<span>{txt}{tag}</span></li>')
    return ''.join(out)


FREE_LIST = plan_items(['0 % sur les billets gratuits, sans limite', '0,15 € + 1,5 % par billet payant, 1 € maximum', 'Frais bancaires au coût réel, sans marge',
                        'Frais inclus dans votre prix : rien n’est ajouté à l’acheteur', ('Revente sécurisée entre participants', True),
                        'Statistiques en direct', 'Sous-domaine Evoly inclus', 'Check-in QR inclus', 'E-mails transactionnels'])
PRO_LIST = plan_items(['Tout le plan Free', 'Commission plafonnée à 0,70 € par billet', ('Prix dynamiques', True), 'E-mail marketing et automatisations',
                       'Domaine personnalisé avec SSL', 'Vos couleurs et votre logo', 'Sous-domaines dédiés par événement', 'Multi-orgs et rôles', 'Sans branding Evoly'])

# ------------------------------------------------------------------ FAQ (brouillon à valider)
FAQ = [
    ('Comment fonctionne la commission ?', 'Evoly prend 0,15 € + 1,5 % par billet payant, jamais plus de 1 € par billet en Free et 0,70 € en Pro. Les frais bancaires de Stripe s’ajoutent au coût réel, sans marge. Tout est inclus dans le prix de vos billets et déduit automatiquement de vos ventes : vos participants paient le prix affiché, sans frais ajoutés. Les billets gratuits restent à 0 %.'),
    ('Les billets gratuits sont-ils vraiment sans commission ?', 'Oui. 0 % sur les billets à 0 €, toujours et sans limite de volume, dans les deux offres. Aucun don pré-coché n’est ajouté au panier de vos participants.'),
    ('Quels moyens de paiement acceptez-vous ?', 'Apple Pay, Google Pay, Visa, Mastercard, American Express, PayPal, Klarna et les moyens de paiement locaux comme Bancontact, iDEAL | Wero, Cartes Bancaires, TWINT, BLIK ou Swish. Les paiements passent par Stripe, et les frais bancaires vous sont facturés au coût réel.'),
    ('Comment fonctionne la revente de billets ?', 'Un participant qui ne peut plus venir génère un lien de revente et le publie où il veut, sans rien d’autre à faire. Sa place apparaît aussi dans la section « Revente » de votre page de vente. Le premier acheteur paie en un tap : l’ancien billet est désactivé immédiatement et le nouveau lui est envoyé par e-mail. La revente est incluse dans toutes les offres.'),
    ('Comment fonctionnent les prix dynamiques ?', 'Avec l’offre Pro, vous définissez des paliers de prix, par exemple une prévente, un tarif normal et un tarif jour J. Le prix change automatiquement selon la date ou selon d’autres critères, sans que vous ayez à intervenir.'),
    ('Qu’est-ce que l’offre Pro change ?', 'Des fonctionnalités en plus : prix dynamiques, e-mail marketing et automatisations, domaine personnalisé, vos couleurs et votre logo, multi-organisations et rôles, sans branding Evoly. Et une commission plafonnée à 0,70 € par billet, au lieu de 1 € en Free.'),
    ('Quand est-ce que je reçois mon argent ?', 'Les paiements passent par Stripe. Les recettes de vos ventes sont versées sur votre compte bancaire via votre compte Stripe, selon son calendrier de versement.'),
    ('Comment fonctionne l’essai Pro 14 jours ?', 'Vous accédez à toutes les fonctionnalités Pro pendant 14 jours. Une carte bancaire est demandée au démarrage. Sans résiliation avant la fin de l’essai, l’abonnement passe à 29 € par mois.'),
    ('Puis-je annuler à tout moment ?', 'Oui. L’offre Free est gratuite et sans engagement, et l’offre Pro se résilie quand vous voulez depuis votre espace. Vous repassez alors sur l’offre Free.'),
    ('Comment configurer mon domaine custom ?', 'Avec l’offre Pro, ajoutez votre domaine (par exemple tickets.monsite.com) depuis votre espace, puis faites-le pointer vers Evoly chez votre fournisseur de nom de domaine. Le certificat SSL est activé automatiquement.'),
    ('Comment fonctionne le check-in QR ?', 'Chaque billet porte un QR code. Le jour J, vous scannez les entrées avec le scanner intégré, installable sur mobile, avec un retour haptique à chaque scan. Vos bénévoles reçoivent un lien temporaire et scannent sans créer de compte. La saisie manuelle et les statistiques sont incluses.'),
    ('Que se passe-t-il si j’annule un événement ?', 'Vous annulez depuis votre espace et vos participants sont prévenus par e-mail. Les billets payés sont remboursés via Stripe.'),
    ('Quelle différence avec HelloAsso ?', 'HelloAsso est réservé aux associations et se finance grâce à une contribution volontaire proposée à vos participants au moment du paiement. Evoly s’adresse à tous les organisateurs, partout, avec une commission simple, plafonnée à 1 € par billet et incluse dans le prix.'),
    ('Evoly est-il conforme au RGPD ?', 'Oui. Les données sont hébergées dans l’Union européenne et traitées conformément au RGPD. Les paiements sont gérés par Stripe.'),
]
FAQ_HTML = ''.join(f'<details class="qa"><summary><span>{q}</span><span class="qa__plus" aria-hidden="true">{icon("i-plus", 24, 24)}</span></summary><div class="qa__a"><p>{a}</p></div></details>' for q, a in FAQ)

# ------------------------------------------------------------------ divers
BAND_ITEMS = ['ZÉRO SURPRISE.', 'APPLE PAY ET GOOGLE PAY.', 'REVENTE EN UN LIEN.', 'JAMAIS PLUS DE 1 € PAR BILLET.', 'STATS EN DIRECT.', '0 % SUR LES BILLETS GRATUITS.']

PMS = [('Apple Pay', 'i-phone', '', -3), ('Google Pay', 'i-phone', '', 2), ('Visa', 'i-card', '', -2), ('Mastercard', 'i-card', '', 3),
       ('American Express', 'i-card', '', -1), ('PayPal', 'i-phone', '', 2), ('Klarna', 'i-clock', '', -3), ('Bancontact', 'i-card', '', 1),
       ('iDEAL | Wero', 'i-bank', '', -2), ('Cartes Bancaires', 'i-card', '', 3), ('Revolut Pay', 'i-phone', '', -1),
       ('TWINT', 'i-phone', '', 2), ('BLIK', 'i-phone', '', -3), ('Swish', 'i-phone', '', 1)]
PAYWALL = ''.join('<li class="pm%s" style="--r:%sdeg"><span class="pm__in">%s%s</span></li>' % ((' pm--' + k) if k else '', r, icon(ic, 24, 24), H.escape(n)) for n, ic, k, r in PMS)

SW = [('Rose', '#FFB8E8', '#222222'), ('Corail', '#FF6B4A', '#222222'), ('Bleu', '#3D5AFE', '#FFFFFF'), ('Vert', '#0B7A50', '#FFFFFF'), ('Jaune', '#FFD23F', '#222222')]
SWATCHES = ''.join('<button type="button" data-c="%s" data-ink="%s" aria-pressed="%s" style="--c:%s"><span class="vh">%s</span></button>' % (c, ink, 'true' if i == 0 else 'false', c, n) for i, (n, c, ink) in enumerate(SW))

MAILS = [
    ('J-7', 'Plus qu’une semaine avant la Nuit Électrique', 'Votre billet vous attend. Il reste quelques places en fosse : c’est le moment d’inviter vos amis.', 'Voir mon billet', 'Envoi automatique, 7 jours avant'),
    ('J-1', 'C’est demain : votre billet est prêt', 'Les portes ouvrent à 21 h. Gardez votre QR code à portée de main pour entrer en quelques secondes.', 'Ouvrir mon billet', 'Envoi automatique, la veille'),
    ('Jour J', 'Ce soir, c’est la Nuit Électrique', 'Entrée par le Hall 7. Votre billet s’ouvre en un tap depuis cet e-mail.', 'Afficher mon QR code', 'Envoi automatique, le jour même'),
    ('Après', 'Merci d’être venus !', 'Les photos arrivent bientôt. Et la prochaine date est déjà en prévente.', 'Réserver la prochaine', 'Envoi automatique, le lendemain'),
]
MAIL_TABS = ''.join('<button type="button" role="tab" id="mt-%d" aria-controls="mp-%d" aria-selected="%s" tabindex="%d">%s</button>' % (i, i, 'true' if i == 0 else 'false', 0 if i == 0 else -1, t) for i, (t, *_rest) in enumerate(MAILS))
MAIL_PANELS = ''.join('<div class="mm__panel" role="tabpanel" id="mp-%d" aria-labelledby="mt-%d"%s><p class="mm__from">Les Soirées Lumière</p><p class="mm__subj">%s</p><p class="mm__body">%s</p><span class="mm__cta">%s</span><p class="mm__meta"><i></i>%s</p></div>' % (i, i, '' if i == 0 else ' hidden', subj, body, cta, meta) for i, (t, subj, body, cta, meta) in enumerate(MAILS))

BARS = ''.join('<i style="--h:%d%%"></i>' % h for h in (38, 52, 44, 66, 58, 81, 100))
band_set = ''.join(f'<span class="band__item">{t}{icon("i-spark", 100, 100)}</span>' for t in BAND_ITEMS)
FINAL_LOGO = f'<svg viewBox="10 4 380 286" role="img" aria-label="Evoly live"><g fill="currentColor"><path d="{LIVE}"/><path d="{E}"/><path d="{V}"/><path d="{OLOGO}"/><path d="{L}"/><path d="{Y}"/></g></svg>'
QR = qr('evoly-scan')

BODY = f'''
<a class="skip" href="#main">Aller au contenu</a>
{SPRITE}
<header class="nav">
  <div class="nav__bar">
    <a class="nav__logo" href="#top" aria-label="Evoly, retour en haut">{icon('logo', 380, 286)}</a>
    <nav class="nav__links" aria-label="Principale">
      <a href="#fonctionnement">Fonctionnalités</a><a href="#revente">Revente</a><a href="#tarifs">Tarifs</a><a href="#faq">FAQ</a>
    </nav>
    <div class="nav__actions">
      <a class="nav__login" href="{LOGIN}" {EXT}>Connexion</a>
      <a class="btn btn--auto nav__cta" href="{REGISTER}" {EXT}>Créer un compte</a>
      <button class="nav__menu" type="button" aria-expanded="false" aria-controls="menu"><span class="burger" aria-hidden="true"><i></i><i></i></span><span class="vh">Ouvrir le menu</span></button>
    </div>
  </div>
</header>

<div class="menu" id="menu" inert>
  <span class="menu__o" aria-hidden="true">{icon('i-o', 100, 100)}</span>
  <ul class="menu__links">
    <li><a href="#fonctionnement">fonctionnalités</a></li>
    <li><a href="#revente">revente</a></li>
    <li><a href="#tarifs">tarifs</a></li>
    <li><a href="#faq">questions</a></li>
  </ul>
  <div class="menu__foot">
    <a class="link" href="{LOGIN}" {EXT}>Connexion</a>
    <a class="btn btn--pink" href="{REGISTER}" {EXT}>Créer mon premier événement</a>
  </div>
</div>

<main id="main">
  <section class="panel panel--dark hero" id="top" aria-labelledby="hero-title">
    <div class="hero__bg" aria-hidden="true">
      <div class="bigo bigo--a">{icon('i-o', 100, 100)}</div>
      <div class="bigo bigo--b">{icon('i-o', 100, 100)}</div>
    </div>
    <div class="hero__inner">
      <h1 class="display hero__title" id="hero-title">
        <span class="line"><span>ton prochain</span></span>
        <span class="line line--script"><span>souvenir <span class="script hl">t’attend<svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true"><path d="M4 13C52 3 128 4 196 11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg></span>.</span></span>
      </h1>
      <div class="hero__copy">
        <p class="lede hero__lede">Créez votre événement en 60 secondes. Vos participants achètent en un tap, avec Apple Pay, Google Pay ou leur carte, et paient le prix affiché, sans frais ajoutés.</p>
        <div class="hero__ctas"><a class="btn btn--pink" href="{REGISTER}" {EXT}>Créer mon premier événement</a><a class="link" href="#economies">Calculer mes économies</a></div>
        <ul class="trust" aria-label="Garanties">
          <li>{CHECK}Paiement sécurisé par Stripe</li><li>{CHECK}Données hébergées en UE</li><li>{CHECK}Conforme au RGPD</li><li>{CHECK}Gratuit, sans engagement</li>
        </ul>
      </div>
      <div class="hero__visual">
        <div class="buy">
          <div class="deco st-spark" data-depth="1.6" aria-hidden="true"><span class="diecut">{icon('i-spark', 100, 100)}</span></div>
          <div class="deco st-spiral" data-depth="1.1" aria-hidden="true"><span class="diecut">{icon('i-spiral', 100, 100)}</span></div>
          <div class="buy__stage">
            <div class="buy__tk" aria-hidden="true">{BUY_TICKET}<span class="buy__x" hidden>×2</span></div>
            <div class="buy__card">
              <div class="buy__head"><span class="buy__date"><b>14</b><span>nov.</span></span><div><p class="buy__name">Nuit Électrique</p><p class="buy__meta">samedi, 21:00, Hall 7</p></div></div>
              <div class="buy__line">
                <div><p class="buy__cat">Fosse</p><p class="buy__unit">24,00 € par billet</p></div>
                <div class="qty" role="group" aria-label="Nombre de billets"><button class="qty__btn" type="button" data-d="-1" aria-label="Retirer un billet">{icon('i-minus', 24, 24)}</button><output class="qty__n">1</output><button class="qty__btn" type="button" data-d="1" aria-label="Ajouter un billet">{icon('i-plus', 24, 24)}</button></div>
              </div>
              <dl class="buy__sum">
                <div class="buy__tot"><dt>Total</dt><dd class="buy__total">24,00 €</dd></div>
              </dl>
              <button class="buy__pay" type="button" aria-describedby="buy-hint"><span class="buy__lbl">Acheter</span><span class="buy__spin" aria-hidden="true">{icon('i-o', 100, 100)}</span><span class="buy__ok" aria-hidden="true">{CHECK}Payé</span></button>
              <ul class="buy__methods" aria-label="Moyens de paiement">
                <li>{icon('i-phone', 24, 24)}Apple Pay</li><li>{icon('i-phone', 24, 24)}Google Pay</li><li>{icon('i-card', 24, 24)}Carte</li><li><a href="#paiements">Et d’autres</a></li>
              </ul>
            </div>
          </div>
          <div class="deco st-blob" data-depth="2.2" aria-hidden="true"><span class="sticker">{icon('i-blob', 100, 100)}</span></div>
        </div>
        <p class="hero__hint"><span class="hero__hint-text" id="buy-hint">{icon('i-spark', 100, 100)}<span>Démo : touchez « Acheter », rien n’est débité.</span></span><button class="hero__replay" type="button" hidden>Rejouer</button></p>
      </div>
    </div>
  </section>

  <div class="band" aria-hidden="true"><div class="band__track">{band_set}{band_set}</div></div>

  <section class="calc" id="economies" aria-labelledby="calc-title">
    <div class="calc__head">
      <h2 class="h2" id="calc-title">calculez vos <span class="script">économies</span>.</h2>
      <p class="lede">Ce que vous touchez avec Evoly, commission et frais bancaires compris, face à la moyenne des autres billetteries.</p>
    </div>
    <div class="calc__body">
      <div class="ctrl">
        <div class="ctrl__row"><label for="calc-n"><span>Nombre de billets</span><output id="calc-n-out" for="calc-n">200</output></label><input class="range" id="calc-n" type="range" min="10" max="2000" step="10" value="200"></div>
        <div class="ctrl__row"><label for="calc-p"><span>Prix du billet</span><output id="calc-p-out" for="calc-p">30 €</output></label><input class="range" id="calc-p" type="range" min="1" max="150" step="1" value="30"></div>
        <div class="ctrl__sum">
          <div><span>Chiffre d’affaires</span><b id="calc-gross">6 000 €</b></div>
          <div class="ctrl__net"><span>Vous touchez avec Evoly <em id="calc-plan">Free</em></span><b id="calc-net">5 740 €</b></div>
          <p class="ctrl__more" id="calc-more">Soit <b>12 €</b> de plus qu’avec la moyenne des concurrents.</p>
        </div>
      </div>
      <div class="res">
        <div class="stub stub--avg" data-k="avg"><p class="stub__name">Moyenne des concurrents</p><p class="stub__rule" id="calc-range">de 0,59 € à 2,20 € par billet selon la billetterie</p><p class="stub__amt"><b>272 €</b><span>de frais</span></p><div class="stub__bar" aria-hidden="true"><i></i></div></div>
        <div class="stub stub--free is-best" data-k="free"><span class="stub__best">meilleur choix</span><p class="stub__name">Evoly Free</p><p class="stub__rule">0,15 € + 1,5 % par billet, 1 € maximum, plus les frais bancaires</p><p class="stub__amt"><b>260 €</b><span>de frais</span></p><p class="stub__split">dont <b id="calc-comm-free">120 €</b> de commission et <b id="calc-bank-free">140 €</b> de frais bancaires</p><div class="stub__bar" aria-hidden="true"><i></i></div></div>
        <div class="stub stub--pro" data-k="pro"><span class="stub__best">meilleur choix</span><p class="stub__name">Evoly Pro</p><p class="stub__rule">0,15 € + 1,5 % par billet, 0,70 € maximum, plus 29 € d’abonnement et les frais bancaires</p><p class="stub__amt"><b>289 €</b><span>de frais</span></p><p class="stub__split">dont <b id="calc-comm-pro">120 €</b> de commission, 29 € d’abonnement et <b id="calc-bank-pro">140 €</b> de frais bancaires</p><div class="stub__bar" aria-hidden="true"><i></i></div></div>
      </div>
    </div>
    <p class="calc__note">Moyenne de 9 billetteries en libre-service : Billetweb, Yurplan, Weezevent, PassPass, Eventbrite (formule Essentials, France), Ticket Tailor, Weeztix, Billetto et Luma. Tarifs publics relevés en septembre 2026, frais de paiement compris, un billet par commande. Paiements par carte européenne (1,5 % + 0,25 € par paiement chez Stripe), abonnement Pro compté pour un mois. Les frais Evoly sont inclus dans le prix de vos billets : vos participants paient le prix affiché.</p>
    <p class="vh" id="calc-live" aria-live="polite"></p>
  </section>

  <section class="flow" id="fonctionnement" aria-labelledby="flow-title">
    <div class="flow__head">
      <h2 class="h2" id="flow-title">créez, vendez, <span class="script">scannez</span>.</h2>
      <p class="lede">Votre événement est en ligne en 60 secondes, sans formation ni paramétrage sans fin.</p>
    </div>
    <div class="flow__track">
      <div class="flow__stage">
        <ol class="steps">
          <li class="step is-active" aria-current="step"><span class="step__num">Étape 1</span><h3 class="h3">Vous créez.</h3><p>Un assistant en trois étapes : infos, lieu, récapitulatif. Tout est sauvegardé automatiquement, de l’idée à la publication.</p></li>
          <li class="step"><span class="step__num">Étape 2</span><h3 class="h3">Vous vendez.</h3><p>Votre page événement, sur votre sous-domaine. Vos participants paient en un tap, avec Apple Pay, Google Pay, leur carte ou le moyen local de leur pays.</p></li>
          <li class="step"><span class="step__num">Le jour J</span><h3 class="h3">Vous scannez.</h3><p>Le scanner QR s’installe sur n’importe quel téléphone. Vos bénévoles reçoivent un lien temporaire et scannent sans créer de compte.</p></li>
        </ol>
        <div class="steps__dots" aria-hidden="true"><i class="is-on"></i><i></i><i></i></div>
        <div class="flow__device">
          <div class="phone" role="img" aria-label="Aperçu de l’espace organisateur Evoly : créer un événement, le mettre en vente, scanner les billets">
            <div class="phone__screen" aria-hidden="true">
              <div class="phone__island"></div>
              <div class="phone__status"><span>21:04</span><i></i></div>
              <div class="screen s-wiz is-active">
                <p class="s-title">Nouvel événement</p>
                <div class="s-stepper"><span class="is-on"><i>1</i>Infos</span><span><i>2</i>Lieu</span><span><i>3</i>Récap</span></div>
                <div class="s-field is-focus"><small>Nom de l’événement</small><b>Nuit Électrique<i class="caret"></i></b></div>
                <div class="s-field"><small>Date et heure</small><b>sam. 14 nov., 21:00</b></div>
                <div class="s-field"><small>Tarifs</small><div class="s-tiers"><span>Prévente 18 €</span><span>Fosse 24 €</span><span>VIP 45 €</span><span class="add">+ tarif</span></div></div>
                <p class="s-save"><i></i>Enregistré automatiquement</p>
                <div class="s-cta">Continuer<span class="tap" style="--tx:50%;--ty:50%"></span></div>
              </div>
              <div class="screen s-page">
                <p class="s-url">{icon('i-lock', 24, 24)}mon-asso.evoly.me</p>
                <div class="s-poster">{icon('i-o', 100, 100)}<p>NUIT<br>ÉLECTRIQUE</p></div>
                <p class="s-when">sam. 14 nov., 21:00, Hall 7</p>
                <ul class="s-cats">
                  <li class="is-off"><span>Prévente</span><b>Épuisé</b></li>
                  <li class="is-sel"><span>Fosse</span><b>24 €</b></li>
                  <li><span>Balcon VIP</span><b>45 €</b></li>
                  <li class="is-rs"><span>Revente</span><b>3 places</b></li>
                </ul>
                <div class="s-paybtn">Acheter<span class="tap" style="--tx:50%;--ty:50%"></span></div>
              </div>
              <div class="screen s-scan">
                <div class="s-tabs"><span class="is-on">Scanner</span><span>Manuel</span><span>Stats</span></div>
                <div class="s-view">{QR}<i class="s-corners"></i><i class="s-laser"></i></div>
                <div class="s-valid">{CHECK}<div><b>Billet valide</b><span>Marie Dupont, VIP</span></div></div>
                <ul class="s-log"><li>{CHECK}<span>Lucas Bernard</span><b>Fosse</b></li><li>{CHECK}<span>Inès Haddad</span><b>Fosse</b></li></ul>
                <p class="s-count"><b>612</b><span>entrées sur 842 billets</span></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="panel panel--soft-b pay" id="paiements" aria-labelledby="pay-title">
    <div class="pay__head">
      <h2 class="h2" id="pay-title">un tap, <span class="script">et c’est</span> payé.</h2>
      <p class="lede">Vos participants paient comme ils en ont l’habitude, où qu’ils soient : Apple Pay, Google Pay, cartes et moyens de paiement locaux.</p>
    </div>
    <ul class="paywall" aria-label="Moyens de paiement acceptés">{PAYWALL}</ul>
    <ul class="payfacts">
      <li><b>Un geste</b><span>Avec Apple Pay et Google Pay, aucun numéro de carte à saisir.</span></li>
      <li><b>Le bon moyen, partout</b><span>Bancontact en Belgique, iDEAL | Wero aux Pays-Bas, TWINT en Suisse, BLIK en Pologne, Swish en Suède.</span></li>
      <li><b>Au coût réel</b><span>Les frais bancaires sont facturés par Stripe, sans aucune marge d’Evoly.</span></li>
    </ul>
  </section>

  <section class="panel panel--dark events resale" id="revente" aria-labelledby="rs-title">
    <div class="events__head">
      <h2 class="h2" id="rs-title">la revente ? <span class="script">un lien</span>, c’est tout.</h2>
      <div class="events__side"><p class="lede">Un participant ne peut plus venir ? Il publie un lien, et il n’a rien d’autre à faire. Pas de messages, pas de négociation : le premier qui paie récupère la place, et le nouveau billet part tout seul par e-mail. Incluse dans toutes les offres.</p></div>
    </div>
    <ol class="rsteps">
      <li class="rstep"><span class="rstep__n">1</span><h3>Un lien, en un geste</h3><p>Le participant génère un lien de revente pour son billet.</p></li>
      <li class="rstep"><span class="rstep__n">2</span><h3>Publié où il veut</h3><p>En story, dans un groupe, sur un réseau. Personne à qui répondre.</p></li>
      <li class="rstep"><span class="rstep__n">3</span><h3>Tout se fait seul</h3><p>Le premier qui paie récupère la place : l’ancien billet est désactivé et le nouveau part aussitôt par e-mail.</p></li>
    </ol>
    <div class="stage">
      <figure class="stage__tk stage__old"><div class="stage__frame"><div class="stage__tkin">{OLD_TICKET}</div></div><figcaption>Billet de Thomas</figcaption></figure>
      <div class="stage__mid">
        <p class="linkpill">{icon('i-link', 24, 24)}evoly.me/r/nuit-7KQ2</p>
        <button class="btn btn--pink rs-buy" type="button">Simuler l’achat</button>
        <button class="hero__replay rs-replay" type="button" hidden>Rejouer</button>
      </div>
      <figure class="stage__tk stage__new"><div class="stage__frame"><p class="stage__slot">Le premier qui paie récupère la place.</p><div class="stage__tkin">{NEW_TICKET}</div></div><figcaption>Billet de Léa <span class="mailchip">{icon('i-mail', 24, 24)}<span>envoyé par e-mail</span></span></figcaption></figure>
    </div>
    <div class="resale__page">
      <div><h3 class="h3">Une section Revente sur votre page de vente.</h3><p class="lede">Les places remises en vente apparaissent dans une section à part, sous vos tarifs. Vos participants les achètent comme n’importe quel billet.</p></div>
    </div>
    <div class="salepage" role="group" aria-label="Exemple de page de vente avec une section Revente">
      <div class="sp__bar"><span class="bm__dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="sp__url">{icon('i-lock', 24, 24)}mon-asso.evoly.me/nuit-electrique</span></div>
      <div class="sp__grid">
        <div class="sp__event">
          <div class="sp__poster" aria-hidden="true">{icon('i-o', 100, 100)}<p>NUIT<br>ÉLECTRIQUE</p></div>
          <p class="sp__when">Samedi 14 novembre, 21:00</p>
          <p class="sp__where">Hall 7, Paris</p>
        </div>
        <div class="sp__side">
          <div class="sp__block">
            <p class="sp__h">Billets</p>
            <div class="sp__row is-off"><div><b>Prévente</b><span>Tarif de lancement</span></div><em>Épuisé</em></div>
            <div class="sp__row"><div><b>Fosse</b><span>Accès à la fosse</span></div><strong>24 €</strong><button class="sp__btn" type="button" data-toast="Démo : vos participants achètent en un tap.">Acheter</button></div>
            <div class="sp__row"><div><b>Balcon VIP</b><span>Balcon, vestiaire inclus</span></div><strong>45 €</strong><button class="sp__btn" type="button" data-toast="Démo : vos participants achètent en un tap.">Acheter</button></div>
          </div>
          <div class="sp__block sp__block--rs">
            <p class="sp__h">Revente<span class="sp__tag">3 places</span></p>
            <p class="sp__sub">Places revendues par des participants.</p>
            <div class="sp__row"><div><b>Fosse</b><span>2 places disponibles</span></div><strong>24 €</strong><button class="sp__btn" type="button" data-toast="Démo : la place est payée en un tap, l’ancien billet est désactivé et le nouveau part par e-mail.">Acheter</button></div>
            <div class="sp__row"><div><b>Balcon VIP</b><span>1 place disponible</span></div><strong>45 €</strong><button class="sp__btn" type="button" data-toast="Démo : la place est payée en un tap, l’ancien billet est désactivé et le nouveau part par e-mail.">Acheter</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="panel panel--soft-a dyn" id="prix-dynamiques" aria-labelledby="dyn-title">
    <div class="dyn__grid">
      <div class="dyn__text">
        <h2 class="h2" id="dyn-title">le bon prix, <span class="script">au bon</span> moment.</h2>
        <p class="lede">Prévente à prix doux, tarif normal, puis tarif jour J : le prix de vos billets évolue tout seul selon la date, ou selon d’autres critères.</p>
        <p class="plan-tag">Inclus dans l’offre Pro</p>
      </div>
      <div class="dyn__widget">
        <div class="stack" aria-hidden="true">
{TIERS_HTML}
        </div>
        <div class="dyn__ctrl">
          <p class="dyn__now"><b class="dyn__price">18 €</b><span><strong class="dyn__tier">Prévente</strong><span class="dyn__when">pour un achat à J-21</span></span></p>
          <label class="dyn__label" for="dyn-day">Faites glisser le jour de l’achat</label>
          <input class="range range--ink" id="dyn-day" type="range" min="0" max="30" step="1" value="9">
          <div class="dyn__ticks" aria-hidden="true"><span style="left:0%">J-30</span><span style="left:50%">J-15</span><span style="left:76.67%">J-7</span><span style="left:100%">Jour J</span></div>
        </div>
      </div>
      <ul class="olist">
        <li>{icon('i-o', 100, 100)}<span><strong>Lancez les ventes</strong> avec un tarif de prévente.</span></li>
        <li>{icon('i-o', 100, 100)}<span><strong>Le prix change tout seul</strong> à la date prévue, sans intervention.</span></li>
        <li>{icon('i-o', 100, 100)}<span><strong>Vos participants voient</strong> toujours le prix du moment.</span></li>
      </ul>
    </div>
  </section>

  <section class="mkt" id="marketing" aria-labelledby="mkt-title">
    <div class="mkt__head">
      <h2 class="h2" id="mkt-title">faites parler <span class="script">de vous</span>.</h2>
      <div class="mkt__side"><p class="lede">Une billetterie à vos couleurs et des e-mails qui partent tout seuls : vos participants se souviennent de vous, et ils reviennent.</p><p class="plan-tag">Inclus dans l’offre Pro</p></div>
    </div>
    <div class="mkt__grid">
      <article class="mcard mcard--brand" aria-labelledby="mk-brand">
        <div class="mcard__text">
          <h3 class="h3" id="mk-brand">Votre marque, partout.</h3>
          <ul class="olist">
            <li>{icon('i-o', 100, 100)}<span><strong>Vos couleurs et votre logo</strong> sur votre page de vente.</span></li>
            <li>{icon('i-o', 100, 100)}<span><strong>Votre propre domaine</strong>, avec SSL automatique.</span></li>
            <li>{icon('i-o', 100, 100)}<span><strong>Aucune mention d’Evoly</strong> sur votre page.</span></li>
          </ul>
          <div class="bf">
            <p class="bf__title">Essayez avec votre marque</p>
            <label class="bf__field" for="bf-name"><span>Nom de votre organisation</span><input id="bf-name" type="text" value="Les Soirées Lumière" maxlength="40" autocomplete="off"></label>
            <label class="bf__field" for="bf-domain"><span>Votre domaine</span><input id="bf-domain" type="text" value="billets.soireeslumiere.com" maxlength="60" autocomplete="off" spellcheck="false" inputmode="url"></label>
            <div class="bf__logo">
              <input class="bf__file" id="bf-file" type="file" accept="image/*">
              <label class="btn btn--line bf__upload" for="bf-file">{icon('i-upload', 24, 24)}Importer votre logo</label>
              <p class="bf__hint" id="bf-hint">Les couleurs sont tirées de votre logo. Il reste sur votre appareil : rien n’est envoyé.</p>
            </div>
            <div class="bf__colors">
              <label class="bf__color" for="bf-c1"><input id="bf-c1" type="color" value="#5b3df5"><span>Couleur principale</span></label>
              <label class="bf__color" for="bf-c2"><input id="bf-c2" type="color" value="#ffd23f"><span>Couleur d’accent</span></label>
            </div>
          </div>
        </div>
        <div class="bpv" role="img" aria-label="Aperçu de votre page de vente" style="--b1:#5b3df5;--b1-ink:#FFFFFF;--b2:#ffd23f;--b2-ink:#222222">
          <div class="bpv__bar"><span class="bm__dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="bpv__url">{icon('i-lock', 24, 24)}<span id="bpv-domain">billets.soireeslumiere.com</span></span></div>
          <div class="bpv__page">
            <div class="bpv__top"><span class="bpv__logo" id="bpv-logo">SL</span><b class="bpv__name" id="bpv-name">Les Soirées Lumière</b><span class="bpv__nav"><span>Événements</span><span>Mes billets</span></span></div>
            <div class="bpv__hero">
              <span class="bpv__deco" aria-hidden="true">{icon('i-o', 100, 100)}</span>
              <p class="bpv__kicker">Samedi 14 novembre, 21:00</p>
              <p class="bpv__title">Nuit Électrique</p>
              <p class="bpv__place">Hall 7, Paris</p>
              <span class="bpv__cta">Acheter des billets</span>
            </div>
            <div class="bpv__body">
              <div class="bpv__col"><p class="bpv__h">Billets</p><p class="bpv__row"><span>Fosse</span><b>24 €</b></p><p class="bpv__row"><span>Balcon VIP</span><b>45 €</b></p></div>
              <div class="bpv__col bpv__col--rs"><p class="bpv__h"><span class="bpv__tag">Revente</span></p><p class="bpv__row"><span>Fosse, 2 places</span><b>24 €</b></p></div>
            </div>
            <p class="bpv__foot">© <span id="bpv-foot">Les Soirées Lumière</span></p>
          </div>
        </div>
      </article>
      <article class="mcard mcard--mail" aria-labelledby="mk-mail">
        <div class="mcard__text">
          <h3 class="h3" id="mk-mail">Des e-mails qui partent tout seuls.</h3>
          <ul class="olist">
            <li>{icon('i-o', 100, 100)}<span><strong>Des rappels automatiques</strong> à J-7, J-1 et le jour J.</span></li>
            <li>{icon('i-o', 100, 100)}<span><strong>Un merci après l’événement</strong>, avec la prochaine date.</span></li>
            <li>{icon('i-o', 100, 100)}<span><strong>Des campagnes ciblées</strong>, avec les statistiques d’ouverture.</span></li>
          </ul>
        </div>
        <div class="mailmock">
          <div class="mm__tabs" role="tablist" aria-label="Automatisations">{MAIL_TABS}</div>
          <div class="mm__panels">{MAIL_PANELS}</div>
        </div>
      </article>
    </div>
  </section>

  <section class="panel panel--dark stats" id="stats" aria-labelledby="stats-title">
    <div class="stats__grid">
      <div class="stats__text">
        <h2 class="h2" id="stats-title">vos chiffres, <span class="script">en direct</span>.</h2>
        <p class="lede">Ventes, recette et remplissage se mettent à jour en temps réel, sur ordinateur comme sur téléphone. Le jour J, les entrées scannées aussi.</p>
        <ul class="olist">
          <li>{icon('i-o', 100, 100)}<span><strong>Chaque vente</strong> apparaît à la seconde.</span></li>
          <li>{icon('i-o', 100, 100)}<span><strong>Le jour J</strong>, suivez les entrées scannées en direct.</span></li>
          <li>{icon('i-o', 100, 100)}<span><strong>En Pro, toute l’équipe</strong> accède aux chiffres, avec le bon rôle.</span></li>
        </ul>
      </div>
      <div class="dash" role="img" aria-label="Aperçu du tableau de bord : 842 billets vendus sur 900 pour Nuit Électrique, 20 208 euros de recette">
        <div class="dash__head"><div><b>Nuit Électrique</b><span>sam. 14 nov., Hall 7</span></div><span class="live"><i></i>en direct</span></div>
        <div class="dash__big"><b class="js-sold">842</b><span>billets vendus<br>sur 900</span></div>
        <div class="meter"><i></i></div>
        <div class="chart"><p>Ventes des 7 derniers jours</p><div class="bars">{BARS}</div><div class="days"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div></div>
        <div class="dash__stats"><div><span>Recette</span><b class="js-rev">20 208 €</b></div><div><span>Remplissage</span><b class="js-fill">94 %</b></div><div><span>Revendus</span><b>23</b></div></div>
        <ul class="feed" aria-hidden="true"><li><b>Fosse</b><span>2 billets</span><em>il y a 1 min</em></li><li><b>Balcon VIP</b><span>1 billet</span><em>il y a 3 min</em></li></ul>
      </div>
    </div>
  </section>

  <section class="cmp" id="comparatif" aria-labelledby="cmp-title">
    <div class="cmp__head">
      <h2 class="h2" id="cmp-title">ce qu’on fait <span class="script">de plus</span>.</h2>
      <p class="lede">Face à 9 billetteries en libre-service parmi les plus utilisées.</p>
    </div>
    <div class="cmp__wrap">
      <table>
        <caption class="vh">Comparaison entre Evoly Free, Evoly Pro et 9 billetteries concurrentes</caption>
        <colgroup><col class="c-label"><col><col><col></colgroup>
        <thead><tr><th scope="col"><span class="vh">Critère</span></th><th scope="col">Evoly Free</th><th scope="col" class="p">Evoly Pro</th><th scope="col" class="eb">Concurrents</th></tr></thead>
        <tbody>{TROWS}</tbody>
      </table>
      <p class="cmp__note">Concurrents : Billetweb, Yurplan, Weezevent, PassPass, Eventbrite, Ticket Tailor, Weeztix, Billetto et Luma. « Rare » : 1 ou 2 sur 9. « Une partie » : 3 à 5. « Fréquent » : 6 à 8. Tarifs et fonctionnalités publics relevés en septembre 2026, revente et e-mails via un outil externe non comptés.</p>
    </div>
  </section>

  <section class="panel panel--soft-b pricing" id="tarifs" aria-labelledby="pr-title">
    <div class="pricing__head">
      <h2 class="h2" id="pr-title">sans frais cachés, <span class="script">vraiment</span>.</h2>
      <div class="pricing__side">
        <p class="lede">Une commission simple : 0,15 € + 1,5 % par billet payant, jamais plus de 1 € en Free, ni plus de 0,70 € en Pro.</p>
        <div class="bill" role="group" aria-label="Facturation"><button type="button" data-bill="month" aria-pressed="true">Mensuel</button><button type="button" data-bill="year" aria-pressed="false">Annuel<span class="off">−15 %</span></button></div>
      </div>
    </div>
    <div class="plans">
      <article class="plan plan--free" aria-labelledby="plan-free">
        <div class="plan__main"><h3 class="plan__name" id="plan-free">Free</h3><p class="plan__price"><b>0 €</b><span>par mois</span></p><p class="plan__billed">Sans carte bancaire</p><p class="plan__sub">Gratuit et sans engagement</p></div>
        <div class="tcard__perf" aria-hidden="true"><i></i></div>
        <ul class="plan__list">{FREE_LIST}</ul>
        <a class="btn plan__cta" href="{REGISTER}" {EXT}>Commencer gratuitement</a>
      </article>
      <article class="plan plan--pro" aria-labelledby="plan-pro">
        <span class="plan__badge">Populaire</span>
        <div class="plan__main"><h3 class="plan__name" id="plan-pro">Pro</h3><p class="plan__price"><b class="pro-price">29 €</b><span>par mois</span></p><p class="plan__billed pro-billed">Facturé chaque mois</p><p class="plan__sub">Essai gratuit de 14 jours, carte bancaire requise</p></div>
        <div class="tcard__perf" aria-hidden="true"><i></i></div>
        <ul class="plan__list">{PRO_LIST}</ul>
        <a class="btn plan__cta" href="{REGISTER_PRO}" {EXT}>Essayer Pro 14 jours</a>
      </article>
    </div>
    <p class="pricing__note">Commission et frais bancaires sont déduits automatiquement de vos ventes : vos participants paient le prix affiché, rien de plus. Les frais bancaires sont facturés au coût réel par Stripe.</p>
    <div class="waves" aria-hidden="true"></div>
  </section>

  <section class="faq" id="faq" aria-labelledby="faq-title">
    <div class="faq__grid">
      <div class="faq__head">
        <h2 class="h2" id="faq-title">vos <span class="script">questions</span>.</h2>
        <p class="lede">Une autre question ? Écrivez-nous à <a class="link" href="mailto:hello@evoly.me">hello@evoly.me</a>.</p>
      </div>
      <div class="faq__list">{FAQ_HTML}</div>
    </div>
  </section>

  <section class="panel panel--dark final" aria-labelledby="final-title">
    <div class="hero__bg" aria-hidden="true">
      <div class="bigo bigo--c">{icon('i-o', 100, 100)}</div>
      <div class="bigo bigo--d">{icon('i-o', 100, 100)}</div>
    </div>
    <div class="final__inner">
      <h2 class="h2 final__title" id="final-title">à vous de <span class="script">jouer</span>.</h2>
      <p class="lede">Créez votre compte gratuitement, sans carte bancaire. Votre premier événement peut être en ligne dans une minute.</p>
      <div class="final__ctas">
        <a class="btn btn--pink" href="{REGISTER}" {EXT}>Créer mon premier événement</a>
        <a class="btn btn--line" href="{REGISTER_PRO}" {EXT}>Essayer Pro 14 jours</a>
      </div>
    </div>
    <div class="final__wrap"><div class="final__logo">{FINAL_LOGO}</div></div>
  </section>
</main>

<footer class="footer">
  <div class="footer__brand">{icon('i-o', 100, 100)}<span>Ton prochain souvenir t’attend.</span></div>
  <nav aria-label="Pied de page">
    <a href="#tarifs">Tarifs</a><a href="#faq">FAQ</a><a href="mailto:hello@evoly.me">Contact</a>
    <a href="https://evoly.me/cgu" {EXT}>CGU</a><a href="https://evoly.me/privacy" {EXT}>Confidentialité</a><a href="https://evoly.me/legal" {EXT}>Mentions légales</a><a href="https://evoly.me/cookies" {EXT}>Cookies</a>
  </nav>
  <p class="footer__copy">© 2026 Evoly Solutions</p>
</footer>

<div class="toast-wrap" role="status" aria-live="polite"><div class="toast">{icon('i-spark', 100, 100)}<span class="toast__msg"></span></div></div>
'''

# typographie française : espaces insécables (texte uniquement, pas dans les balises)
def fr_typo(s):
    parts = re.split(r'(<[^>]+>)', s)
    out = []
    for p in parts:
        if p.startswith('<'):
            out.append(p)
            continue
        p = re.sub(r' ([?!;%€])', '\u202f\\1', p)
        p = re.sub(r' :', '\u00a0:', p)
        p = p.replace('« ', '«\u00a0').replace(' »', '\u00a0»')
        out.append(p)
    return ''.join(out)


def fr_attr(s):
    # mêmes règles dans les attributs aria-label / data-toast
    return re.sub(r'(aria-label|data-toast)="([^"]*)"', lambda m: '%s="%s"' % (m.group(1), fr_typo(m.group(2))), s)


BODY = fr_attr(fr_typo(BODY))


NW_PATTERNS = [r'\b(e-mails?|J-\d+|check-in|Check-in)\b', r'(\d+(?:,\d+)?\u202f€ \+ \d+(?:,\d+)?\u202f%)', r'(\d+(?:,\d+)?\u202f% \+ \d+(?:,\d+)?\u202f€)']


def nw_text(t):
    for pat in NW_PATTERNS:
        t = re.sub(pat, r'<span class="nw">\1</span>', t)
    return t


def nowrap(s):
    out = []
    for seg in re.split(r'(<svg\b.*?</svg>)', s, flags=re.S):
        if seg.startswith('<svg'):
            out.append(seg); continue
        parts = re.split(r'(<[^>]+>)', seg)
        out.append(''.join(p if p.startswith('<') else nw_text(p) for p in parts))
    return ''.join(out)


BODY = nowrap(BODY)

css = open(os.path.join(HERE, 'styles.css'), encoding='utf-8').read()
js = open(os.path.join(HERE, 'app.js'), encoding='utf-8').read()
TOKENS = f':root{{--noise:{NOISE};--wave-light:{wave_tile("#FFB8E8")};--wave-dark:{wave_tile("#3D3D3D")}}}'

if TEST:
    F = 'file://' + os.environ.get('EVOLY_FONTS', '/tmp/fonts')
    LB = 'file://' + os.environ.get('EVOLY_LIBS', '/tmp/libs')
    fonts = f'''<style>
@font-face{{font-family:"Archivo Black";src:url({F}/fontsource-archivo-black-5.3.0/package/files/archivo-black-latin-400-normal.woff2) format("woff2");font-weight:400}}
@font-face{{font-family:"Archivo";src:url({F}/fontsource-archivo-5.3.0/package/files/archivo-latin-300-normal.woff2) format("woff2");font-weight:300}}
@font-face{{font-family:"Archivo";src:url({F}/fontsource-archivo-5.3.0/package/files/archivo-latin-700-normal.woff2) format("woff2");font-weight:700}}
@font-face{{font-family:"Poppins";src:url({F}/fontsource-poppins-5.3.0/package/files/poppins-latin-400-normal.woff2) format("woff2");font-weight:400}}
@font-face{{font-family:"Poppins";src:url({F}/fontsource-poppins-5.3.0/package/files/poppins-latin-500-normal.woff2) format("woff2");font-weight:500}}
@font-face{{font-family:"Poppins";src:url({F}/fontsource-poppins-5.3.0/package/files/poppins-latin-600-normal.woff2) format("woff2");font-weight:600}}
@font-face{{font-family:"Yellowtail";src:url({F}/fontsource-yellowtail-5.3.0/package/files/yellowtail-latin-400-normal.woff2) format("woff2");font-weight:400}}
</style>'''
    libs = f'''<script src="{LB}/gsap-3.15.0/package/dist/gsap.min.js"></script>
<script src="{LB}/gsap-3.15.0/package/dist/ScrollTrigger.min.js"></script>
<script src="{LB}/lenis-1.3.26/package/dist/lenis.min.js"></script>'''
else:
    fonts = '''<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@300;700&family=Poppins:wght@400;500;600&family=Yellowtail&display=swap">'''
    libs = '''<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/ScrollTrigger.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/lenis@1.3.26/dist/lenis.min.js"></script>'''

page = f'''<!doctype html>
<html lang="fr" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Evoly — Ton prochain souvenir t’attend</title>
<meta name="description" content="Créez votre événement en 60 secondes. Achat en un tap avec Apple Pay, Google Pay et les moyens de paiement locaux, revente en un lien, statistiques en direct et une commission plafonnée à 1 € par billet.">
<meta name="theme-color" content="#222222">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
{fonts}
<style>{TOKENS}
{css}</style>
</head>
<body>
{BODY}
{libs}
<script>
{js}
</script>
</body>
</html>
'''
out = os.path.join(HERE, 'test.html') if TEST else os.path.join(HERE, 'dist', 'evoly-billetterie.html')
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w', encoding='utf-8').write(page)
print(out, len(page))

# icônes du site (favicon, écran d'accueil) copiées à la racine du site généré
if not TEST:
    import shutil
    for name in os.listdir(os.path.join(HERE, 'static')):
        shutil.copy(os.path.join(HERE, 'static', name), os.path.join(HERE, 'dist', name))
