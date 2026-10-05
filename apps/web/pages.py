"""Pages du site vitrine en plus de l'accueil : plan de salle, associations, comparatif Eventbrite, qui sommes-nous.
Chaque page reprend le cadre de l'accueil (en-tête, menu, pied de page, styles) avec son propre contenu et ses
métadonnées ; i18n.py la traduit ensuite dans toutes les langues, à son adresse propre."""
import json, re

SITE = 'https://evoly.me'
REGISTER = 'https://app.evoly.me/register'

# adresse de chaque page dans chaque langue
SLUGS = {
    'seating': {'fr': 'plan-de-salle', 'en': 'seating-plan', 'es': 'plano-de-sala', 'de': 'saalplan', 'it': 'mappa-dei-posti', 'pt': 'planta-da-sala', 'nl': 'zaalplan'},
    'associations': {'fr': 'associations', 'en': 'nonprofits', 'es': 'asociaciones', 'de': 'vereine', 'it': 'associazioni', 'pt': 'associacoes', 'nl': 'verenigingen'},
    'eventbrite': {'fr': 'evoly-ou-eventbrite', 'en': 'evoly-vs-eventbrite', 'es': 'evoly-o-eventbrite', 'de': 'evoly-oder-eventbrite', 'it': 'evoly-o-eventbrite', 'pt': 'evoly-ou-eventbrite', 'nl': 'evoly-of-eventbrite'},
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

PAGES = {
    'seating': {
        'title': 'Plan de salle et placement numéroté en ligne - Evoly',
        'desc': 'Créez votre plan de salle en quelques minutes : théâtre, gala, église, conférence ou stade. Les meilleures places sont attribuées automatiquement et vos participants peuvent les changer en un geste.',
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
                'Ils peuvent les voir sur le plan et les changer en un geste, sans perdre leur réservation.',
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
        'desc': 'La billetterie en ligne des associations : 0 % de commission sur les billets gratuits, aucun don suggéré à vos participants, une commission plafonnée sur les billets payants et des bénévoles qui scannent sans compte.',
        'crumb': 'Associations',
        'faq': [
            ('Faut-il être une association pour utiliser Evoly ?', 'Non : Evoly s’adresse à tous les organisateurs. Les associations y trouvent une offre sans abonnement et sans commission sur les billets gratuits.'),
            ('Comment l’argent arrive-t-il sur le compte de l’association ?', 'Les paiements passent par Stripe : les recettes sont versées sur le compte bancaire de l’association, via son propre compte Stripe.'),
        ],
        'main': lambda p: (
            hero('la billetterie des <span class="script">associations</span>.', 'Soirée, gala, tournoi ou spectacle de fin d’année : créez votre billetterie en 60 secondes, sans abonnement et sans carte bancaire.', 'Créer la billetterie de mon association')
            + block('Pensée pour les associations', items([
                '0 % de commission sur les billets gratuits, toujours, et sans limite.',
                'Aucun pourboire ni don pré-coché : vos participants paient exactement le prix affiché.',
                'Vous fixez ce que vous voulez toucher, le prix se calcule tout seul.',
                'Vos bénévoles scannent les entrées depuis leur téléphone, avec un simple lien, sans créer de compte.',
                'Un participant empêché revend sa place en un lien : plus de remboursements à gérer.',
                'Codes promo pour vos membres, questions personnalisées à l’inscription et statistiques en direct.',
            ]))
            + block('Combien ça coûte ?', '<div class="pg__table" role="region" aria-label="Commission Evoly selon le prix du billet" tabindex="0"><table><thead><tr><th scope="col">Prix du billet</th><th scope="col">Commission Evoly</th></tr></thead><tbody>'
                    '<tr><td>Billet gratuit</td><td>0 €</td></tr><tr><td>5 €</td><td>0,39 €</td></tr><tr><td>10 €</td><td>0,49 €</td></tr><tr><td>20 €</td><td>0,69 €</td></tr></tbody></table></div>'
                    '<p class="pg__note">Offre Free, sans abonnement. Commission hors frais de paiement : les frais de Stripe s’appliquent au coût réel, sans marge d’Evoly.</p>', dark=True)
            + block('Questions fréquentes', faq(p['faq']))
            + cta('Votre prochain événement, en ligne en une minute.', 'Gratuit, sans engagement et sans carte bancaire.', 'Commencer gratuitement')
        ),
    },
    'eventbrite': {
        'title': 'Evoly ou Eventbrite : comparatif des frais et des fonctions - Evoly',
        'desc': 'Evoly ou Eventbrite ? Comparez les frais de plateforme billet par billet : la commission d’Evoly est plafonnée, les frais de service d’Eventbrite augmentent avec le prix. Grille publique d’Eventbrite pour la France, consultée en octobre 2026.',
        'crumb': 'Evoly ou Eventbrite',
        'faq': [],
        'main': lambda p: (
            hero('Evoly ou <span class="script">Eventbrite ?</span>', 'Deux billetteries en libre-service, deux façons de facturer. Voici les différences, chiffres à l’appui.', 'Essayer Evoly gratuitement')
            + block('Les frais de plateforme, billet par billet', '<div class="pg__table pg__table--wide" role="region" aria-label="Frais de plateforme par billet, Evoly et Eventbrite" tabindex="0"><table><thead><tr><th scope="col">Prix du billet</th><th scope="col">Evoly Free</th><th scope="col">Evoly Pro</th><th scope="col">Eventbrite, 3,5 % + 0,49 €</th><th scope="col">Eventbrite, 5,5 % + 0,99 €</th></tr></thead><tbody>'
                    '<tr><td>20 €</td><td>0,69 €</td><td>0,69 €</td><td>1,19 €</td><td>2,09 €</td></tr>'
                    '<tr><td>50 €</td><td>1,29 €</td><td>1 €</td><td>2,24 €</td><td>3,74 €</td></tr>'
                    '<tr><td>100 €</td><td>2,29 €</td><td>1 €</td><td>3,99 €</td><td>6,49 €</td></tr>'
                    '<tr><td>200 €</td><td>2,50 €</td><td>1 €</td><td>7,49 €</td><td>11,99 €</td></tr></tbody></table></div>'
                    '<p class="pg__note">Frais de plateforme seuls, par billet. Chez Evoly, les frais de paiement de Stripe s’ajoutent au coût réel ; chez Eventbrite, des frais de traitement des paiements peuvent s’ajouter selon les cas. Grille publique d’Eventbrite pour la France, consultée en octobre 2026, susceptible d’évoluer : <a href="https://www.eventbrite.fr/help/fr/articles/755615/combien-coute-aux-organisateurs-l-utilisation-d-eventbrite/" target="_blank" rel="noopener nofollow">voir la grille d’Eventbrite</a>.</p>')
            + block('Ce qui change avec Evoly', items([
                'Une commission plafonnée : 2,50 € maximum par billet en Free, 1 € en Pro. Chez Eventbrite, les frais suivent le prix du billet.',
                'Le prix affiché est le prix payé : vos participants ne découvrent aucun frais au moment de payer.',
                'Vous fixez ce que vous voulez toucher, le prix se calcule tout seul.',
                'La revente entre participants, intégrée à toutes les offres.',
                'Le plan de salle, avec les meilleures places choisies automatiquement (offre Pro).',
                'Des données hébergées dans l’Union européenne.',
            ]), dark=True)
            + block('Ce qu’Eventbrite fait bien', '<p class="pg__p">Eventbrite est une place de marché très connue, où un large public découvre des événements. Si votre priorité est d’être trouvé par des gens qui ne vous connaissent pas encore, c’est un vrai atout. Si vous vendez surtout à votre propre public, vos frais et votre marque comptent davantage.</p>')
            + cta('Faites le calcul avec vos propres billets.', 'Créez votre événement gratuitement et voyez ce que vous touchez, billet par billet.', 'Créer mon événement')
        ),
    },
    'about': {
        'title': 'Qui sommes-nous - Evoly',
        'desc': 'Evoly est une billetterie en ligne indépendante, conçue en Belgique par Evoly Solutions : une commission simple et plafonnée, un prix affiché qui est le prix payé, et des outils pensés pour les organisateurs.',
        'crumb': 'Qui sommes-nous',
        'faq': [],
        'main': lambda p: (
            hero('qui <span class="script">sommes-nous ?</span>', 'Evoly est une billetterie en ligne indépendante, conçue en Belgique pour les organisateurs du monde entier.', 'Créer mon premier événement')
            + block('Notre conviction', '<p class="pg__p">Vendre des billets devrait être simple, rapide et honnête. Une commission claire et plafonnée, aucun frais caché pour vos participants, et des outils modernes, du paiement en un tap au plan de salle.</p>')
            + block('Nos principes', items([
                'Transparence : le prix affiché est le prix payé, toujours.',
                'Simplicité : votre événement en ligne en 60 secondes, sans formation.',
                'Respect des données : hébergement dans l’Union européenne, conformément au RGPD.',
                'Proximité : une question ? Écrivez-nous à hello@evoly.me.',
            ]), dark=True)
            + block('Qui est derrière Evoly', '<p class="pg__p">Evoly est développée et exploitée par Evoly Solutions, l’entreprise de Baptist Hecht, inscrite à la Banque-Carrefour des Entreprises sous le numéro 1043.315.766.</p>')
            + cta('Envie d’essayer ?', 'Gratuit, sans engagement et sans carte bancaire.', 'Commencer gratuitement')
        ),
    },
}

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
        graph.append({'@type': 'Organization', '@id': f'{SITE}/#organisation', 'name': 'Evoly', 'legalName': 'Evoly Solutions', 'url': f'{SITE}/', 'email': 'hello@evoly.me', 'founder': {'@type': 'Person', 'name': 'Baptist Hecht'}, 'areaServed': 'Worldwide'})
    if p['faq']:
        graph.append({'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in p['faq']]})
    return {'@context': 'https://schema.org', '@graph': graph}

def build(home, typo):
    """Pages françaises construites dans le cadre de l'accueil : {identifiant: html}."""
    out = {}
    for pid, p in PAGES.items():
        h = home
        i, j = h.index('<main id="main">'), h.index('</main>') + len('</main>')
        h = h[:i] + f'<main id="main" class="page">{typo(p["main"](p))}</main>' + h[j:]
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
