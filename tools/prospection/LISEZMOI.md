# Prospection d'Evoly

Chaque jour, Claude rédige un lot d'e-mails écrits au cas par cas, un par organisation, et te le donne en fichier JSON. Ce script l'envoie depuis ton Mac, à un rythme humain, et s'occupe du reste : relance, réponses, refus et adresses en erreur.

## 1. Une seule fois : le domaine dédié

**Ne prospecte jamais depuis evoly.me** : les billets de tes clients partent de ce domaine, et sa réputation doit rester intacte. Il te faut un domaine à part, par exemple `evolytickets.com`.

1. Achète le domaine chez OVH et crée une boîte e-mail, par exemple `baptist@evolytickets.com`.
2. Dans la zone DNS du domaine :
   - SPF, enregistrement TXT sur le domaine : `v=spf1 include:mx.ovh.com ~all` ;
   - DKIM : active-le dans l'espace client OVH, rubrique e-mails du domaine ;
   - DMARC, enregistrement TXT `_dmarc` : `v=DMARC1; p=none; rua=mailto:baptist@evoly.me`, puis `p=quarantine` après trois semaines sans problème.
3. Redirige le site du domaine vers `https://evoly.me` : une personne qui tape l'adresse doit tomber sur Evoly.

## 2. Une seule fois : chauffer la boîte (deux semaines)

Avant le premier lot, sers-toi de la boîte normalement : écris à des amis et à des collègues qui te répondent, inscris-toi à quelques lettres d'information. Une boîte neuve qui envoie d'un coup à des inconnus finit en spam.

Ensuite, le script monte en charge tout seul : 15 e-mails par jour la première semaine, 25 la deuxième, puis 40. Pour aller au-delà, ajoute une deuxième puis une troisième boîte, chacune avec sa propre date de début : on ajoute des boîtes, on ne pousse pas une seule boîte.

## 3. Une seule fois : l'installation

1. Place ce dossier dans tes Documents.
2. Dans le Terminal, vérifie Python : `python3 --version` doit afficher 3.9 ou plus. Sinon, macOS te propose d'installer les outils de développement : accepte.
3. Copie `config.exemple.json` en `config.json` et complète-le : adresse de la boîte, signature, date de `debut` (le premier jour de prospection). La signature peut être un seul texte, ou un texte par langue : `"signature": { "fr": "…", "nl": "…", "en": "…" }`.
4. Enregistre le mot de passe de la boîte dans le trousseau de ton Mac, jamais dans un fichier :
   ```
   security add-generic-password -s evoly-prospection -a baptist@evolytickets.com -w
   ```
5. Teste :
   ```
   cd ~/Documents/evoly-prospection
   python3 prospection.py verifier
   python3 prospection.py envoyer lots/exemple.json --essai
   ```
   `verifier` se connecte à la boîte sans rien envoyer ; `--essai` montre ce qui partirait, sans rien envoyer ni enregistrer.

Les serveurs indiqués (`ssl0.ovh.net`) sont ceux de l'offre e-mail classique d'OVH : vérifie-les dans ton espace client si tu prends une autre offre.

## 4. Chaque jour

1. Demande à Claude : « Prépare le lot du jour, 15 e-mails. » Une fois par semaine, joins le fichier de `python3 prospection.py exporter`, pour qu'il sache qui a déjà été contacté et qui a répondu.
2. Enregistre le fichier reçu dans le dossier `lots`, par exemple `lots/2026-10-27.json`.
3. Relis-le en une minute : `python3 prospection.py relire lots/2026-10-27.json`. Les alertes s'affichent sous chaque e-mail.
4. Double-clique sur `Envoyer.command`. Laisse le Mac allumé et branché : les e-mails partent entre 9 h et 17 h 30, espacés de 3 à 8 minutes. Si tu dois partir, Ctrl + C : tout ce qui est parti est enregistré, et le reste partira au prochain lancement.
5. Les réponses arrivent dans ta boîte comme d'habitude. `python3 prospection.py reponses` en fait le résumé, et `python3 prospection.py etat` montre où tu en es.

## Ce que le script fait tout seul

- **Une seule relance**, 7 jours après, dans le même fil, avec ton premier message cité.
- **Une réponse arrête la relance.** Une réponse automatique (absence) ne l'arrête pas.
- **« stop » ou un refus clair** : l'adresse est exclue pour toujours, même si elle revient dans un lot.
- **Adresse en erreur** : exclue aussi. Si plus de 3 % des adresses d'une boîte sont en erreur sur 7 jours, la boîte se met en pause : préviens Claude avant de la relancer avec `reprendre`.
- **Chaque e-mail** se termine par ta signature et une phrase pour refuser les prochains messages, dans la langue du destinataire.
- **Une copie de chaque envoi** est rangée dans ton dossier « Envoyés ».

## Les règles

Je ne suis pas juriste, mais en Belgique la prospection par e-mail est admise vers les adresses génériques d'organisations (`comite@`, `info@`), à condition de dire qui tu es, de permettre de refuser simplement et de ne jamais recontacter quelqu'un qui a refusé. Le script s'en charge, et `relire` signale les adresses qui ont l'air personnelles.

## Le format d'un lot

```json
{
  "lot": "2026-10-27",
  "emails": [
    {
      "id": "2026-10-27-01",
      "a": "comite@cercle.be",
      "organisation": "Cercle d'exemple (ULB)",
      "langue": "fr",
      "objet": "Les préventes de votre bal d'hiver",
      "message": "Bonjour, …",
      "relance": { "apres_jours": 7, "message": "Bonjour, je me permets de revenir vers vous…" },
      "source": "https://…",
      "pourquoi": "Bal de 500 personnes le 6 décembre."
    }
  ]
}
```

`a`, `organisation`, `objet` et `message` sont obligatoires. Sans `relance`, aucune relance n'est envoyée. La signature et la phrase de refus sont ajoutées par le script : elles ne sont pas dans le message.

## Commandes

| Commande                  | Ce qu'elle fait                                                   |
| ------------------------- | ----------------------------------------------------------------- |
| `verifier`                | Configuration, mots de passe et connexion aux boîtes              |
| `relire LOT`              | Relecture d'un lot avec les alertes                               |
| `envoyer [LOT] [--essai]` | Envoi dans la journée ; sans lot, reprend la file et les relances |
| `reponses`                | Nouvelles réponses, refus et adresses en erreur                   |
| `etat`                    | Plafond du jour, erreurs et statuts                               |
| `exporter [fichier.csv]`  | Tous les prospects et leur statut                                 |
| `exclure ADRESSE`         | Ne plus jamais écrire à cette adresse                             |
| `reprendre BOITE`         | Relancer une boîte mise en pause                                  |

L'historique est dans `etat.sqlite`, à côté du script : ne le supprime pas, c'est lui qui empêche de recontacter une personne.
