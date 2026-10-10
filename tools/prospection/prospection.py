#!/usr/bin/env python3
"""
Prospection d'Evoly : envoi d'e-mails rédigés au cas par cas, depuis ton Mac. Mode d'emploi : LISEZMOI.md.

  python3 prospection.py verifier                  configuration, mots de passe et connexion aux boîtes
  python3 prospection.py relire lots/LOT.json      relecture d'un lot avant envoi (alertes comprises)
  python3 prospection.py envoyer lots/LOT.json     envoi du lot dans la journée (--essai : rien n'est envoyé)
  python3 prospection.py envoyer                   reprend les envois en attente et les relances du jour
  python3 prospection.py reponses                  nouvelles réponses, refus et adresses en erreur
  python3 prospection.py etat                      où tu en es, boîte par boîte
  python3 prospection.py exporter suivi.csv        tous les prospects et leur statut
  python3 prospection.py exclure adresse@x.be      ne plus jamais écrire à cette adresse
  python3 prospection.py reprendre boite@x.com     relancer une boîte mise en pause
"""
from __future__ import annotations

import argparse
import csv
import email
import email.policy
import imaplib
import json
import os
import random
import re
import shutil
import smtplib
import sqlite3
import ssl
import subprocess
import sys
import tempfile
import time
from datetime import date, datetime, timedelta
from email.message import EmailMessage
from email.utils import formataddr, formatdate, getaddresses, make_msgid, parseaddr
from pathlib import Path
from zoneinfo import ZoneInfo

ICI = Path(__file__).resolve().parent
TROUSSEAU = "evoly-prospection"
ADRESSE_RE = re.compile(r"^[^\s@;,<>\"]+@[^\s@;,<>\"]+\.[A-Za-z]{2,}$")
GENERIQUES = {"info", "contact", "comite", "bureau", "presidence", "president", "presidente", "secretariat", "secretaire", "events", "event",
              "evenements", "hello", "bonjour", "cercle", "asbl", "admin", "board", "team", "equipe", "tresorerie", "billetterie", "tickets",
              "communication", "com", "festival", "organisation", "orga", "kring", "vzw"}
STOP_RE = re.compile(r"\bstop\b|d[ée]sinscri|ne plus (?:me|nous) (?:contacter|[ée]crire)|pas int[ée]ress|retirez|remove me|unsubscribe|uitschrijven|abmelden", re.I)
AUTO_RE = re.compile(r"r[ée]ponse automatique|absen|out of office|automatic reply|auto.?reply|abwesen|afwezig|ausente|assente", re.I)
REBOND_RE = re.compile(r"mailer-daemon|postmaster|mail delivery|delivery status|undeliver|non remis|échec de la remise|returned mail", re.I)
DESINSCRIPTION = {
    "fr": "Si vous ne souhaitez plus recevoir de message de ma part, répondez simplement « stop ».",
    "en": "If you’d rather not hear from me again, just reply “stop”.",
    "nl": "Wil je geen berichten meer van mij ontvangen? Antwoord dan gewoon ‘stop’.",
    "de": "Wenn Sie keine Nachrichten mehr von mir erhalten möchten, antworten Sie einfach „stop“.",
    "es": "Si prefieres no recibir más mensajes míos, responde simplemente «stop».",
    "it": "Se preferisci non ricevere altri messaggi da me, rispondi semplicemente «stop».",
    "pt": "Se preferir não receber mais mensagens minhas, responda simplesmente «stop».",
}


def maintenant(cfg: dict) -> datetime:
    return datetime.now(ZoneInfo(cfg.get("fuseau", "Europe/Brussels")))


# ---------------------------------------------------------------- configuration et état

def charger_config(chemin: Path) -> dict:
    if not chemin.exists():
        sys.exit(f"Configuration introuvable : {chemin}. Copie config.exemple.json en config.json et complète-le (voir LISEZMOI.md).")
    cfg = json.loads(chemin.read_text(encoding="utf-8"))
    if not cfg.get("boites"):
        sys.exit("Aucune boîte d'envoi dans la configuration.")
    return cfg


def base(chemin: Path) -> sqlite3.Connection:
    db = sqlite3.connect(str(chemin))
    db.row_factory = sqlite3.Row
    db.executescript("""
    CREATE TABLE IF NOT EXISTS prospects (
      email TEXT PRIMARY KEY, organisation TEXT, langue TEXT, lot TEXT, id_lot TEXT, objet TEXT, message TEXT,
      relance_message TEXT, relance_jours INTEGER, source TEXT, pourquoi TEXT, boite TEXT, statut TEXT,
      message_id TEXT, envoye_le TEXT, relance_prevue TEXT, relance_le TEXT, repondu_le TEXT, notes TEXT, ajoute_le TEXT);
    CREATE TABLE IF NOT EXISTS envois (id INTEGER PRIMARY KEY, email TEXT, boite TEXT, type TEXT, jour TEXT, horodatage TEXT, message_id TEXT);
    CREATE TABLE IF NOT EXISTS exclusions (email TEXT PRIMARY KEY, raison TEXT, le TEXT);
    CREATE TABLE IF NOT EXISTS pauses (boite TEXT PRIMARY KEY, raison TEXT, le TEXT);
    """)
    return db


def mot_de_passe(boite: dict) -> str:
    source = boite.get("mot_de_passe", "trousseau")
    if source.startswith("env:"):
        valeur = os.environ.get(source[4:])
        if not valeur:
            sys.exit(f"Variable d'environnement {source[4:]} vide pour {boite['adresse']}.")
        return valeur
    try:
        r = subprocess.run(["security", "find-generic-password", "-s", TROUSSEAU, "-a", boite.get("identifiant", boite["adresse"]), "-w"],
                           capture_output=True, text=True, check=True)
        return r.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        sys.exit(f"Mot de passe introuvable dans le trousseau pour {boite['adresse']}. Enregistre-le une fois :\n"
                 f"  security add-generic-password -s {TROUSSEAU} -a {boite.get('identifiant', boite['adresse'])} -w")


def plafond_du_jour(boite: dict, jour: date) -> int:
    """Montée en charge : [jours depuis le début, plafond] ; 0 avant la date de début de la boîte."""
    debut = date.fromisoformat(boite["debut"])
    if jour < debut:
        return 0
    age = (jour - debut).days
    for jusqu_a, plafond in boite.get("montee_en_charge", [[7, 15], [14, 25], [99999, 40]]):
        if age < jusqu_a:
            return min(plafond, boite.get("plafond", plafond))
    return boite.get("plafond", 40)


def envoyes_du_jour(db: sqlite3.Connection, adresse: str, jour: date) -> int:
    return db.execute("SELECT COUNT(*) FROM envois WHERE boite = ? AND jour = ?", (adresse, jour.isoformat())).fetchone()[0]


def taux_rebonds(db: sqlite3.Connection, adresse: str, jour: date) -> tuple[int, int]:
    depuis = (jour - timedelta(days=7)).isoformat()
    envoyes = db.execute("SELECT COUNT(*) FROM envois WHERE boite = ? AND type = 'premier' AND jour >= ?", (adresse, depuis)).fetchone()[0]
    rebonds = db.execute("SELECT COUNT(*) FROM prospects WHERE boite = ? AND statut = 'rebond' AND envoye_le >= ?", (adresse, depuis)).fetchone()[0]
    return rebonds, envoyes


# ---------------------------------------------------------------- lots

def lire_lot(chemin: Path) -> dict:
    lot = json.loads(chemin.read_text(encoding="utf-8"))
    if not isinstance(lot.get("emails"), list):
        sys.exit(f"{chemin.name} : la clé « emails » doit contenir la liste des e-mails.")
    return lot


def alertes(e: dict) -> list[str]:
    a = []
    adresse = str(e.get("a", "")).strip().lower()
    if not ADRESSE_RE.match(adresse):
        a.append("adresse invalide")
    else:
        local = re.sub(r"[^a-z]", "", adresse.split("@")[0])
        if "." in adresse.split("@")[0] and not any(g in local for g in GENERIQUES):
            a.append("adresse qui semble personnelle : en Belgique, préfère l'adresse générique de l'organisation")
    for champ in ("organisation", "objet", "message"):
        if not str(e.get(champ, "")).strip():
            a.append(f"« {champ} » manquant")
    texte = str(e.get("message", ""))
    if len(re.findall(r"https?://", texte)) > 1:
        a.append("plus d'un lien : mauvais pour la délivrabilité")
    if len(texte) > 1600:
        a.append("message long (plus de 1 600 caractères)")
    return a


def importer_lot(db: sqlite3.Connection, cfg: dict, chemin: Path) -> tuple[int, list[str]]:
    lot = lire_lot(chemin)
    nom = lot.get("lot") or chemin.stem
    ajoutes, ignores = 0, []
    now = maintenant(cfg).isoformat(timespec="seconds")
    for e in lot["emails"]:
        adresse = str(e.get("a", "")).strip().lower()
        bloquant = [x for x in alertes(e) if "manquant" in x or "invalide" in x]
        if bloquant:
            ignores.append(f"{adresse or '?'} : {', '.join(bloquant)}")
            continue
        if db.execute("SELECT 1 FROM exclusions WHERE email = ?", (adresse,)).fetchone():
            ignores.append(f"{adresse} : exclue (refus ou adresse en erreur)")
            continue
        if db.execute("SELECT 1 FROM prospects WHERE email = ?", (adresse,)).fetchone():
            ignores.append(f"{adresse} : déjà contactée ou déjà prévue")
            continue
        relance = e.get("relance") or {}
        db.execute(
            "INSERT INTO prospects (email, organisation, langue, lot, id_lot, objet, message, relance_message, relance_jours, source, pourquoi, statut, ajoute_le) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_attente', ?)",
            (adresse, e["organisation"].strip(), (e.get("langue") or "fr").lower(), nom, e.get("id"), e["objet"].strip(), e["message"].strip(),
             (relance.get("message") or "").strip() or None, int(relance.get("apres_jours") or cfg.get("relance_apres_jours", 7)),
             e.get("source"), e.get("pourquoi"), now),
        )
        ajoutes += 1
    db.commit()
    return ajoutes, ignores


# ---------------------------------------------------------------- composition et envoi

def composer(cfg: dict, boite: dict, p: sqlite3.Row, relance: bool) -> EmailMessage:
    langue = p["langue"] if p["langue"] in DESINSCRIPTION else "fr"
    signature = boite.get("signature") or cfg.get("signature", "")
    if isinstance(signature, dict):  # une signature par langue, le français à défaut
        signature = signature.get(langue) or signature.get("fr") or next(iter(signature.values()), "")
    corps = (p["relance_message"] if relance else p["message"]).strip()
    texte = f"{corps}\n\n{signature}\n\n{DESINSCRIPTION[langue]}\n"
    if relance:
        cite = "\n".join("> " + ligne for ligne in p["message"].strip().splitlines())
        texte += f"\n\n{cite}\n"
    msg = EmailMessage(policy=email.policy.SMTP)
    msg["From"] = formataddr((boite.get("nom", ""), boite["adresse"]))
    msg["To"] = p["email"]
    msg["Subject"] = ("Re: " + p["objet"]) if relance and not p["objet"].lower().startswith("re:") else p["objet"]
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=boite["adresse"].split("@")[1])
    if relance and p["message_id"]:
        msg["In-Reply-To"] = p["message_id"]
        msg["References"] = p["message_id"]
    msg.set_content(texte, subtype="plain", charset="utf-8")
    return msg


class Expediteur:
    """Envoi SMTP authentifié ; une connexion par message, au rythme lent de la prospection."""

    def __init__(self, boite: dict):
        self.boite = boite

    def envoyer(self, msg: EmailMessage) -> None:
        s = self.boite["smtp"]
        ctx = ssl.create_default_context()
        if s.get("securite", "ssl") == "ssl":
            serveur = smtplib.SMTP_SSL(s["hote"], int(s.get("port", 465)), context=ctx, timeout=60)
        else:
            serveur = smtplib.SMTP(s["hote"], int(s.get("port", 587)), timeout=60)
            serveur.starttls(context=ctx)
        try:
            serveur.login(self.boite.get("identifiant", self.boite["adresse"]), mot_de_passe(self.boite))
            serveur.send_message(msg)
        finally:
            try:
                serveur.quit()
            except Exception:
                pass


class Boite:
    """Lecture IMAP : réponses, refus, adresses en erreur ; copie des envois dans le dossier « Envoyés »."""

    def __init__(self, boite: dict):
        self.boite = boite
        self.imap = None

    def __enter__(self):
        i = self.boite["imap"]
        self.imap = imaplib.IMAP4_SSL(i["hote"], int(i.get("port", 993)), ssl_context=ssl.create_default_context())
        self.imap.login(self.boite.get("identifiant", self.boite["adresse"]), mot_de_passe(self.boite))
        return self

    def __exit__(self, *exc):
        try:
            self.imap.logout()
        except Exception:
            pass

    def dossier_envoyes(self) -> str | None:
        voulu = self.boite.get("dossier_envoyes", "auto")
        if voulu != "auto":
            return voulu
        typ, lignes = self.imap.list()
        for ligne in lignes or []:
            l = ligne.decode(errors="replace")
            if "\\Sent" in l:
                return l.rsplit(' "', 1)[-1].strip('"') if '"' in l else l.split()[-1]
        return None

    def copier_envoye(self, msg: EmailMessage) -> None:
        dossier = self.dossier_envoyes()
        if dossier:
            self.imap.append(f'"{dossier}"', "\\Seen", imaplib.Time2Internaldate(time.time()), msg.as_bytes())

    def messages_depuis(self, depuis: date) -> list[email.message.Message]:
        self.imap.select("INBOX", readonly=True)
        typ, data = self.imap.search(None, "SINCE", depuis.strftime("%d-%b-%Y"))
        resultat = []
        for num in (data[0] or b"").split():
            typ, parts = self.imap.fetch(num, "(BODY.PEEK[HEADER] BODY.PEEK[TEXT]<0.8000>)")
            brut = b"".join(p[1] for p in parts if isinstance(p, tuple))
            resultat.append(email.message_from_bytes(brut, policy=email.policy.default))
        return resultat


def texte_de(m: email.message.Message) -> str:
    try:
        if m.is_multipart():
            morceaux = []
            for part in m.walk():
                if part.get_content_type() in ("text/plain", "message/delivery-status", "text/rfc822-headers"):
                    try:
                        morceaux.append(str(part.get_content()))
                    except Exception:
                        morceaux.append(part.get_payload(decode=True).decode(errors="replace") if part.get_payload(decode=True) else "")
            return "\n".join(morceaux)
        return str(m.get_content())
    except Exception:
        return str(m.get_payload())


def analyser_boite(db: sqlite3.Connection, cfg: dict, boite: dict, messages: list) -> list[str]:
    """Rapproche les messages reçus des prospects : réponse, refus (« stop »), réponse automatique ignorée, adresse en erreur."""
    adresse_boite = boite["adresse"]
    suivis = {r["email"]: r for r in db.execute("SELECT * FROM prospects WHERE boite = ? AND statut IN ('envoye', 'relance')", (adresse_boite,))}
    par_id = {r["message_id"]: r for r in suivis.values() if r["message_id"]}
    for r in db.execute("SELECT email, message_id FROM envois WHERE boite = ?", (adresse_boite,)):
        if r["email"] in suivis and r["message_id"]:
            par_id[r["message_id"]] = suivis[r["email"]]
    nouvelles = []
    jour = maintenant(cfg).date().isoformat()
    for m in messages:
        expediteur = parseaddr(str(m.get("From", "")))[1].lower()
        sujet = str(m.get("Subject", ""))
        corps = texte_de(m)
        if REBOND_RE.search(expediteur) or REBOND_RE.search(sujet) or m.get_content_type() == "multipart/report":
            for adresse in suivis:
                if adresse in corps.lower():
                    db.execute("UPDATE prospects SET statut = 'rebond', notes = ? WHERE email = ?", (f"adresse en erreur ({jour})", adresse))
                    db.execute("INSERT OR IGNORE INTO exclusions VALUES (?, 'adresse en erreur', ?)", (adresse, jour))
                    nouvelles.append(f"ADRESSE EN ERREUR  {adresse} ({suivis[adresse]['organisation']})")
            continue
        refs = " ".join(str(m.get(h, "")) for h in ("In-Reply-To", "References"))
        p = suivis.get(expediteur) or next((par_id[i] for i in par_id if i and i in refs), None)
        if not p:
            continue
        if str(m.get("Auto-Submitted", "no")).lower() not in ("", "no") or AUTO_RE.search(sujet):
            continue  # réponse automatique : la relance reste prévue
        if STOP_RE.search(corps.split("\n>")[0][:2000]):
            db.execute("UPDATE prospects SET statut = 'refus', repondu_le = ? WHERE email = ?", (jour, p["email"]))
            db.execute("INSERT OR IGNORE INTO exclusions VALUES (?, 'refus', ?)", (p["email"], jour))
            nouvelles.append(f"REFUS              {p['email']} ({p['organisation']}) : plus jamais contactée")
        else:
            db.execute("UPDATE prospects SET statut = 'repondu', repondu_le = ? WHERE email = ?", (jour, p["email"]))
            nouvelles.append(f"RÉPONSE            {p['email']} ({p['organisation']}) de {expediteur} : « {sujet[:70]} »")
        suivis.pop(p["email"], None)
    db.commit()
    return nouvelles


def relever(db: sqlite3.Connection, cfg: dict, boite_cls=None) -> list[str]:
    boite_cls = boite_cls or Boite
    nouvelles = []
    for b in cfg["boites"]:
        premier = db.execute("SELECT MIN(envoye_le) FROM prospects WHERE boite = ? AND statut IN ('envoye', 'relance')", (b["adresse"],)).fetchone()[0]
        if not premier:
            continue
        depuis = date.fromisoformat(premier[:10]) - timedelta(days=1)
        try:
            with boite_cls(b) as bx:
                nouvelles += analyser_boite(db, cfg, b, bx.messages_depuis(depuis))
        except Exception as err:
            print(f"  (lecture de {b['adresse']} impossible : {err})")
    return nouvelles


def file_du_jour(db: sqlite3.Connection, jour: date) -> list[tuple[str, sqlite3.Row]]:
    relances = db.execute(
        "SELECT * FROM prospects WHERE statut = 'envoye' AND relance_message IS NOT NULL AND relance_prevue <= ? ORDER BY relance_prevue", (jour.isoformat(),)
    ).fetchall()
    nouveaux = db.execute("SELECT * FROM prospects WHERE statut = 'en_attente' ORDER BY rowid").fetchall()
    return [("relance", r) for r in relances] + [("premier", r) for r in nouveaux]


def jour_ouvre(cfg: dict, t: datetime) -> bool:
    return t.isoweekday() in cfg.get("jours_ouvres", [1, 2, 3, 4, 5])


def fenetre(cfg: dict, t: datetime) -> tuple[datetime, datetime]:
    h1, h2 = cfg.get("heures", ["09:00", "17:30"])
    a = t.replace(hour=int(h1[:2]), minute=int(h1[3:]), second=0, microsecond=0)
    b = t.replace(hour=int(h2[:2]), minute=int(h2[3:]), second=0, microsecond=0)
    return a, b


def envoyer(db: sqlite3.Connection, cfg: dict, essai: bool = False, expediteur_cls=None, boite_cls=None, dormir=time.sleep) -> int:
    expediteur_cls = expediteur_cls or Expediteur
    boite_cls = boite_cls or Boite
    boites = {b["adresse"]: b for b in cfg["boites"]}
    envoyes = 0
    if not essai:
        for n in relever(db, cfg, boite_cls):
            print("  " + n)
    while True:
        t = maintenant(cfg)
        debut, fin = fenetre(cfg, t)
        if not essai:
            if not jour_ouvre(cfg, t) or t >= fin:
                reste = len(file_du_jour(db, t.date()))
                print(f"Fenêtre d'envoi terminée pour aujourd'hui. {reste} e-mail(s) en attente : relance « envoyer » demain.")
                return envoyes
            if t < debut:
                print(f"Envoi à partir de {debut:%H:%M}. En attente…")
                dormir((debut - t).total_seconds())
                continue
        jour = t.date()
        file = file_du_jour(db, jour)
        if not file:
            print("Plus rien à envoyer aujourd'hui.")
            return envoyes
        pauses = {r["boite"] for r in db.execute("SELECT boite FROM pauses")}
        restant = {a: plafond_du_jour(b, jour) - envoyes_du_jour(db, a, jour) for a, b in boites.items() if a not in pauses}
        type_envoi, p = file[0]
        if type_envoi == "relance":
            adresse_boite = p["boite"] if restant.get(p["boite"], 0) > 0 else None
            if p["boite"] not in boites or p["boite"] in pauses:
                db.execute("UPDATE prospects SET relance_prevue = NULL WHERE email = ?", (p["email"],))
                db.commit()
                continue
        else:
            dispo = sorted(((r, a) for a, r in restant.items() if r > 0), reverse=True)
            adresse_boite = dispo[0][1] if dispo else None
        if not adresse_boite:
            if type_envoi == "relance" and any(r > 0 for r in restant.values()):
                # la boîte de ce fil est pleine aujourd'hui : on passe aux autres envois, la relance attend demain
                db.execute("UPDATE prospects SET relance_prevue = ? WHERE email = ?", ((jour + timedelta(days=1)).isoformat(), p["email"]))
                db.commit()
                continue
            print(f"Plafond du jour atteint sur toutes les boîtes. {len(file)} e-mail(s) attendent demain.")
            return envoyes
        boite = boites[adresse_boite]
        msg = composer(cfg, boite, p, relance=(type_envoi == "relance"))
        etiquette = "RELANCE" if type_envoi == "relance" else "ENVOI  "
        if essai:
            print(f"\n[essai] {etiquette} {p['email']} ({p['organisation']}) depuis {adresse_boite}\nObjet : {msg['Subject']}\n{msg.get_content()[:600]}")
            db.execute("UPDATE prospects SET statut = ? WHERE email = ?", ("relance" if type_envoi == "relance" else "envoye", p["email"]))
            db.execute("INSERT INTO envois (email, boite, type, jour, horodatage, message_id) VALUES (?, ?, ?, ?, ?, ?)",
                       (p["email"], adresse_boite, type_envoi, jour.isoformat(), t.isoformat(timespec="seconds"), msg["Message-ID"]))
            envoyes += 1
            continue
        try:
            expediteur_cls(boite).envoyer(msg)
        except smtplib.SMTPRecipientsRefused:
            db.execute("UPDATE prospects SET statut = 'rebond', notes = 'refusée par le serveur' WHERE email = ?", (p["email"],))
            db.execute("INSERT OR IGNORE INTO exclusions VALUES (?, 'adresse refusée', ?)", (p["email"], jour.isoformat()))
            db.commit()
            print(f"  ADRESSE REFUSÉE  {p['email']}")
            continue
        except Exception as err:
            print(f"  Envoi impossible depuis {adresse_boite} ({err}). Boîte mise en pause : vérifie-la, puis « reprendre {adresse_boite} ».")
            db.execute("INSERT OR REPLACE INTO pauses VALUES (?, ?, ?)", (adresse_boite, f"erreur d'envoi : {err}"[:300], t.isoformat(timespec="seconds")))
            db.commit()
            continue
        now = t.isoformat(timespec="seconds")
        if type_envoi == "relance":
            db.execute("UPDATE prospects SET statut = 'relance', relance_le = ? WHERE email = ?", (now, p["email"]))
        else:
            prevue = (jour + timedelta(days=int(p["relance_jours"] or 7))).isoformat() if p["relance_message"] else None
            db.execute("UPDATE prospects SET statut = 'envoye', boite = ?, message_id = ?, envoye_le = ?, relance_prevue = ? WHERE email = ?",
                       (adresse_boite, msg["Message-ID"], now, prevue, p["email"]))
        db.execute("INSERT INTO envois (email, boite, type, jour, horodatage, message_id) VALUES (?, ?, ?, ?, ?, ?)",
                   (p["email"], adresse_boite, type_envoi, jour.isoformat(), now, msg["Message-ID"]))
        db.commit()
        envoyes += 1
        try:
            with boite_cls(boite) as bx:
                bx.copier_envoye(msg)
        except Exception:
            pass
        print(f"  {t:%H:%M}  {etiquette} {p['email']} ({p['organisation']}) depuis {adresse_boite}")
        rebonds, total = taux_rebonds(db, adresse_boite, jour)
        if total >= 20 and rebonds * 100 / total > cfg.get("arret_si_rebonds_pourcent", 3):
            db.execute("INSERT OR REPLACE INTO pauses VALUES (?, ?, ?)", (adresse_boite, f"{rebonds} adresses en erreur sur {total} envois en 7 jours", now))
            db.commit()
            print(f"  PAUSE : trop d'adresses en erreur depuis {adresse_boite} ({rebonds}/{total}). Préviens-moi avant de reprendre.")
        if envoyes % 5 == 0:
            for n in relever(db, cfg, boite_cls):
                print("  " + n)
        a, b = cfg.get("delai_secondes", [180, 480])
        dormir(random.uniform(a, b))


# ---------------------------------------------------------------- commandes

def cmd_verifier(db, cfg, args):
    jour = maintenant(cfg).date()
    for b in cfg["boites"]:
        print(f"{b['adresse']} : plafond aujourd'hui {plafond_du_jour(b, jour)} (début {b['debut']})")
        mot_de_passe(b)
        try:
            Expediteur(b)  # la connexion SMTP est testée ci-dessous sans rien envoyer
            s = b["smtp"]
            ctx = ssl.create_default_context()
            srv = smtplib.SMTP_SSL(s["hote"], int(s.get("port", 465)), context=ctx, timeout=30) if s.get("securite", "ssl") == "ssl" else smtplib.SMTP(s["hote"], int(s.get("port", 587)), timeout=30)
            if s.get("securite", "ssl") != "ssl":
                srv.starttls(context=ctx)
            srv.login(b.get("identifiant", b["adresse"]), mot_de_passe(b))
            srv.quit()
            print("  envoi (SMTP) : ok")
        except Exception as err:
            print(f"  envoi (SMTP) : ÉCHEC {err}")
        try:
            with Boite(b) as bx:
                print(f"  lecture (IMAP) : ok, dossier des envoyés : {bx.dossier_envoyes() or 'introuvable (indique-le dans dossier_envoyes)'}")
        except Exception as err:
            print(f"  lecture (IMAP) : ÉCHEC {err}")


def cmd_relire(db, cfg, args):
    lot = lire_lot(Path(args.lot))
    print(f"Lot {lot.get('lot', Path(args.lot).stem)} : {len(lot['emails'])} e-mail(s)\n")
    for i, e in enumerate(lot["emails"], 1):
        adresse = str(e.get("a", "")).strip().lower()
        a = alertes(e)
        if db.execute("SELECT 1 FROM prospects WHERE email = ?", (adresse,)).fetchone():
            a.append("déjà contactée : sera ignorée")
        if db.execute("SELECT 1 FROM exclusions WHERE email = ?", (adresse,)).fetchone():
            a.append("exclue : sera ignorée")
        print(f"{i:>2}. {e.get('organisation', '?')} <{adresse}>\n    Objet : {e.get('objet', '')}")
        print("    " + " ".join(str(e.get("message", "")).split())[:160] + "…")
        if e.get("pourquoi"):
            print(f"    Pourquoi eux : {e['pourquoi']}")
        for x in a:
            print(f"    ⚠ {x}")
        print()


def cmd_envoyer(db, cfg, args):
    if args.lot:
        if args.essai:
            ajoutes, ignores = importer_lot(db, cfg, Path(args.lot))
        else:
            ajoutes, ignores = importer_lot(db, cfg, Path(args.lot))
        print(f"{ajoutes} e-mail(s) ajouté(s) à la file." + (f" {len(ignores)} ignoré(s) :" if ignores else ""))
        for x in ignores:
            print("  - " + x)
    n = envoyer(db, cfg, essai=args.essai)
    print(f"{n} e-mail(s) {'simulé(s)' if args.essai else 'envoyé(s)'}.")


def cmd_reponses(db, cfg, args):
    nouvelles = relever(db, cfg)
    print("\n".join(nouvelles) if nouvelles else "Aucune nouvelle réponse.")


def cmd_etat(db, cfg, args):
    jour = maintenant(cfg).date()
    pauses = {r["boite"]: r["raison"] for r in db.execute("SELECT * FROM pauses")}
    for b in cfg["boites"]:
        a = b["adresse"]
        rebonds, total = taux_rebonds(db, a, jour)
        print(f"{a} : {envoyes_du_jour(db, a, jour)}/{plafond_du_jour(b, jour)} aujourd'hui · {rebonds} erreur(s) sur {total} envoi(s) en 7 jours"
              + (f" · EN PAUSE : {pauses[a]}" if a in pauses else ""))
    print()
    for statut, n in db.execute("SELECT statut, COUNT(*) FROM prospects GROUP BY statut ORDER BY 2 DESC"):
        print(f"  {statut:<11} {n}")
    repondus = db.execute("SELECT COUNT(*) FROM prospects WHERE statut IN ('repondu', 'refus')").fetchone()[0]
    contactes = db.execute("SELECT COUNT(*) FROM prospects WHERE statut NOT IN ('en_attente')").fetchone()[0]
    if contactes:
        print(f"\nTaux de réponse : {repondus * 100 // contactes} % ({repondus}/{contactes})")
    relances = db.execute("SELECT COUNT(*) FROM prospects WHERE statut = 'envoye' AND relance_prevue <= ?", (jour.isoformat(),)).fetchone()[0]
    print(f"Relances dues aujourd'hui : {relances}")


def cmd_exporter(db, cfg, args):
    cols = ["email", "organisation", "statut", "boite", "envoye_le", "relance_le", "repondu_le", "lot", "id_lot", "notes"]
    with open(args.fichier, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(cols)
        for r in db.execute(f"SELECT {', '.join(cols)} FROM prospects ORDER BY ajoute_le"):
            w.writerow([r[c] for c in cols])
    print(f"Exporté : {args.fichier}")


def cmd_exclure(db, cfg, args):
    adresse = args.adresse.strip().lower()
    jour = maintenant(cfg).date().isoformat()
    db.execute("INSERT OR REPLACE INTO exclusions VALUES (?, ?, ?)", (adresse, args.raison or "exclue à la main", jour))
    db.execute("UPDATE prospects SET statut = 'exclu' WHERE email = ? AND statut IN ('en_attente', 'envoye')", (adresse,))
    db.commit()
    print(f"{adresse} ne sera plus jamais contactée.")


def cmd_reprendre(db, cfg, args):
    db.execute("DELETE FROM pauses WHERE boite = ?", (args.boite.strip().lower(),))
    db.commit()
    print(f"{args.boite} reprend les envois.")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Prospection d'Evoly")
    parser.add_argument("--config", default=str(ICI / "config.json"))
    parser.add_argument("--etat-fichier", default=str(ICI / "etat.sqlite"))
    sub = parser.add_subparsers(dest="commande", required=True)
    sub.add_parser("verifier")
    p = sub.add_parser("relire"); p.add_argument("lot")
    p = sub.add_parser("envoyer"); p.add_argument("lot", nargs="?"); p.add_argument("--essai", action="store_true")
    sub.add_parser("reponses")
    sub.add_parser("etat")
    p = sub.add_parser("exporter"); p.add_argument("fichier", nargs="?", default="suivi.csv")
    p = sub.add_parser("exclure"); p.add_argument("adresse"); p.add_argument("raison", nargs="?")
    p = sub.add_parser("reprendre"); p.add_argument("boite")
    args = parser.parse_args(argv)
    cfg = charger_config(Path(args.config))
    chemin = Path(args.etat_fichier)
    if getattr(args, "essai", False):
        tmp = Path(tempfile.mkdtemp()) / "essai.sqlite"
        if chemin.exists():
            shutil.copy(chemin, tmp)
        chemin = tmp
        print("MODE ESSAI : rien n'est envoyé ni enregistré.\n")
    db = base(chemin)
    try:
        {"verifier": cmd_verifier, "relire": cmd_relire, "envoyer": cmd_envoyer, "reponses": cmd_reponses, "etat": cmd_etat,
         "exporter": cmd_exporter, "exclure": cmd_exclure, "reprendre": cmd_reprendre}[args.commande](db, cfg, args)
    except KeyboardInterrupt:
        print("\nInterrompu. Tout ce qui est parti est enregistré : relance « envoyer » pour continuer.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
