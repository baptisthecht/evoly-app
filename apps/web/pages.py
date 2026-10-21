"""Pages du site vitrine en plus de l'accueil : plan de salle, associations, comparatif Eventbrite, qui sommes-nous.
Chaque page reprend le cadre de l'accueil (en-tête, menu, pied de page, styles) avec son propre contenu et ses
métadonnées ; i18n.py la traduit ensuite dans toutes les langues, à son adresse propre."""
import refonte
import json, re

SITE = 'https://evoly.me'
# boutons d'inscription des pages secondaires : la création rapide, comme les pages principales (build.py)
REGISTER = 'https://app.evoly.me/start'

# adresse de chaque page dans chaque langue
SLUGS = {
    'launch': {'fr': 'ouverture-des-ventes', 'en': 'ticket-launch', 'es': 'apertura-de-la-venta', 'de': 'verkaufsstart', 'it': 'apertura-vendite', 'pt': 'abertura-de-vendas', 'nl': 'verkoopstart'},
    'dynamic': {'fr': 'prix-dynamiques', 'en': 'dynamic-pricing', 'es': 'precios-dinamicos', 'de': 'dynamische-preise', 'it': 'prezzi-dinamici', 'pt': 'precos-dinamicos', 'nl': 'dynamische-prijzen'},
    'brand': {'fr': 'votre-marque', 'en': 'your-brand', 'es': 'tu-marca', 'de': 'ihre-marke', 'it': 'il-tuo-marchio', 'pt': 'a-sua-marca', 'nl': 'jouw-merk'},
    'seating': {'fr': 'plan-de-salle', 'en': 'seating-plan', 'es': 'plano-de-sala', 'de': 'saalplan', 'it': 'mappa-dei-posti', 'pt': 'planta-da-sala', 'nl': 'zaalplan'},
    'associations': {'fr': 'associations', 'en': 'nonprofits', 'es': 'asociaciones', 'de': 'vereine', 'it': 'associazioni', 'pt': 'associacoes', 'nl': 'verenigingen'},
    'eventbrite': {'fr': 'evoly-ou-eventbrite', 'en': 'evoly-vs-eventbrite', 'es': 'evoly-o-eventbrite', 'de': 'evoly-oder-eventbrite', 'it': 'evoly-o-eventbrite', 'pt': 'evoly-ou-eventbrite', 'nl': 'evoly-of-eventbrite'},
    'weezevent': {'fr': 'evoly-ou-weezevent', 'en': 'evoly-vs-weezevent', 'es': 'evoly-o-weezevent', 'de': 'evoly-oder-weezevent', 'it': 'evoly-o-weezevent', 'pt': 'evoly-ou-weezevent', 'nl': 'evoly-of-weezevent'},
    'billetweb': {'fr': 'evoly-ou-billetweb', 'en': 'evoly-vs-billetweb', 'es': 'evoly-o-billetweb', 'de': 'evoly-oder-billetweb', 'it': 'evoly-o-billetweb', 'pt': 'evoly-ou-billetweb', 'nl': 'evoly-of-billetweb'},
    'about': {'fr': 'a-propos', 'en': 'about', 'es': 'sobre-nosotros', 'de': 'ueber-uns', 'it': 'chi-siamo', 'pt': 'sobre-nos', 'nl': 'over-ons'},
}

CHECK = '<svg class="pg__check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'

def items(lst):
    return '<ul class="pg__list">' + ''.join(f'<li>{CHECK}<span>{t}</span></li>' for t in lst) + '</ul>'

def faq(qa):
    return '<div class="pg__faq">' + ''.join(f'<details><summary>{q}</summary><p>{a}</p></details>' for q, a in qa) + '</div>'

def hero(title_html, lede, cta, note=''):
    return (f'<section class="pg__hero"><h1 class="h2">{title_html}</h1><p class="lede">{lede}</p>'
            f'<div class="pg__ctas"><a class="btn btn--pink" href="{REGISTER}" target="_blank" rel="noopener">{cta}</a></div>'
            + (f'<p class="pg__note">{note}</p>' if note else '') + '</section>')

def block(title, body, dark=False):
    return f'<section class="pg__block{" pg__block--dark" if dark else ""}"><h2 class="pg__h">{title}</h2>{body}</section>'

def cta(title, text, button):
    return f'<section class="pg__cta"><h2 class="pg__h">{title}</h2><p>{text}</p><a class="btn btn--pink" href="{REGISTER}" target="_blank" rel="noopener">{button}</a></section>'

# ---------------------------------------------------------------- comparatifs : le face-à-face
ICO_RESALE = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>'
ICO_PHONE = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/></svg>'
ICO_SCAN = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></svg>'
ICO_CAP = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"/><path d="M3 21h18"/></svg>'
ICO_OK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>'
CARD_RESALE = ('La revente est incluse', 'Vos participants revendent leur place en un lien, jamais au-dessus du prix d’achat, sans quitter votre billetterie.', ICO_RESALE)
CARD_PAY = ('Payer en un geste', 'Apple Pay, Google Pay et les moyens de paiement locaux des pays européens, dès votre première vente.', ICO_PHONE)
CARD_SCAN = ('Les entrées, même sans réseau', 'Votre équipe scanne les billets avec un simple téléphone, sans application à installer ni compte à créer.', ICO_SCAN)
TILES = [
    ('Revente entre participants', 'La revente entre participants, intégrée et jamais au-dessus du prix d’achat : vous n’avez plus de remboursements à gérer.'),
    ('Paiement en un geste', 'Le paiement en un geste avec Apple Pay et Google Pay, et les moyens de paiement locaux des pays européens.'),
    ('Contrôle hors ligne', 'Le contrôle des entrées depuis n’importe quel téléphone, même sans réseau, avec un simple lien.'),
    ('Liste d’attente', 'Une liste d’attente qui propose automatiquement les places libérées sur les événements complets.'),
    ('7 langues', 'Une billetterie en 7 langues : chaque acheteur achète et reçoit ses billets dans sa langue.'),
    ('Et aussi', 'Les prix dynamiques, le plan de salle, les ambassadeurs, et les options comme le vestiaire ou les jetons boissons.'),
]
EVOLY_FEE = '0,29 € + 2 %, plafonnée à 2,50 € en Free ou 1 € en Pro'
STRIPE_FEE = 'Frais de Stripe au coût réel, en plus de la commission'
FAQ_SUB = ('Evoly impose-t-il un abonnement ?', 'Non : l’offre Free est sans abonnement ni engagement. L’offre Pro plafonne la commission à 1 € par billet et ajoute des fonctions avancées, avec 14 jours d’essai gratuit.')
CMP_LINKS = [('eventbrite', 'Evoly ou Eventbrite'), ('weezevent', 'Evoly ou Weezevent'), ('billetweb', 'Evoly ou Billetweb')]

def _duel(other):
    name, chip, big, sub, small = other
    return ('<div class="cmp-duel">'
            '<div class="cmp-card cmp-card--evoly"><div class="cmp-card__head"><span class="cmp-card__name">Evoly</span><span class="cmp-chip">Revente incluse</span></div>'
            '<span class="cmp-card__big">0,29 € + 2 %</span><span>plafonnée à 1 € par billet en Pro, 2,50 € en Free</span><span class="cmp-card__small">Frais de Stripe au coût réel, en plus</span></div>'
            '<span class="cmp-vs" aria-hidden="true">VS</span>'
            f'<div class="cmp-card cmp-card--other"><div class="cmp-card__head"><span class="cmp-card__name">{name}</span><span class="cmp-chip">{chip}</span></div>'
            f'<span class="cmp-card__big">{big}</span><span>{sub}</span><span class="cmp-card__small">{small}</span></div></div>')

def _rows(name, groups, note):
    head = f'<thead><tr><th scope="col"><span class="vh">Critère</span></th><th scope="col">Evoly</th><th scope="col">{name}</th></tr></thead>'
    body = ''
    for group, rows in groups:
        body += f'<tr class="cmp-group"><th scope="colgroup" colspan="3">{group}</th></tr>'
        for label, ours, theirs in rows:
            body += f'<tr><th scope="row">{label}</th><td class="cmp-us">{ours}</td><td>{theirs}</td></tr>'
    return (f'<div class="cmp-table-wrap" role="region" aria-label="Comparatif, Evoly et {name}" tabindex="0"><table class="cmp-table">{head}<tbody>{body}</tbody></table></div>'
            f'<p class="cmp-note">{note}</p>')

def _calculator():
    ticks_x = ''.join(f'<text x="{48 + v * 2.5:g}" y="232" text-anchor="middle" data-x="{v}">{v} €</text>' for v in (0, 50, 100, 150, 200))
    ticks_y = ''.join(f'<text x="40" y="{210 - v * 15 + 4:g}" text-anchor="end" data-y="{v}">{v} €</text>' for v in (0, 4, 8, 12))
    grid = ''.join(f'<line x1="48" y1="{210 - v * 15:g}" x2="548" y2="{210 - v * 15:g}" class="cmp-chart__grid"/>' for v in (4, 8, 12))
    return ('<section class="cmp-sec" aria-labelledby="cmp-calc-t"><h2 id="cmp-calc-t" class="cmp-h2">Combien économisez-vous ?</h2>'
            '<p class="cmp-lede">Frais de plateforme par billet, hors frais de paiement des deux côtés : Stripe au coût réel chez Evoly, frais de traitement chez Eventbrite.</p>'
            '<div class="cmp-calc" data-cmp-calc><div class="cmp-calc__panel">'
            '<div><div class="cmp-calc__row"><label for="cmp-prix">Prix du billet</label><strong class="cmp-calc__price" data-out="price">30 €</strong></div>'
            '<input id="cmp-prix" type="range" min="5" max="200" step="1" value="30" data-in="price"></div>'
            '<div class="cmp-calc__row"><label for="cmp-billets">Billets vendus par an</label><input id="cmp-billets" type="number" min="0" max="100000" step="10" value="300" inputmode="numeric" data-in="tickets"></div>'
            '<div class="cmp-calc__field"><span id="cmp-offre">Offre Evoly</span><div class="cmp-seg" role="group" aria-labelledby="cmp-offre"><button type="button" data-set="plan:free" aria-pressed="false">Free</button><button type="button" data-set="plan:pro" aria-pressed="true">Pro</button></div></div>'
            '<div class="cmp-calc__field"><span id="cmp-eb">Offre Eventbrite</span><div class="cmp-seg" role="group" aria-labelledby="cmp-eb"><button type="button" data-set="tier:a" aria-pressed="true">Essentials</button><button type="button" data-set="tier:b" aria-pressed="false">Professional</button></div></div>'
            '<div class="cmp-result" aria-live="polite"><div class="cmp-calc__row"><span>Evoly, par billet</span><strong data-out="evoly">0,89 €</strong></div>'
            '<div class="cmp-calc__row"><span>Eventbrite, par billet</span><strong data-out="eb">1,54 €</strong></div>'
            '<div class="cmp-gain"><span class="cmp-gain__label">Vous économisez</span><span class="cmp-gain__big"><span data-out="gain">195 €</span> <small>par an</small></span>'
            '<span class="cmp-gain__label">soit <span data-out="per">0,65 €</span> de moins par billet</span></div></div></div>'
            '<div class="cmp-calc__panel"><h3 class="cmp-calc__h">Frais par billet, selon son prix</h3>'
            '<svg class="cmp-chart" viewBox="0 0 640 250" role="img" aria-label="Frais de plateforme par billet selon son prix, de 5 à 200 € : la commission d’Evoly est plafonnée, celle d’Eventbrite augmente avec le prix.">'
            '<line x1="48" y1="210" x2="548" y2="210" class="cmp-chart__axis"/>' + grid + ticks_y + ticks_x +
            '<line x1="123" y1="24" x2="123" y2="210" class="cmp-chart__mark" data-mark/>'
            '<polyline class="cmp-chart__eb" data-line="eb" points=""/><polyline class="cmp-chart__free" data-line="free" points=""/><polyline class="cmp-chart__pro" data-line="pro" points=""/>'
            '<circle class="cmp-chart__dot-eb" r="7" cx="123" cy="187" data-dot="eb"/><circle class="cmp-chart__dot" r="7" cx="123" cy="197" data-dot="evoly"/>'
            '<text x="556" y="102" class="cmp-chart__label cmp-chart__label--eb" data-label="eb"><tspan data-eb-name="a">Eventbrite Essentials</tspan><tspan data-eb-name="b" style="display:none">Eventbrite Professional</tspan></text>'
            '<text x="556" y="176" class="cmp-chart__label">Evoly Free</text><text x="556" y="199" class="cmp-chart__label">Evoly Pro</text></svg>'
            '<p class="cmp-note">Le repère rose suit le prix choisi : au-delà de quelques euros, la commission d’Evoly cesse de grimper, elle est plafonnée.</p></div></div></section>'
            + CALC_JS)

CALC_JS = """<script>(() => {
  const root = document.querySelector('[data-cmp-calc]');
  if (!root) return;
  const lang = document.documentElement.lang || 'fr';
  const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money0 = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const $ = (q) => root.querySelector(q);
  const st = { price: 30, tickets: 300, plan: 'pro', tier: 'a' };
  const r2 = (v) => Math.round(v * 100) / 100;
  const com = (p, cap) => Math.min(r2(0.29 + 0.02 * p), cap); // grille Evoly : 0,29 € + 2 %, plafonnée à 2,50 € (Free) ou 1 € (Pro)
  const eb = (p, t) => (t === 'a' ? r2(0.035 * p + 0.49) : r2(0.055 * p + 0.99)); // grille Eventbrite France, relevée le 18 octobre 2026
  const X = (p) => 48 + p * 2.5, Y = (f) => 210 - f * 15;
  const pts = (fn) => { const a = []; for (let p = 0; p <= 200; p += 5) a.push(X(p).toFixed(1) + ',' + Y(fn(p)).toFixed(1)); return a.join(' '); };
  $('[data-line="free"]').setAttribute('points', pts((p) => com(p, 2.5)));
  $('[data-line="pro"]').setAttribute('points', pts((p) => com(p, 1)));
  root.querySelectorAll('[data-x]').forEach((t) => { t.textContent = money0.format(+t.dataset.x); });
  root.querySelectorAll('[data-y]').forEach((t) => { t.textContent = money0.format(+t.dataset.y); });
  const up = () => {
    const ev = com(st.price, st.plan === 'pro' ? 1 : 2.5), ebf = eb(st.price, st.tier), diff = Math.max(0, r2(ebf - ev)), mx = X(st.price).toFixed(1);
    $('[data-out="price"]').textContent = money0.format(st.price);
    $('[data-out="evoly"]').textContent = money.format(ev);
    $('[data-out="eb"]').textContent = money.format(ebf);
    $('[data-out="gain"]').textContent = money0.format(Math.round(diff * st.tickets));
    $('[data-out="per"]').textContent = money.format(diff);
    $('[data-line="eb"]').setAttribute('points', pts((p) => eb(p, st.tier)));
    const m = $('[data-mark]'); m.setAttribute('x1', mx); m.setAttribute('x2', mx);
    const de = $('[data-dot="evoly"]'); de.setAttribute('cx', mx); de.setAttribute('cy', Y(ev).toFixed(1));
    const db = $('[data-dot="eb"]'); db.setAttribute('cx', mx); db.setAttribute('cy', Y(ebf).toFixed(1));
    $('[data-label="eb"]').setAttribute('y', (Y(eb(200, st.tier)) + 4).toFixed(1));
    root.querySelectorAll('[data-eb-name]').forEach((n) => { n.style.display = n.dataset.ebName === st.tier ? '' : 'none'; });
    root.querySelectorAll('[data-set]').forEach((b) => { const [k, v] = b.dataset.set.split(':'); b.setAttribute('aria-pressed', String(st[k] === v)); });
  };
  $('[data-in="price"]').addEventListener('input', (e) => { st.price = +e.target.value; up(); });
  $('[data-in="tickets"]').addEventListener('input', (e) => { const v = parseInt(e.target.value, 10); st.tickets = Number.isFinite(v) ? Math.min(Math.max(v, 0), 100000) : 0; up(); });
  root.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => { const [k, v] = b.dataset.set.split(':'); st[k] = v; up(); }));
  up();
})();</script>"""

def comparison(key, name, other, cards, groups, note, when, lede, faq_switch, calculator=False):
    cards_html = ''.join(f'<div class="cmp-tile"><span class="cmp-ico">{ico}</span><h3>{t}</h3><p>{d}</p></div>' for t, d, ico in cards)
    tiles = ''.join(f'<div class="cmp-tile"><h3>{t}</h3><p>{d}</p></div>' for t, d in TILES)
    also = ''.join(f'<a href="/{SLUGS[k]["fr"]}/">{label}</a>' for k, label in CMP_LINKS if k != key)
    return {
        'title': f'Evoly ou {name} : comparatif des tarifs et des fonctions - Evoly',
        'desc': f'Evoly ou {name} ? Tarifs publics, revente, contrôle des entrées, paiement en un geste : ce qui change pour vous et pour vos participants.',
        'crumb': f'Evoly ou {name}',
        'faq': [faq_switch, FAQ_SUB],
        'main': lambda p: (
            '<div class="cmp">'
            '<section class="cmp-hero" aria-labelledby="cmp-t"><div class="cmp-hero__text"><p class="cmp-kicker">Comparer</p>'
            f'<h1 id="cmp-t">Evoly ou <span class="script">{name} ?</span></h1><p class="cmp-lede">{lede}</p>'
            f'<div class="cmp-ctas"><a class="btn btn--pink" href="{REGISTER}" target="_blank" rel="noopener">Essayer Evoly gratuitement</a><a class="btn btn--ghost" href="#cmp-comparatif">Voir le comparatif</a></div>'
            '<p class="cmp-date">Tarifs publics relevés le 18 octobre 2026</p></div>' + _duel(other) + '</section>'
            f'<section class="cmp-sec" aria-labelledby="cmp-bref"><h2 id="cmp-bref" class="cmp-h2">En bref</h2><div class="cmp-cards">{cards_html}</div></section>'
            f'<section class="cmp-sec" id="cmp-comparatif" aria-labelledby="cmp-comp"><h2 id="cmp-comp" class="cmp-h2">Le comparatif</h2>{_rows(name, groups, note)}</section>'
            + (_calculator() if calculator else '') +
            f'<section class="cmp-sec cmp-dark" aria-labelledby="cmp-inclus"><h2 id="cmp-inclus" class="cmp-h2">Inclus d’office chez <span class="script">Evoly</span></h2><div class="cmp-cards">{tiles}</div></section>'
            f'<section class="cmp-fair" aria-labelledby="cmp-fair"><div><p class="cmp-kicker">En toute franchise</p><h2 id="cmp-fair">Quand choisir {name} ?</h2></div><p>{when}</p></section>'
            f'<section class="cmp-sec" aria-labelledby="cmp-faq"><h2 id="cmp-faq" class="cmp-h2">Questions fréquentes</h2>{faq(p["faq"])}</section>'
            + cta('Mettez votre prochain événement en ligne en quelques minutes.', 'Gratuit, sans engagement et sans carte bancaire.', 'Commencer gratuitement')
            + f'<nav class="cmp-also" aria-label="Autres comparatifs"><span>Comparer aussi :</span>{also}</nav>'
            '</div>'
        ),
    }

def _switch(de, name):
    return (f'Puis-je passer {de}{name} à Evoly en cours de saison ?', f'Oui : créez vos prochains événements sur Evoly en quelques minutes, et laissez les ventes déjà ouvertes se terminer sur {name}.')

CMP_PAGES = {
    'weezevent': comparison('weezevent', 'Weezevent', ('Weezevent', 'Revente sur mesure', '2,5 %', 'par billet, minimum 0,99 €', 'Frais bancaires inclus'),
        [('La revente est incluse', 'Vos participants revendent leur place en un lien, jamais au-dessus du prix d’achat. Chez Weezevent, la revente sécurisée fait partie des services sur mesure.', ICO_RESALE), CARD_PAY, CARD_SCAN],
        [('Tarifs publics', [('Commission par billet', EVOLY_FEE, '2,5 %, minimum 0,99 €'), ('Frais de paiement', STRIPE_FEE, 'Inclus'), ('Billets gratuits', '0 €', 'Gratuits'), ('Versement des recettes', 'Sur votre compte Stripe, au fil des ventes', 'Tous les 15 jours')]),
         ('Revente', [('Revente sécurisée', f'<span class="cmp-ok">{ICO_OK}Incluse</span>', 'Parmi les services sur mesure')])],
        'Tarifs publics relevés sur weezevent.com le 18 octobre 2026, pour une vente en ligne en euros.',
        'Si vous vendez surtout des billets à petit prix, la commission de Weezevent, frais bancaires compris, revient souvent moins cher. Pour un festival qui veut le paiement sans espèces sur place, Weezevent propose aussi une solution complète. Evoly fait la différence sur tout ce qui est inclus d’office, sans service sur mesure à demander.',
        'Deux billetteries en ligne sans abonnement obligatoire. Voici ce qui les distingue, tarifs publics à l’appui.', _switch('de ', 'Weezevent')),
    'billetweb': comparison('billetweb', 'Billetweb', ('Billetweb', 'Commission la plus basse', '0,29 € + 1 %', 'par billet acheté', 'Annoncés comme tout compris'),
        [CARD_RESALE, CARD_PAY, CARD_SCAN],
        [('Tarifs publics', [('Commission par billet', EVOLY_FEE, '0,29 € + 1 %'), ('Frais de paiement', STRIPE_FEE, 'Annoncés comme compris : « et c’est tout »'), ('Billets gratuits', '0 €', 'Gratuits')])],
        'Tarif public relevé sur billetweb.fr le 18 octobre 2026.',
        'Si votre priorité absolue est la commission la plus basse, Billetweb est très compétitif. Evoly s’adresse aux organisateurs qui veulent une billetterie moderne, avec la revente, la liste d’attente, le paiement en un geste et le contrôle des entrées hors ligne inclus d’office.',
        'Deux billetteries en ligne sans abonnement obligatoire. Voici ce qui les distingue, tarifs publics à l’appui.', _switch('de ', 'Billetweb')),
    'eventbrite': comparison('eventbrite', 'Eventbrite', ('Eventbrite', 'Place de marché connue', '3,5 % + 0,49 €', 'par billet en Essentials, 5,5 % + 0,99 € en Professional', 'Frais de traitement des paiements possibles en plus'),
        [('Une commission plafonnée', 'Une commission plafonnée : 2,50 € maximum par billet en Free, 1 € en Pro. Chez Eventbrite, les frais suivent le prix du billet.', ICO_CAP), CARD_RESALE, CARD_SCAN],
        [('Tarifs publics', [('Commission par billet', EVOLY_FEE, 'Essentials : 3,5 % + 0,49 € · Professional : 5,5 % + 0,99 €'), ('Billet à 20 €', '0,69 €', '1,19 € à 2,09 €'), ('Billet à 50 €', '1 € en Pro, 1,29 € en Free', '2,24 € à 3,74 €'), ('Billet à 100 €', '1 € en Pro, 2,29 € en Free', '3,99 € à 6,49 €'), ('Frais de paiement', STRIPE_FEE, 'Frais de traitement des paiements possibles en plus')])],
        'Grille publique d’Eventbrite pour la France (offres Essentials et Professional), relevée sur eventbrite.fr le 18 octobre 2026. Frais de plateforme seuls, hors frais de paiement des deux côtés : <a href="https://www.eventbrite.fr/organizer/compare-packages/" target="_blank" rel="noopener nofollow">voir la grille d’Eventbrite</a>.',
        'Eventbrite est une place de marché très connue, où un large public découvre des événements. Si votre priorité est d’être trouvé par des gens qui ne vous connaissent pas encore, c’est un vrai atout. Si vous vendez surtout à votre propre public, vos frais et votre marque comptent davantage.',
        'Deux billetteries en libre-service, deux façons de facturer. Voici les différences, chiffres à l’appui.', _switch('d’', 'Eventbrite'), calculator=True),
}

PAGES = {
    'launch': {
        'title': 'Ouverture des ventes programmée, décompte et prévente privée - Evoly',
        'desc': 'Programmez la mise en ligne, faites patienter avec une annonce et un décompte, prévenez les intéressés et ouvrez une prévente privée par codes.',
        'crumb': 'Ouverture des ventes',
        'faq': [
            ('Que voient les visiteurs avant la publication ?', 'Au choix : rien, ils sont redirigés vers la page de votre organisation, ou une page d’annonce floutée avec votre texte et un décompte. Le titre, la description et l’affiche ne sont jamais révélés.'),
            ('La prévente privée est-elle incluse dans l’offre gratuite ?', 'Non, elle fait partie de l’offre Pro, que vous pouvez essayer gratuitement pendant 14 jours. La publication programmée, le décompte et « Prévenez-moi » sont inclus dans toutes les offres.'),
            ('Comment les acheteurs utilisent-ils un code de prévente ?', 'Ils le saisissent sur la page de l’événement, ou cliquent sur le lien personnel que vous leur envoyez : l’achat s’ouvre aussitôt, même si l’événement n’est pas encore public.'),
        ],
        'main_class': 'page spaced',
        'raw': lambda: {'final': refonte.FINAL_HTML},
        'main': lambda p: (
            refonte.page_hero('ouvrez les ventes au <span class="script">bon moment</span>.', 'Programmez la publication de votre événement, faites patienter avec une page d’annonce et un décompte, prévenez les intéressés et ouvrez une prévente privée à vos fidèles.', 'Nouveau')
            + refonte.launch_bento()
            + refonte.page_steps([('Programmez', 'Choisissez la date et l’heure de publication, et ce que voient les visiteurs avant.'), ('Faites patienter', 'Votre page d’annonce affiche un décompte, et les intéressés s’inscrivent pour être prévenus.'), ('Ouvrez les ventes', 'À l’heure dite, la page devient publique et les inscrits reçoivent un e-mail. Vos codes de prévente ouvrent l’achat plus tôt.')])
            + block('Questions fréquentes', faq(p['faq']))
            + '<!--RAW-final-->'
        ),
    },
    'dynamic': {
        'title': 'Prix dynamiques pour vos billets - Evoly',
        'desc': 'Prévente, tarif normal, tarif du jour J : faites évoluer automatiquement le prix de vos billets selon la date d’achat ou le nombre de places vendues.',
        'crumb': 'Prix dynamiques',
        'faq': [
            ('Les prix dynamiques sont-ils inclus dans l’offre gratuite ?', 'Non, ils font partie de l’offre Pro, que vous pouvez essayer gratuitement pendant 14 jours.'),
            ('Quel prix paie un participant ?', 'Celui du palier en vigueur au moment de sa commande : la page de vente affiche toujours le prix actuel.'),
        ],
        'main_class': 'page spaced',
        'raw': lambda: {'demo': refonte.partial('prix-dynamiques'), 'final': refonte.FINAL_HTML},
        'main': lambda p: (
            refonte.page_hero('prix <span class="script">dynamiques</span>.', 'Prévente, tarif normal, tarif du jour J : le prix de vos billets évolue automatiquement selon la date d’achat ou le nombre de places vendues. Vos participants voient toujours le prix en vigueur.')
            + '<!--RAW-demo-->'
            + refonte.page_steps([('Définissez vos paliers', 'Pour chaque tarif, choisissez un prix et une date de fin ou un nombre de places.'), ('Le prix change seul', 'À la date prévue ou quand le quota est atteint, le palier suivant s’applique, sans intervention.'), ('Vos participants suivent', 'La page de vente affiche toujours le prix en vigueur au moment de l’achat.')])
            + block('Questions fréquentes', faq(p['faq']))
            + '<!--RAW-final-->'
        ),
    },
    'brand': {
        'title': 'Billetterie à vos couleurs et e-mails automatiques - Evoly',
        'desc': 'Vos couleurs, votre logo et votre domaine sur votre billetterie, des e-mails envoyés automatiquement à vos participants, sans mention d’Evoly.',
        'crumb': 'Votre marque',
        'faq': [
            ('Puis-je retirer la mention d’Evoly de ma billetterie ?', 'Oui, avec l’offre Pro : votre page de vente n’affiche que vos couleurs et votre logo.'),
            ('Puis-je utiliser mon propre nom de domaine ?', 'Oui, avec l’offre Pro. Le certificat SSL est installé automatiquement.'),
        ],
        'main_class': 'page spaced',
        'raw': lambda: {'demo': refonte.partial('votre-marque'), 'final': refonte.FINAL_HTML},
        'main': lambda p: (
            refonte.page_hero('votre marque, <span class="script">partout</span>.', 'Vos couleurs et votre logo sur votre page de vente, votre propre domaine, des e-mails envoyés automatiquement à vos participants, et aucune mention d’Evoly.')
            + '<!--RAW-demo-->'
            + refonte.page_steps([('Importez votre logo', 'Les couleurs de votre page sont tirées de votre logo, et vous pouvez les ajuster.'), ('Branchez votre domaine', 'Votre billetterie s’affiche sur votre propre adresse, avec un certificat SSL automatique.'), ('Restez en contact', 'Rappels avant l’événement, remerciement après, campagnes avec statistiques d’ouverture.')])
            + block('Questions fréquentes', faq(p['faq']))
            + '<!--RAW-final-->'
        ),
    },
    'seating': {
        'title': 'Plan de salle et placement numéroté en ligne - Evoly',
        'desc': 'Créez votre plan de salle en quelques minutes : théâtre, gala ou stade. Les meilleures places sont attribuées automatiquement, ou choisies sur le plan.',
        'crumb': 'Plan de salle',
        'faq': [
            ('Combien de places un plan peut-il contenir ?', 'Plusieurs milliers : le modèle de stade compte 4 000 places, et le choix des meilleures places reste instantané.'),
            ('Puis-je modifier le plan après le début des ventes ?', 'Oui pour déplacer ou renommer les blocs. Les changements de structure sont bloqués dès qu’une place est vendue, pour ne jamais perdre une réservation.'),
            ('Puis-je changer la place d’un participant ?', 'Oui, dans la même catégorie : l’ancienne place est libérée et le participant reçoit un e-mail avec sa nouvelle place.'),
        ],
        'main': lambda p: (
            hero('le plan de salle, <span class="script">enfin simple</span>.', 'Théâtre, gala, conférence ou stade : dessinez votre salle en quelques minutes, vendez des places numérotées et laissez Evoly choisir les meilleures pour vos participants.', 'Créer mon plan de salle', 'Inclus dans l’offre Pro, avec 14 jours d’essai gratuit.')
            + block('Pour vous, l’organisateur', items([
                'Dix modèles prêts à l’emploi : théâtre, salle, gala, fosse, église, cabaret, conférence, aréna, stade et plan vierge.',
                'Un éditeur visuel : rangs droits ou en arc, tables rondes ou rectangulaires, zones debout, scène et repères.',
                'La numérotation de votre salle : de gauche à droite, impairs d’un côté, lettres ou chiffres pour les rangs.',
                'Places accessibles, places bloquées et notes internes, place par place.',
                'Une bibliothèque de salles : enregistrez votre plan pour le réutiliser, ou partagez-le avec d’autres organisateurs.',
                'Le jour J, le plan d’occupation en direct, imprimable rang par rang.',
            ]))
            + block('Pour vos participants', items([
                'Les meilleures places disponibles sont choisies automatiquement : côte à côte, au plus près de la scène, sans siège isolé.',
                'Ils les voient sur le plan et peuvent en changer, sans perdre leur réservation.',
                'Un lien pour réserver à côté de ses amis.',
                'La vue depuis sa place, en photo, avant d’acheter.',
                'Sur téléphone, un zoom à deux doigts, sans application à installer.',
            ]), dark=True)
            + block('Vos ventes, place par place', '<p class="pg__p">Une carte de chaleur montre les places qui partent en premier et celles qui restent, pour ajuster vos catégories et vos prix d’un événement à l’autre.</p>')
            + block('Questions fréquentes', faq(p['faq']))
            + cta('Votre salle, en ligne aujourd’hui.', 'Le plan de salle est inclus dans l’offre Pro, à 29 € par mois.', 'Essayer le Pro 14 jours')
        ),
    },
    'associations': {
        'title': 'Billetterie en ligne pour associations, sans abonnement - Evoly',
        'desc': 'Billetterie en ligne pour associations et clubs : 0 % sur les billets gratuits, aucun don suggéré aux participants et une commission plafonnée.',
        'crumb': 'Associations',
        'faq': [
            ('Faut-il être une association pour utiliser Evoly ?', 'Non : Evoly s’adresse à tous les organisateurs. Les associations y trouvent une offre sans abonnement et sans commission sur les billets gratuits.'),
            ('Comment l’argent arrive-t-il sur le compte de l’association ?', 'Les paiements passent par Stripe : les recettes sont versées sur le compte bancaire de l’association, via son propre compte Stripe.'),
        ],
        'main': lambda p: (
            hero('la billetterie des <span class="script">associations</span>.', 'Soirée, gala, tournoi ou spectacle de fin d’année : créez votre billetterie en quelques minutes, sans abonnement et sans carte bancaire.', 'Créer la billetterie de mon association')
            + block('Pensée pour les associations', items([
                '0 % de commission sur les billets gratuits, toujours, et sans limite.',
                'Aucun pourboire ni don pré-coché : vos participants paient exactement le prix du billet.',
                'Vous indiquez le montant que vous souhaitez percevoir : le prix de vente est calculé automatiquement.',
                'Vos bénévoles scannent les entrées depuis leur téléphone, avec un simple lien, sans créer de compte.',
                'Un participant empêché peut revendre sa place en partageant un lien : vous n’avez plus de remboursements à gérer.',
                'Codes promo pour vos membres, questions personnalisées à l’inscription et statistiques en direct.',
            ]))
            + block('Quels sont les frais ?', '<div class="pg__table" role="region" aria-label="Commission Evoly selon le prix du billet" tabindex="0"><table><thead><tr><th scope="col">Prix du billet</th><th scope="col">Commission Evoly</th></tr></thead><tbody>'
                    '<tr><td>Billet gratuit</td><td>0 €</td></tr><tr><td>5 €</td><td>0,39 €</td></tr><tr><td>10 €</td><td>0,49 €</td></tr><tr><td>20 €</td><td>0,69 €</td></tr></tbody></table></div>'
                    '<p class="pg__note">Offre Free, sans abonnement. Commission hors frais de paiement : les frais de Stripe s’appliquent au coût réel, sans marge d’Evoly.</p>', dark=True)
            + block('Questions fréquentes', faq(p['faq']))
            + cta('Mettez votre prochain événement en ligne en quelques minutes.', 'Gratuit, sans engagement et sans carte bancaire.', 'Commencer gratuitement')
        ),
    },
    'about': {
        'title': 'Qui sommes-nous - Evoly',
        'desc': 'Evoly est une billetterie en ligne européenne et indépendante, éditée par Evoly Solutions : commission plafonnée, sans frais ajoutés pour les participants.',
        'crumb': 'Qui sommes-nous',
        'faq': [],
        'main': lambda p: (
            hero('qui <span class="script">sommes-nous ?</span>', 'Evoly est une billetterie en ligne européenne et indépendante, conçue pour les organisateurs d’événements.', 'Créer mon premier événement')
            + block('Notre conviction', '<p class="pg__p">Vendre des billets ne devrait réserver aucune mauvaise surprise, ni à l’organisateur ni au public. Evoly applique une commission claire et plafonnée, n’ajoute aucun frais au prix des billets et propose des outils complets, du paiement mobile au plan de salle.</p>')
            + block('Nos principes', items([
                'Transparence : une commission claire et plafonnée, connue d’avance.',
                'Simplicité : votre événement en ligne en quelques minutes, sans formation.',
                'Respect des données : hébergement dans l’Union européenne, conformément au RGPD.',
                'Disponibilité : pour toute question, écrivez-nous à hello@evoly.me.',
            ]), dark=True)
            + block('Qui est derrière Evoly', '<p class="pg__p">Evoly est développée et exploitée par Evoly Solutions, l’entreprise de Baptist Hecht, inscrite à la Banque-Carrefour des Entreprises sous le numéro 1043.315.766.</p>')
            + cta('Envie d’essayer ?', 'Gratuit, sans engagement et sans carte bancaire.', 'Commencer gratuitement')
        ),
    },
}
PAGES.update(CMP_PAGES)  # pages de comparaison, toutes faites sur le même modèle

PAGE_CSS = (
    '.page{padding:clamp(120px,14vw,170px) var(--pad) var(--pad);display:grid;gap:clamp(18px,3vw,32px)}'
    '.pg__hero,.pg__block,.pg__cta{max-width:var(--maxw,1180px);margin:0 auto;width:100%}'
    '.pg__hero{display:grid;gap:22px;padding-bottom:clamp(10px,3vw,30px)}'
    '.pg__ctas{display:flex;flex-wrap:wrap;gap:12px}.pg__note{font-size:.9rem;opacity:.75;max-width:46rem}.pg__note a{color:inherit}'
    '.pg__block{background:var(--lilas);color:var(--charbon);border-radius:var(--r-panel);padding:clamp(24px,4.5vw,56px);display:grid;gap:22px}'
    '.pg__block--dark{background:var(--charbon);color:var(--creme)}'
    '.pg__h{font-family:var(--f-display);font-size:clamp(1.6rem,3.6vw,2.6rem);line-height:1;letter-spacing:-.03em}'
    '.pg__p{font-size:clamp(1rem,1.25vw,1.15rem);line-height:1.65;max-width:46rem}'
    '.pg__list{list-style:none;display:grid;gap:14px;padding:0;margin:0}.pg__list li{display:grid;grid-template-columns:28px 1fr;gap:12px;align-items:start;font-size:clamp(1rem,1.2vw,1.1rem);line-height:1.55}'
    '.pg__check{width:24px;height:24px;color:var(--rose);margin-top:1px}.pg__block:not(.pg__block--dark) .pg__check{color:var(--charbon)}'
    '.pg__table{overflow-x:auto}.pg__table table{border-collapse:collapse;width:100%;font-size:1rem}.pg__table--wide table{min-width:600px}'
    '.pg__table th,.pg__table td{text-align:left;padding:12px 14px;border-bottom:1px solid currentColor;border-color:rgba(255,246,240,.2)}.pg__block:not(.pg__block--dark) .pg__table th,.pg__block:not(.pg__block--dark) .pg__table td{border-color:rgba(34,34,34,.15)}'
    '.pg__table th{font-family:var(--f-label);font-weight:800}'
    '.pg__faq{display:grid;gap:10px}.pg__faq details{background:rgba(255,246,240,.6);border-radius:18px;padding:16px 20px}.pg__faq summary{cursor:pointer;font-weight:700}.pg__faq p{margin-top:10px;line-height:1.6}'
    '.pg__cta{background:var(--rose);color:var(--charbon);border-radius:var(--r-panel);padding:clamp(28px,5vw,64px);display:grid;gap:16px;justify-items:start}'
    '.pg__cta .btn--pink{--bg:var(--charbon);--fg:var(--creme)}'
    '.seat{max-width:var(--maxw,1180px);margin:0 auto clamp(40px,6vw,80px);padding:0 var(--pad);display:grid;gap:20px}'
    '.seat__links{display:flex;flex-wrap:wrap;gap:14px;align-items:center}'
)

def ld_for(pid, p):
    crumbs = {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'Accueil', 'item': f'{SITE}/'},
        {'@type': 'ListItem', 'position': 2, 'name': p['crumb'], 'item': f'{SITE}/{SLUGS[pid]["fr"]}/'}]}
    page = {'@type': 'AboutPage' if pid == 'about' else 'WebPage', 'name': p['title'], 'description': p['desc'], 'url': f'{SITE}/{SLUGS[pid]["fr"]}/', 'inLanguage': 'fr', 'isPartOf': {'@id': f'{SITE}/#site'}}
    graph = [page, crumbs]
    if pid == 'about':
        graph.append({'@type': 'Organization', '@id': f'{SITE}/#organisation', 'name': 'Evoly', 'legalName': 'Evoly Solutions', 'url': f'{SITE}/', 'sameAs': ['https://www.linkedin.com/company/evoly-tickets/', 'https://www.instagram.com/evoly.me/'], 'email': 'hello@evoly.me', 'founder': {'@type': 'Person', 'name': 'Baptist Hecht'}, 'address': {'@type': 'PostalAddress', 'addressLocality': 'Mouscron', 'postalCode': '7700', 'addressCountry': 'BE'}, 'identifier': {'@type': 'PropertyValue', 'propertyID': 'BCE', 'value': '1043.315.766'}, 'areaServed': 'Worldwide'})
    if p['faq']:
        graph.append({'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in p['faq']]})
    return {'@context': 'https://schema.org', '@graph': graph}

def build(home, typo):
    """Pages françaises construites dans le cadre de l'accueil : {identifiant: html}."""
    out = {}
    for pid, p in PAGES.items():
        h = home
        i, j = re.search(r'<main id="main"[^>]*>', h).start(), h.index('</main>') + len('</main>')
        main = typo(p["main"](p))
        for k, v in (p['raw']() if 'raw' in p else {}).items():  # contenu déjà mis en forme (démonstrations, fin de page)
            main = main.replace(f'<!--RAW-{k}-->', v)
        h = h[:i] + f'<main id="main" class="{p.get("main_class", "page")}">{main}</main>' + h[j:]
        # menus et pied de page : ancres de l'accueil (liens <a> seulement : les icônes <use href="#…"> restent internes)
        h = re.sub(r'(<a\b[^>]*?\bhref=")#(?!main")([\w-]+)"', r'\1/#\2"', h)
        h = re.sub(r'<title>.*?</title>', f'<title>{p["title"]}</title>', h, count=1, flags=re.S)
        for prop in ('og:title', 'twitter:title'):
            h = re.sub(rf'(<meta (?:property|name)="{prop}" content=")[^"]*(")', lambda m: m.group(1) + p['title'] + m.group(2), h, count=1)
        for prop in ('description', 'og:description', 'twitter:description'):
            h = re.sub(rf'(<meta (?:property|name)="{prop}" content=")[^"]*(")', lambda m: m.group(1) + p['desc'] + m.group(2), h, count=1)
        url = f'{SITE}/{SLUGS[pid]["fr"]}/'
        h = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{url}">', h, count=1)
        h = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{url}">', h, count=1)
        h = re.sub(r'<script type="application/ld\+json">.*?</script>', lambda m: '<script type="application/ld+json">' + json.dumps(ld_for(pid, p), ensure_ascii=False) + '</script>', h, count=1, flags=re.S)
        out[pid] = h
    return out
