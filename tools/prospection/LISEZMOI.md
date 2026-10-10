# Envoi des lots de prospection d'Evoly

```
python3 envoyer.py lots/2026-10-27.json
```

Le script envoie chaque e-mail du lot exactement tel qu'il est écrit (objet et message), un toutes les 2 à 5 minutes, sans dépasser le plafond du jour de chaque boîte. Si tu relances la même commande après une interruption, rien ne part deux fois.

## Installation (une seule fois)

1. Place ce dossier dans tes Documents. Dans le Terminal, `python3 --version` doit afficher 3.9 ou plus (sinon, accepte l'installation des outils de développement que propose macOS).
2. Copie `config.exemple.json` en `config.json` et indique ta boîte : adresse, serveur d'envoi, port et plafond par jour.
3. Essai sans rien envoyer : `python3 envoyer.py lots/exemple.json --essai`.

Au premier vrai envoi, le mot de passe de la boîte est demandé, puis enregistré dans le trousseau du Mac.

| Hébergeur de ta boîte     | `smtp`               | `port` | Mot de passe                  |
| ------------------------- | -------------------- | ------ | ----------------------------- |
| OVH                       | `ssl0.ovh.net`       | 465    | celui de la boîte             |
| Gmail ou Google Workspace | `smtp.gmail.com`     | 465    | un mot de passe d'application |
| iCloud                    | `smtp.mail.me.com`   | 587    | un mot de passe d'application |
| Outlook ou Microsoft 365  | `smtp.office365.com` | 587    | celui de la boîte             |

## Chaque jour

```
cd ~/Documents/evoly-prospection
caffeinate -i python3 envoyer.py lots/2026-10-27.json
```

`caffeinate` garde le Mac éveillé pendant l'envoi. Astuce : tape la commande sans le nom du fichier, puis glisse le lot dans la fenêtre du Terminal.

## Le format d'un lot

```json
{
  "emails": [{ "a": "comite@cercle.be", "objet": "Les préventes de votre bal d'hiver", "message": "Bonjour, …" }]
}
```

Les autres champs (organisation, source, pourquoi) servent à ta relecture et sont ignorés à l'envoi. `envoyes.csv` garde la trace de ce qui est parti.

## Plusieurs boîtes

Ajoute une entrée dans `boites`, avec son propre plafond : le script répartit les envois entre elles.
