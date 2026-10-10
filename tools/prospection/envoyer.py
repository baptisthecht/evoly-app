#!/usr/bin/env python3
"""
Envoi d'un lot d'e-mails de prospection d'Evoly, tels qu'ils sont écrits dans le fichier JSON.

    python3 envoyer.py lots/2026-10-27.json            envoie le lot
    python3 envoyer.py lots/2026-10-27.json --essai    montre ce qui partirait, sans rien envoyer
"""
from __future__ import annotations

import argparse
import csv
import getpass
import json
import random
import smtplib
import ssl
import subprocess
import sys
import time
from datetime import datetime, timedelta
from email.message import EmailMessage
from email.policy import SMTP as POLITIQUE
from email.utils import formataddr, formatdate, make_msgid
from pathlib import Path

ICI = Path(__file__).resolve().parent
TROUSSEAU = "evoly-prospection"


def mot_de_passe(identifiant: str) -> str:
    """Trousseau du Mac ; demandé une seule fois, puis enregistré."""
    r = subprocess.run(["security", "find-generic-password", "-s", TROUSSEAU, "-a", identifiant, "-w"], capture_output=True, text=True)
    if r.returncode == 0 and r.stdout.strip():
        return r.stdout.strip()
    mdp = getpass.getpass(f"Mot de passe de {identifiant} (enregistré ensuite dans le trousseau du Mac) : ")
    subprocess.run(["security", "add-generic-password", "-U", "-s", TROUSSEAU, "-a", identifiant, "-w", mdp], capture_output=True)
    return mdp


def journal(dossier: Path) -> list[dict]:
    f = dossier / "envoyes.csv"
    if not f.exists():
        return []
    with f.open(encoding="utf-8-sig", newline="") as h:
        return list(csv.DictReader(h, delimiter=";"))


def noter(dossier: Path, ligne: dict) -> None:
    f = dossier / "envoyes.csv"
    nouveau = not f.exists()
    with f.open("a", encoding="utf-8-sig" if nouveau else "utf-8", newline="") as h:
        w = csv.DictWriter(h, fieldnames=list(ligne), delimiter=";")
        if nouveau:
            w.writeheader()
        w.writerow(ligne)


def composer(boite: dict, e: dict) -> EmailMessage:
    msg = EmailMessage(policy=POLITIQUE)
    msg["From"] = formataddr((boite.get("nom", ""), boite["adresse"]))
    msg["To"] = e["a"]
    msg["Subject"] = e["objet"]
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=boite["adresse"].split("@")[1])
    msg.set_content(e["message"], subtype="plain", charset="utf-8")
    return msg


def envoyer_message(boite: dict, mdp: str, msg: EmailMessage) -> None:
    hote, port = boite["smtp"], int(boite.get("port", 465))
    ctx = ssl.create_default_context()
    serveur = smtplib.SMTP_SSL(hote, port, context=ctx, timeout=60) if port == 465 else smtplib.SMTP(hote, port, timeout=60)
    try:
        if port != 465:
            serveur.starttls(context=ctx)
        serveur.login(boite.get("identifiant", boite["adresse"]), mdp)
        serveur.send_message(msg)
    finally:
        try:
            serveur.quit()
        except Exception:
            pass


def main(argv=None, envoi=envoyer_message, dormir=time.sleep, motdepasse=mot_de_passe) -> int:
    p = argparse.ArgumentParser(description="Envoi d'un lot de prospection d'Evoly")
    p.add_argument("lot", help="fichier JSON du lot")
    p.add_argument("--essai", action="store_true", help="montre ce qui partirait, sans rien envoyer")
    p.add_argument("--config", default=str(ICI / "config.json"))
    args = p.parse_args(argv)
    config = Path(args.config)
    if not config.exists():
        sys.exit("config.json introuvable : copie config.exemple.json en config.json et indique ta boîte (voir LISEZMOI.md).")
    cfg = json.loads(config.read_text(encoding="utf-8"))
    dossier = config.parent
    lot = json.loads(Path(args.lot).read_text(encoding="utf-8"))
    emails = lot["emails"] if isinstance(lot, dict) else lot

    deja = {l["a"] for l in journal(dossier)}  # une relance de la commande ne renvoie rien
    a_envoyer = [e for e in emails if e["a"].strip().lower() not in deja]
    if len(a_envoyer) < len(emails):
        print(f"{len(emails) - len(a_envoyer)} e-mail(s) déjà envoyé(s) : ignoré(s).")
    if not a_envoyer:
        print("Rien à envoyer.")
        return 0

    aujourd_hui = datetime.now().date().isoformat()
    boites = cfg["boites"]
    restant = {b["adresse"]: int(b.get("plafond_par_jour", 1000)) - sum(1 for l in journal(dossier) if l["boite"] == b["adresse"] and l["date"] == aujourd_hui) for b in boites}
    mdp = {} if args.essai else {b["adresse"]: motdepasse(b.get("identifiant", b["adresse"])) for b in boites}
    a, b = cfg.get("delai_secondes", [120, 300])
    print(("ESSAI : rien ne part.\n" if args.essai else "") + f"{len(a_envoyer)} e-mail(s) à envoyer.\n")
    envoyes = 0
    try:
        for i, e in enumerate(a_envoyer, 1):
            dispo = [x for x in boites if restant[x["adresse"]] > 0]
            if not dispo:
                print(f"\nPlafond du jour atteint. {len(a_envoyer) - envoyes} e-mail(s) restent : relance la même commande demain.")
                break
            boite = max(dispo, key=lambda x: restant[x["adresse"]])
            msg = composer(boite, e)
            if args.essai:
                print(f"[{i}/{len(a_envoyer)}] {e['a']} depuis {boite['adresse']}\nObjet : {e['objet']}\n{e['message']}\n{'-' * 60}")
            else:
                try:
                    envoi(boite, mdp[boite["adresse"]], msg)
                except smtplib.SMTPRecipientsRefused:
                    print(f"[{i}/{len(a_envoyer)}] adresse refusée par le serveur : {e['a']}")
                    continue
                except smtplib.SMTPAuthenticationError:
                    sys.exit(f"Mot de passe refusé pour {boite['adresse']} : supprime-le du trousseau (security delete-generic-password -s {TROUSSEAU} -a {boite.get('identifiant', boite['adresse'])}) et relance.")
                now = datetime.now()
                noter(dossier, {"date": now.date().isoformat(), "heure": now.strftime("%H:%M"), "boite": boite["adresse"], "a": e["a"].strip().lower(), "objet": e["objet"]})
                print(f"[{i}/{len(a_envoyer)}] {now:%H:%M}  {e['a']}")
            restant[boite["adresse"]] -= 1
            envoyes += 1
            if not args.essai and i < len(a_envoyer):
                pause = random.uniform(a, b)
                print(f"          prochain envoi vers {(datetime.now() + timedelta(seconds=pause)):%H:%M}")
                dormir(pause)
    except KeyboardInterrupt:
        print("\nInterrompu. Relance la même commande pour continuer : rien ne partira deux fois.")
    print(f"\n{envoyes} e-mail(s) {'simulé(s)' if args.essai else 'envoyé(s)'}.")
    return envoyes


if __name__ == "__main__":
    main()
