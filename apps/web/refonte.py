"""Refonte de l'accueil (étiquettes des sections, bento, offre Pro, fin de page) et contenu des pages Prix dynamiques et Votre marque.
La transformation s'applique à l'accueil français généré, avant la traduction ; les textes ajoutés sont traduits comme les autres."""
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
def draw(cls, vb, d, sw=6):
    return f'<svg class="v4-draw {cls}" viewBox="{vb}" fill="none" aria-hidden="true" preserveAspectRatio="none"><path pathLength="1" d="{d}" stroke="currentColor" stroke-width="{sw}" stroke-linecap="round"/></svg>'
def section(h, sid):
    m = re.search(r'<section[^>]*id="' + sid + r'"', h); assert m, sid
    return m.start(), h.index('</section>', m.start()) + len('</section>')

FINAL_HTML = ''  # fin de page de l'accueil, réutilisée par les pages dédiées


def transform_home(home):
    global FINAL_HTML
    h = home
    for sid, label in (('economies', 'Calculateur'), ('fonctionnement', 'Comment ça marche'), ('revente', 'Revente'), ('terrain', 'Le jour J'), ('comparatif', 'Comparatif'), ('tarifs', 'Tarifs'), ('faq', 'Questions')):
        a, b = section(h, sid); seg = h[a:b]; i = seg.find('<h2')
        if i > 0: h = h[:a] + seg[:i] + f'<h2 data-eyebrow="{label}"' + seg[i + 3:] + h[b:]
    a, b = section(h, 'terrain'); seg = h[a:b]
    big = re.search(r'<li class="field__card field__card--big">.*?</li>', seg, re.S).group(0)
    cards = dict(re.findall(r'<h3 class="h3 field__t">(.*?)</h3><p>(.*?)</p></li>', seg, re.S))
    def corps(t): return cards[t]
    BENTO = big + f'''
    <li class="field__card field__card--wide v4-b v4-b--lilas v4-split v4-reveal"><div class="v4-split__txt"><h3 class="h3 field__t">Contrôler sans valider</h3><p>{corps("Contrôler sans valider")}</p></div><div class="v4-gates" aria-hidden="true"><span class="v4-gate"><i><svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg></i><b>Entrée du site</b><em>contrôlé</em></span><span class="v4-gates__path"></span><span class="v4-gate v4-gate--ok"><i><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></i><b>Salle</b><em>validé</em></span></div></li>
    <li class="field__card v4-b v4-b--rose v4-reveal"><p class="v4-hello" data-words="Bonjour|Hello|Hallo|Hola|Ciao|Olá|Hoi" aria-hidden="true">Bonjour</p><p class="v4-flags" aria-hidden="true"><span class="v4-flag" title="Français"><svg viewBox="0 0 3 2"><path fill="#002395" d="M0 0h1v2H0z"/><path fill="#fff" d="M1 0h1v2H1z"/><path fill="#ED2939" d="M2 0h1v2H2z"/></svg></span><span class="v4-flag" title="English"><svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice"><clipPath id="v4uk-s"><path d="M0 0v30h60V0z"/></clipPath><clipPath id="v4uk-t"><path d="M30 15h30v15zv15H0zH0V0zV0h30z"/></clipPath><g clip-path="url(#v4uk-s)"><path d="M0 0v30h60V0z" fill="#012169"/><path d="M0 0l60 30m0-30L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0l60 30m0-30L0 30" clip-path="url(#v4uk-t)" stroke="#C8102E" stroke-width="4"/><path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/><path d="M30 0v30M0 15h60" stroke="#C8102E" stroke-width="6"/></g></svg></span><span class="v4-flag" title="Nederlands"><svg viewBox="0 0 3 2"><path fill="#AE1C28" d="M0 0h3v.667H0z"/><path fill="#fff" d="M0 .667h3v.667H0z"/><path fill="#21468B" d="M0 1.333h3V2H0z"/></svg></span><span class="v4-flag" title="Deutsch"><svg viewBox="0 0 5 3" preserveAspectRatio="xMidYMid slice"><path d="M0 0h5v1H0z"/><path fill="#DD0000" d="M0 1h5v1H0z"/><path fill="#FFCE00" d="M0 2h5v1H0z"/></svg></span><span class="v4-flag" title="Español"><svg viewBox="0 0 3 2"><path fill="#AA151B" d="M0 0h3v2H0z"/><path fill="#F1BF00" d="M0 .5h3v1H0z"/></svg></span><span class="v4-flag" title="Italiano"><svg viewBox="0 0 3 2"><path fill="#009246" d="M0 0h1v2H0z"/><path fill="#fff" d="M1 0h1v2H1z"/><path fill="#CE2B37" d="M2 0h1v2H2z"/></svg></span><span class="v4-flag" title="Português"><svg viewBox="0 0 600 400"><path fill="#046A38" d="M0 0h240v400H0z"/><path fill="#DA291C" d="M240 0h360v400H240z"/><circle cx="240" cy="200" r="78" fill="none" stroke="#FFE900" stroke-width="22"/><path d="M200 150h80v62a40 40 0 0 1-80 0z" fill="#fff"/><path d="M212 162h56v48a28 28 0 0 1-56 0z" fill="#DA291C"/></svg></span></p><h3 class="h3 field__t">Sept langues</h3><p>{corps("Sept langues")}</p></li>
    <li class="field__card v4-b v4-b--paper v4-reveal"><p class="v4-count" data-count="842">842</p><p class="v4-sub">billets vendus cette semaine</p><div class="v4-bars" aria-hidden="true"><span><i style="--h:38%;--d:0ms"></i><em>Lun</em></span><span><i style="--h:52%;--d:70ms"></i><em>Mar</em></span><span><i style="--h:44%;--d:140ms"></i><em>Mer</em></span><span><i style="--h:66%;--d:210ms"></i><em>Jeu</em></span><span><i style="--h:58%;--d:280ms"></i><em>Ven</em></span><span><i style="--h:81%;--d:350ms"></i><em>Sam</em></span><span><i style="--h:100%;--d:420ms"></i><em>Dim</em></span></div><h3 class="h3 field__t">Vos chiffres en direct</h3><p>{corps("Vos chiffres en direct")}</p></li>
    <li class="field__card v4-b v4-b--graphite v4-reveal"><div class="v4-ticket" aria-hidden="true"><p class="v4-ticket__k"><svg viewBox="0 0 100 100"><use href="#i-o" width="100" height="100"/></svg> Billet de Léa</p><p class="v4-ticket__t">Nuit Électrique</p><p class="v4-ticket__d">Sam. 14 nov · 21:00 · Fosse</p></div><h3 class="h3 field__t">Le billet dans le téléphone</h3><p>{corps("Le billet dans le téléphone")}</p></li>
    <li class="field__card v4-b v4-b--creme v4-reveal"><div class="v4-chat" aria-hidden="true"><p class="v4-bubble"><b>MA</b><span>Tu viens samedi ?</span></p><p class="v4-bubble v4-bubble--out"><span>Invitation reçue !</span><b>LÉ</b></p></div><h3 class="h3 field__t">Des invitations</h3><p>{corps("Des invitations")}</p></li>
    <li class="field__card field__card--wide v4-b v4-b--rose v4-split v4-reveal"><div class="v4-split__txt"><h3 class="h3 field__t">Vos consignes dans chaque billet</h3><p>{corps("Vos consignes dans chaque billet")}</p></div><div class="v4-mail" aria-hidden="true"><p class="v4-mail__l">Votre billet pour Nuit Électrique</p><ul class="v4-info"><li><i><svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9.5" r="2.4" fill="currentColor"/></svg></i>Entrée par le Hall 7</li><li><i><svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 17V7h3.2a3 3 0 0 1 0 6H10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></i>Parking P2 gratuit</li><li><i><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></i>Ouverture des portes à 21 h</li></ul></div></li>'''
    seg = re.sub(r'(<ul class="field__grid" role="list">).*?(</ul>)', lambda m: m.group(1) + BENTO + m.group(2), seg, count=1, flags=re.S)
    seg = seg.replace('<p class="lede">', draw("v4-arc", "0 0 400 400", "M400 4 C 310 50, 250 160, 270 250 S 360 380, 160 392", 5) + '<p class="lede">', 1)
    h = h[:a] + seg + h[b:]
    a, b = section(h, 'pro'); seg = h[a:b]
    head = seg[:seg.index('<ul class="pro__grid"')]
    pc = re.findall(r'<li class="pro__card"><h3 class="h3 pro__t">(.*?)</h3><p>(.*?)</p>', seg, re.S)
    VIS = ['<span class="v4-tier"><span>Prévente</span><b>12 €</b></span><svg class="v4-chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="v4-tier v4-tier--on"><span>Normal</span><b>15 €</b></span><svg class="v4-chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="v4-tier"><span>Jour J</span><b>18 €</b></span>',
           '<span class="v4-sw" style="background:#1d4ed8"></span><span class="v4-sw" style="background:#ffb8e8"></span><span class="v4-sw" style="background:#222"></span><span class="v4-logo">Votre logo</span>',
           '<span class="v4-seats">' + ''.join('<i class="on"></i>' if k in (12, 13, 14, 21, 22, 23) else '<i></i>' for k in range(36)) + '</span>']
    HREF = ['/prix-dynamiques/', '/votre-marque/', '/plan-de-salle/']
    CARTES = ''.join(f'<li class="v4-reveal"><a class="v4-pc" href="{HREF[k]}"><span class="v4-pc__vis" aria-hidden="true">{VIS[k]}</span><h3 class="v4-pc__t">{t}</h3><p>{d}</p><span class="v4-pc__go" aria-hidden="true">{ARROW}</span></a></li>' for k, (t, d) in enumerate(pc))
    seg = head.replace('<section class="pro"', '<section class="pro v4-pro"', 1).replace('<h2', '<h2 data-eyebrow="Offre Pro"', 1) + '<div class="v4-pro__stage">' + draw("v4-pro__line", "0 0 1200 300", "M-10 230 C 160 300, 260 40, 470 110 S 760 290, 930 170 S 1120 30, 1210 70", 6) + f'<ul class="v4-pro__grid" role="list">{CARTES}</ul></div></section>'
    h = h[:a] + seg + h[b:]
    m = re.search(r'<section class="panel panel--dark final".*?</section>', h, re.S); fin = m.group(0)
    liens = re.findall(r'<a [^>]*href="([^"]+)"[^>]*>([^<]+)</a>', fin)
    reg = next(u for u, t in liens if 'premier' in t); pro = next(u for u, t in liens if 'Pro' in t)
    FINAL = fin
    FINAL = re.sub(r'\s*<div class="bigo bigo--c">.*?</div>(?=\s*<div class="bigo bigo--d">)', '', FINAL, count=1, flags=re.S)
    FINAL = re.sub(r'\s*<div class="final__wrap">.*?</div></div>', '', FINAL, count=1, flags=re.S)
    FINAL = re.sub(r'<div class="final__ctas">.*?</div>', f'<div class="final__ctas v4-final__ctas"><a class="v4-cta" href="{reg}" target="_blank" rel="noopener"><span class="v4-cta__pill">Créer mon premier événement</span><span class="v4-cta__round" aria-hidden="true">{ARROW}</span></a><a class="v4-link" href="{pro}" target="_blank" rel="noopener">Essayer Pro 14 jours</a></div>', FINAL, count=1, flags=re.S)
    FINAL = FINAL.replace('aria-labelledby="final-title">', 'aria-labelledby="final-title">' + draw("v4-final__line", "0 0 1000 200", "M-10 150 C 120 170, 250 165, 290 110 C 320 65, 250 30, 205 52 C 160 75, 215 122, 330 122 C 560 122, 850 90, 1010 12", 7), 1)
    assert 'v4-cta' in FINAL and 'bigo--d' in FINAL and 'bigo--c' not in FINAL and 'final__logo' not in FINAL
    h = h.replace(fin, FINAL, 1)
    FINAL_HTML = FINAL
    return h.replace('<main id="main">', '<main id="main" class="spaced">', 1)


def partial(name):
    return open(os.path.join(HERE, 'partials', name + '.html'), encoding='utf-8').read()


def page_hero(h1, lede):
    return f'<section class="v4-phero"><p class="v4-eyebrow">Offre Pro</p><h1>{h1}</h1><p class="lede">{lede}</p></section>'


def page_steps(steps):
    li = ''.join(f'<li><span>{n:02d}</span><h3>{t}</h3><p>{d}</p></li>' for n, (t, d) in enumerate(steps, 1))
    return f'<section class="v4-steps"><p class="v4-eyebrow v4-reveal">Comment ça marche</p><h2 class="h2">en trois <span class="script">étapes</span>.</h2><ol>{li}</ol></section>'
