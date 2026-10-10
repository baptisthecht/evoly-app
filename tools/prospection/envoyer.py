#!/usr/bin/env python3
"""
Envoi des lots de prospection d'Evoly, rédigés au cas par cas.

    python3 envoyer.py lots/2026-10-27.json            envoie le lot
    python3 envoyer.py lots/2026-10-27.json --essai    montre ce qui partirait, sans rien envoyer

Relancer la même commande après une interruption reprend là où l'envoi s'est arrêté : une adresse déjà contactée
(envoyes.csv) ou exclue (exclus.txt, une adresse par ligne) n'est jamais réécrite.
"""
from __future__ import annotations

import argparse
import csv
import getpass
import imaplib
import json
import random
import re
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
ADRESSE = re.compile(r"^[^\s@;,<>\"]+@[^\s@;,<>\"]+\.[A-Za-z]{2,}$")
DESINSCRIPTION = {
    "fr": "Si vous ne souhaitez plus recevoir de message de ma part, répondez simplement « stop ».",
    "en": "If you’d rather not hear from me again, just reply “stop”.",
    "nl": "Wil je geen berichten meer van mij ontvangen? Antwoord dan gewoon ‘stop’.",
    "de": "Wenn Sie keine Nachrichten mehr von mir erhalten möchten, antworten Sie einfach „stop“.",
    "es": "Si prefieres no recibir más mensajes míos, responde simplemente «stop».",
    "it": "Se preferisci non ricevere altri messaggi da me, rispondi semplicemente «stop».",
    "pt": "Se preferir não receber mais mensagens minhas, responda simplesmente «stop».",
}


def mot_de_passe(adresse: str) -> str:
    """Trousseau du Mac ; demandé une seule fois, puis enregistré."""
    r = subprocess.run(["security", "find-generic-password", "-s", TROUSSEAU, "-a", adresse, "-w"], capture_output=True, text=True)
    if r.returncode == 0 and r.stdout.strip():
        return r.stdout.strip()
    mdp = getpass.getpass(f"Mot de passe de {adresse} (enregistré ensuite dans le trousseau du Mac) : ")
    subprocess.run(["security", "add-generic-password", "-U", "-s", TROUSSEAU, "-a", adresse, "-w", mdp], capture_output=True)
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


def exclus(dossier: Path) -> set[str]:
    f = dossier / "exclus.txt"
    if not f.exists():
        return set()
    return {l.strip().lower() for l in f.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")}


def composer(cfg: dict, boite: dict, e: dict) -> EmailMessage:
    langue = str(e.get("langue") or "fr").lower()
    langue = langue if langue in DESINSCRIPTION else "fr"
    signature = boite.get("signature") or cfg.get("signature", "")
    if isinstance(signature, dict):  # une signature par langue, le français à défaut
        signature = signature.get(langue) or signature.get("fr") or next(iter(signature.values()), "")
    msg = EmailMessage(policy=POLITIQUE)
    msg["From"] = formataddr((boite.get("nom", ""), boite["adresse"]))
    msg["To"] = e["a"]
    msg["Subject"] = e["objet"].strip()
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=boite["adresse"].split("@")[1])
    msg.set_content(f"{e['message'].strip()}\n\n{signature}\n\n{DESINSCRIPTION[langue]}\n", subtype="plain", charset="utf-8")
    return msg


def envoyer_message(boite: dict, mdp: str, msg: EmailMessage) -> None:
    hote, port = boite.get("smtp", "ssl0.ovh.net"), int(boite.get("port_smtp", 465))
    ctx = ssl.create_default_context()
    if port == 465:
        serveur = smtplib.SMTP_SSL(hote, port, context=ctx, timeout=60)
    else:
        serveur = smtplib.SMTP(hote, port, timeout=60)
        serveur.starttls(context=ctx)
    try:
        serveur.login(boite.get("identifiant", boite["adresse"]), mdp)
        serveur.send_message(msg)
    finally:
        try:
            serveur.quit()
        except Exception:
            pass


def copier_dans_envoyes(boite: dict, mdp: str, msg: EmailMessage) -> bool:
    """Copie dans le dossier « Envoyés », pour retrouver le fil et relancer à la main. Sans effet si impossible."""
    if not boite.get("imap", "ssl0.ovh.net"):
        return False
    try:
        imap = imaplib.IMAP4_SSL(boite.get("imap", "ssl0.ovh.net"), 993, ssl_context=ssl.create_default_context())
        imap.login(boite.get("identifiant", boite["adresse"]), mdp)
        dossier = boite.get("dossier_envoyes")
        if not dossier:
            for ligne in imap.list()[1] or []:
                l = ligne.decode(errors="replace")
                if "\\Sent" in l:
                    dossier = l.rsplit(' "', 1)[-1].strip('"') if l.endswith('"') else l.split()[-1]
                    break
        if dossier:
            imap.append(f'"{dossier}"', "\\Seen", imaplib.Time2Internaldate(time.time()), msg.as_bytes())
        imap.logout()
        return bool(dossier)
    except Exception:
        return False


def main(argv=None, envoi=envoyer_message, copie=copier_dans_envoyes, dormir=time.sleep, motdepasse=mot_de_passe) -> int:
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
    emails = lot.get("emails", lot if isinstance(lot, list) else [])

    deja = {l["a"].lower() for l in journal(dossier)} | exclus(dossier)
    a_envoyer, vus = [], set()
    for e in emails:
        adresse = str(e.get("a", "")).strip().lower()
        manque = [c for c in ("a", "organisation", "objet", "message") if not str(e.get(c, "")).strip()]
        if manque or not ADRESSE.match(adresse):
            print(f"  ignoré  {adresse or '?'} : {'champ manquant ' + ', '.join(manque) if manque else 'adresse invalide'}")
        elif adresse in deja:
            print(f"  ignoré  {adresse} : déjà contactée ou exclue")
        elif adresse not in vus:
            vus.add(adresse)
            a_envoyer.append(dict(e, a=adresse))
    if not a_envoyer:
        print("Rien à envoyer.")
        return 0

    aujourd_hui = datetime.now().date().isoformat()
    boites = cfg["boites"]
    restant = {b["adresse"]: int(b.get("plafond_par_jour", 15)) - sum(1 for l in journal(dossier) if l["boite"] == b["adresse"] and l["date"] == aujourd_hui) for b in boites}
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
            msg = composer(cfg, boite, e)
            if args.essai:
                print(f"[{i}/{len(a_envoyer)}] {e['a']} ({e['organisation']}) depuis {boite['adresse']}\nObjet : {msg['Subject']}\n{msg.get_content()}\n{'-' * 60}")
                restant[boite["adresse"]] -= 1
                envoyes += 1
                continue
            try:
                envoi(boite, mdp[boite["adresse"]], msg)
            except smtplib.SMTPRecipientsRefused:
                print(f"[{i}/{len(a_envoyer)}] refusée par le serveur : {e['a']} (ajoutée à exclus.txt)")
                with (dossier / "exclus.txt").open("a", encoding="utf-8") as h:
                    h.write(e["a"] + "\n")
                continue
            except smtplib.SMTPAuthenticationError:
                sys.exit(f"Mot de passe refusé pour {boite['adresse']}. Supprime-le du trousseau (security delete-generic-password -s {TROUSSEAU} -a {boite['adresse']}) et relance.")
            now = datetime.now()
            noter(dossier, {"date": now.date().isoformat(), "heure": now.strftime("%H:%M"), "boite": boite["adresse"], "a": e["a"],
                            "organisation": e["organisation"], "objet": msg["Subject"], "lot": lot.get("lot", Path(args.lot).stem), "message_id": msg["Message-ID"]})
            copie(boite, mdp[boite["adresse"]], msg)
            restant[boite["adresse"]] -= 1
            envoyes += 1
            print(f"[{i}/{len(a_envoyer)}] {now:%H:%M}  {e['a']} ({e['organisation']})")
            if i < len(a_envoyer):
                pause = random.uniform(a, b)
                print(f"          prochain envoi vers {(now + timedelta(seconds=pause)):%H:%M}")
                dormir(pause)
    except KeyboardInterrupt:
        print("\nInterrompu. Relance la même commande pour continuer : rien ne partira deux fois.")
    print(f"\n{envoyes} e-mail(s) {'simulé(s)' if args.essai else 'envoyé(s)'}.")
    return envoyes


if __name__ == "__main__":
    main()
