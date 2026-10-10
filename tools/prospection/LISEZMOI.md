# Envoi des lots de prospection d'Evoly

Une seule commande, qui envoie le lot d'e-mails rédigés au cas par cas par Claude :

```
python3 envoyer.py lots/2026-10-27.json
```

Les réponses et les relances se font à la main, dans ta boîte e-mail.

## Une seule fois

1. **Un domaine dédié.** Ne prospecte jamais depuis evoly.me : les billets de tes clients partent de ce domaine. Achète par exemple `evolytickets.com` chez OVH, crée une boîte (`baptist@evolytickets.com`), puis dans sa zone DNS :
   - SPF, enregistrement TXT : `v=spf1 include:mx.ovh.com ~all` ;
   - DKIM : à activer dans l'espace client OVH, rubrique e-mails du domaine ;
   - DMARC, enregistrement TXT `_dmarc` : `v=DMARC1; p=none; rua=mailto:baptist@evoly.me`.

   Redirige aussi le site du domaine vers `https://evoly.me`.

2. **Deux semaines de chauffe.** Avant le premier lot, utilise la boîte normalement. Ensuite, monte progressivement le plafond dans `config.json` : 15 par jour la première semaine, 25 la deuxième, puis 40. Au-delà, ajoute une deuxième boîte plutôt que de pousser la première.
3. **L'installation.** Place ce dossier dans tes Documents. Dans le Terminal, `python3 --version` doit afficher 3.9 ou plus (sinon, accepte l'installation des outils de développement que propose macOS). Copie `config.exemple.json` en `config.json`, et indique ta boîte, ta signature et ton plafond.
4. **Un essai.** `python3 envoyer.py lots/exemple.json --essai` montre ce qui partirait, sans rien envoyer.

## Chaque jour

1. Enregistre le lot reçu de Claude dans le dossier `lots`.
2. Dans le Terminal :
   ```
   cd ~/Documents/evoly-prospection
   caffeinate -i python3 envoyer.py lots/2026-10-27.json
   ```
   Astuce : tape `caffeinate -i python3 envoyer.py ` puis glisse le fichier du lot dans la fenêtre du Terminal. `caffeinate` garde le Mac éveillé pendant l'envoi.
3. La première fois, le mot de passe de la boîte est demandé, puis enregistré dans le trousseau du Mac.

Les e-mails partent un par un, espacés de 2 à 5 minutes. Si tu dois t'arrêter, Ctrl + C, puis relance la même commande plus tard : rien ne part deux fois.

## Ce que fait le script

- Il ajoute ta signature et une phrase pour refuser les prochains messages, dans la langue du destinataire : c'est obligatoire en prospection.
- Il envoie en texte brut, espacé, sans dépasser le plafond du jour de chaque boîte, en répartissant les envois entre tes boîtes.
- Il range une copie de chaque e-mail dans ton dossier « Envoyés », pour relancer à la main dans le même fil.
- Il n'écrit jamais deux fois à la même adresse, ni à une adresse exclue.

## Les deux fichiers à connaître

- **`envoyes.csv`** : le journal de tout ce qui est parti. Envoie-le à Claude une fois par semaine, pour qu'il ne te propose pas une organisation déjà contactée.
- **`exclus.txt`** : une adresse par ligne. Quand quelqu'un répond « stop », ajoute son adresse ici : elle ne sera plus jamais contactée. Les adresses refusées par le serveur y sont ajoutées automatiquement.

## Le format d'un lot

```json
{
  "lot": "2026-10-27",
  "emails": [
    {
      "a": "comite@cercle.be",
      "organisation": "Cercle d'exemple (ULB)",
      "langue": "fr",
      "objet": "Les préventes de votre bal d'hiver",
      "message": "Bonjour, …",
      "source": "https://…",
      "pourquoi": "Bal de 500 personnes le 6 décembre."
    }
  ]
}
```

`a`, `organisation`, `objet` et `message` sont obligatoires ; `source` et `pourquoi` servent à ta relecture. La signature peut être un seul texte ou un texte par langue : `"signature": { "fr": "…", "nl": "…" }`.

## Plusieurs boîtes

Ajoute une entrée dans `boites`, avec son propre plafond. Le script répartit les envois entre elles.

## Les règles

Je ne suis pas juriste, mais en Belgique la prospection par e-mail est admise vers les adresses génériques d'organisations (`comite@`, `info@`), à condition de dire qui tu es, de permettre de refuser simplement et de ne jamais recontacter quelqu'un qui a refusé.
