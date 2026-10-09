"""Pages du site vitrine en plus de l'accueil : plan de salle, associations, comparatif Eventbrite, qui sommes-nous.
Chaque page reprend le cadre de l'accueil (en-tête, menu, pied de page, styles) avec son propre contenu et ses
métadonnées ; i18n.py la traduit ensuite dans toutes les langues, à son adresse propre."""
import refonte
import json, re

SITE = 'https://evoly.me'
REGISTER = 'https://app.evoly.me/register'

# adresse de chaque page dans chaque langue
SLUGS = {
    'launch': {'fr': 'ouverture-des-ventes', 'en': 'ticket-launch', 'es': 'apertura-de-la-venta', 'de': 'verkaufsstart', 'it': 'apertura-vendite', 'pt': 'abertura-de-vendas', 'nl': 'verkoopstart'},
    'dynamic': {'fr': 'prix-dynamiques', 'en': 'dynamic-pricing', 'es': 'precios-dinamicos', 'de': 'dynamische-preise', 'it': 'prezzi-dinamici', 'pt': 'precos-dinamicos', 'nl': 'dynamische-prijzen'},
    'brand': {'fr': 'votre-marque', 'en': 'your-brand', 'es': 'tu-marca', 'de': 'ihre-marke', 'it': 'il-tuo-marchio', 'pt': 'a-sua-marca', 'nl': 'jouw-merk'},
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
    'launch': {
        'title': 'Ouverture des ventes programmée, décompte et prévente privée - Evoly',
        'desc': 'Programmez la publication de votre événement, faites patienter avec une page d’annonce et un décompte, prévenez les intéressés et ouvrez une prévente privée par codes.',
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
        'desc': 'Créez votre plan de salle en quelques minutes : théâtre, gala, église, conférence ou stade. Les meilleures places sont attribuées automatiquement et vos participants peuvent choisir les leurs sur le plan.',
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
        'desc': 'La billetterie en ligne des associations : 0 % de commission sur les billets gratuits, aucun don suggéré à vos participants, une commission plafonnée sur les billets payants et des bénévoles qui scannent sans compte.',
        'crumb': 'Associations',
        'faq': [
            ('Faut-il être une association pour utiliser Evoly ?', 'Non : Evoly s’adresse à tous les organisateurs. Les associations y trouvent une offre sans abonnement et sans commission sur les billets gratuits.'),
            ('Comment l’argent arrive-t-il sur le compte de l’association ?', 'Les paiements passent par Stripe : les recettes sont versées sur le compte bancaire de l’association, via son propre compte Stripe.'),
        ],
        'main': lambda p: (
            hero('la billetterie des <span class="script">associations</span>.', 'Soirée, gala, tournoi ou spectacle de fin d’année : créez votre billetterie en quelques minutes, sans abonnement et sans carte bancaire.', 'Créer la billetterie de mon association')
            + block('Pensée pour les associations', items([
                '0 % de commission sur les billets gratuits, toujours, et sans limite.',
                'Aucun pourboire ni don pré-coché : vos participants paient exactement le prix affiché.',
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
                'Vous indiquez le montant que vous souhaitez percevoir : le prix de vente est calculé automatiquement.',
                'La revente entre participants, intégrée à toutes les offres.',
                'Le plan de salle, avec les meilleures places choisies automatiquement (offre Pro).',
                'Des données hébergées dans l’Union européenne.',
            ]), dark=True)
            + block('Ce qu’Eventbrite fait bien', '<p class="pg__p">Eventbrite est une place de marché très connue, où un large public découvre des événements. Si votre priorité est d’être trouvé par des gens qui ne vous connaissent pas encore, c’est un vrai atout. Si vous vendez surtout à votre propre public, vos frais et votre marque comptent davantage.</p>')
            + cta('Faites le calcul avec vos propres billets.', 'Créez votre événement gratuitement et voyez ce que vous percevez, billet par billet.', 'Créer mon événement')
        ),
    },
    'about': {
        'title': 'Qui sommes-nous - Evoly',
        'desc': 'Evoly est une billetterie en ligne indépendante, conçue en Belgique par Evoly Solutions : une commission simple et plafonnée, un prix affiché qui est le prix payé, et des outils pensés pour les organisateurs.',
        'crumb': 'Qui sommes-nous',
        'faq': [],
        'main': lambda p: (
            hero('qui <span class="script">sommes-nous ?</span>', 'Evoly est une billetterie en ligne indépendante, conçue en Belgique pour les organisateurs d’événements.', 'Créer mon premier événement')
            + block('Notre conviction', '<p class="pg__p">Vendre des billets ne devrait réserver aucune mauvaise surprise, ni à l’organisateur ni au public. Evoly applique une commission claire et plafonnée, n’ajoute rien au prix affiché et propose des outils complets, du paiement mobile au plan de salle.</p>')
            + block('Nos principes', items([
                'Transparence : le prix affiché est le prix payé.',
                'Simplicité : votre événement en ligne en quelques minutes, sans formation.',
                'Respect des données : hébergement dans l’Union européenne, conformément au RGPD.',
                'Disponibilité : pour toute question, écrivez-nous à hello@evoly.me.',
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
        graph.append({'@type': 'Organization', '@id': f'{SITE}/#organisation', 'name': 'Evoly', 'legalName': 'Evoly Solutions', 'url': f'{SITE}/', 'sameAs': ['https://www.linkedin.com/company/evoly-tickets/', 'https://www.instagram.com/evoly.me/'], 'email': 'hello@evoly.me', 'founder': {'@type': 'Person', 'name': 'Baptist Hecht'}, 'areaServed': 'Worldwide'})
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
