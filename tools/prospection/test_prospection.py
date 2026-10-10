"""Tests du script de prospection, avec des serveurs de messagerie simulés : python3 -m unittest test_prospection"""
import json
import tempfile
import unittest
from datetime import date, datetime, timedelta
from email.message import EmailMessage
from pathlib import Path
from zoneinfo import ZoneInfo

import prospection as P

TZ = ZoneInfo("Europe/Brussels")


class FauxExpediteur:
    envoyes: list = []

    def __init__(self, boite):
        self.boite = boite

    def envoyer(self, msg):
        FauxExpediteur.envoyes.append(msg)


class FausseBoite:
    recus: dict = {}

    def __init__(self, boite):
        self.boite = boite

    def __enter__(self):
        return self

    def __exit__(self, *e):
        pass

    def messages_depuis(self, depuis):
        return FausseBoite.recus.get(self.boite["adresse"], [])

    def copier_envoye(self, msg):
        pass


def reponse(de, a_qui, texte, sujet="Re: Vos préventes", auto=False):
    m = EmailMessage()
    m["From"] = de
    m["To"] = a_qui
    m["Subject"] = sujet
    if auto:
        m["Auto-Submitted"] = "auto-replied"
    m.set_content(texte)
    return m


def rebond(adresse, boite):
    m = EmailMessage()
    m["From"] = "Mail Delivery System <mailer-daemon@ovh.net>"
    m["To"] = boite
    m["Subject"] = "Undelivered Mail Returned to Sender"
    m.set_content(f"This is the mail system. The following address failed: <{adresse}> 550 user unknown")
    return m


class Prospection(unittest.TestCase):
    def setUp(self):
        FauxExpediteur.envoyes = []
        FausseBoite.recus = {}
        self.dir = Path(tempfile.mkdtemp())
        self.cfg = {
            "fuseau": "Europe/Brussels", "heures": ["00:00", "23:59"], "jours_ouvres": [1, 2, 3, 4, 5, 6, 7], "delai_secondes": [0, 0],
            "arret_si_rebonds_pourcent": 3, "signature": "Baptist Hecht\nEvoly",
            "boites": [
                {"nom": "Baptist", "adresse": "baptist@evolytickets.com", "debut": "2026-01-01", "montee_en_charge": [[99999, 2]], "smtp": {}, "imap": {}},
                {"nom": "Baptist", "adresse": "hello@evolytickets.com", "debut": "2026-01-01", "montee_en_charge": [[99999, 2]], "smtp": {}, "imap": {}},
            ],
        }
        self.db = P.base(self.dir / "etat.sqlite")
        self.jour = datetime(2026, 10, 13, 10, 0, tzinfo=TZ)
        P.maintenant = lambda cfg: self.jour

    def lot(self, emails, nom="lot"):
        f = self.dir / f"{nom}.json"
        f.write_text(json.dumps({"lot": nom, "emails": emails}), encoding="utf-8")
        return f

    def e(self, i, **x):
        d = {"a": f"comite{i}@cercle{i}.be", "organisation": f"Cercle {i}", "objet": "Vos préventes", "message": f"Bonjour Cercle {i},\nvotre bal…",
             "relance": {"apres_jours": 7, "message": "Je me permets de revenir vers vous."}}
        d.update(x)
        return d

    def envoyer(self):
        return P.envoyer(self.db, self.cfg, expediteur_cls=FauxExpediteur, boite_cls=FausseBoite, dormir=lambda s: None)

    def statut(self, adresse):
        return self.db.execute("SELECT statut FROM prospects WHERE email = ?", (adresse,)).fetchone()[0]

    def test_import_ignore_doublons_adresses_invalides_et_exclusions(self):
        self.db.execute("INSERT INTO exclusions VALUES ('comite9@cercle9.be', 'refus', '2026-10-01')")
        ajoutes, ignores = P.importer_lot(self.db, self.cfg, self.lot([self.e(1), self.e(1), self.e(2, a="pas-une-adresse"), self.e(9)]))
        self.assertEqual(ajoutes, 1)
        self.assertEqual(len(ignores), 3)

    def test_rotation_entre_boites_et_plafonds(self):
        P.importer_lot(self.db, self.cfg, self.lot([self.e(i) for i in range(5)]))
        self.assertEqual(self.envoyer(), 4)
        expediteurs = sorted(m["From"] for m in FauxExpediteur.envoyes)
        self.assertEqual(sum("baptist@" in f for f in expediteurs), 2)
        self.assertEqual(sum("hello@" in f for f in expediteurs), 2)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM prospects WHERE statut = 'en_attente'").fetchone()[0], 1)
        m = FauxExpediteur.envoyes[0]
        corps = m.get_content()
        self.assertIn("Baptist Hecht", corps)
        self.assertIn("répondez simplement « stop »", corps)
        self.assertEqual(m.get_content_type(), "text/plain")
        self.assertEqual(len({x["Message-ID"] for x in FauxExpediteur.envoyes}), 4)

    def test_relance_unique_dans_le_meme_fil(self):
        P.importer_lot(self.db, self.cfg, self.lot([self.e(1)]))
        self.envoyer()
        premier = FauxExpediteur.envoyes[0]
        self.jour += timedelta(days=7)
        self.assertEqual(self.envoyer(), 1)
        relance = FauxExpediteur.envoyes[1]
        self.assertEqual(relance["Subject"], "Re: Vos préventes")
        self.assertEqual(relance["In-Reply-To"], premier["Message-ID"])
        self.assertIn("> Bonjour Cercle 1,", relance.get_content())
        self.assertEqual(relance["From"], premier["From"])
        self.jour += timedelta(days=7)
        self.assertEqual(self.envoyer(), 0)
        self.assertEqual(self.statut("comite1@cercle1.be"), "relance")

    def test_une_reponse_annule_la_relance(self):
        P.importer_lot(self.db, self.cfg, self.lot([self.e(1)]))
        self.envoyer()
        boite = FauxExpediteur.envoyes[0]["From"].addresses[0].addr_spec
        FausseBoite.recus[boite] = [reponse("Léa <comite1@cercle1.be>", boite, "Bonjour, ça nous intéresse !")]
        self.jour += timedelta(days=7)
        self.assertEqual(self.envoyer(), 0)
        self.assertEqual(self.statut("comite1@cercle1.be"), "repondu")

    def test_stop_exclut_pour_toujours_et_reponse_automatique_ignoree(self):
        P.importer_lot(self.db, self.cfg, self.lot([self.e(1), self.e(2)]))
        self.envoyer()
        par_boite = {}
        for m in FauxExpediteur.envoyes:
            par_boite.setdefault(m["From"].addresses[0].addr_spec, []).append(m["To"])
        for boite, destinataires in par_boite.items():
            FausseBoite.recus[boite] = [
                reponse("comite1@cercle1.be", boite, "Stop merci, pas intéressés.") if d == "comite1@cercle1.be" else reponse(d, boite, "Je suis absent", "Réponse automatique", auto=True)
                for d in destinataires
            ]
        P.relever(self.db, self.cfg, FausseBoite)
        self.assertEqual(self.statut("comite1@cercle1.be"), "refus")
        self.assertEqual(self.statut("comite2@cercle2.be"), "envoye")
        ajoutes, ignores = P.importer_lot(self.db, self.cfg, self.lot([self.e(1)], "lot2"))
        self.assertEqual(ajoutes, 0)

    def test_adresses_en_erreur_exclues_et_pause_de_la_boite(self):
        self.cfg["boites"] = [dict(self.cfg["boites"][0], montee_en_charge=[[99999, 40]])]
        P.importer_lot(self.db, self.cfg, self.lot([self.e(i) for i in range(22)]))
        boite = "baptist@evolytickets.com"
        FausseBoite.recus[boite] = [rebond("comite0@cercle0.be", boite), rebond("comite1@cercle1.be", boite)]
        self.assertEqual(self.envoyer(), 20)  # contrôle dès 20 envois sur 7 jours : 2 erreurs sur 20 (10 %), pause après le 20e
        self.assertEqual(self.statut("comite0@cercle0.be"), "rebond")
        self.assertIsNotNone(self.db.execute("SELECT 1 FROM exclusions WHERE email = 'comite1@cercle1.be'").fetchone())
        self.assertIsNotNone(self.db.execute("SELECT 1 FROM pauses WHERE boite = ?", (boite,)).fetchone())

    def test_montee_en_charge(self):
        b = {"debut": "2026-10-13", "montee_en_charge": [[7, 15], [14, 25], [99999, 40]]}
        self.assertEqual(P.plafond_du_jour(b, date(2026, 10, 12)), 0)
        self.assertEqual(P.plafond_du_jour(b, date(2026, 10, 13)), 15)
        self.assertEqual(P.plafond_du_jour(b, date(2026, 10, 22)), 25)
        self.assertEqual(P.plafond_du_jour(b, date(2026, 11, 13)), 40)

    def test_hors_fenetre_rien_ne_part(self):
        self.cfg["heures"] = ["09:00", "09:30"]
        P.importer_lot(self.db, self.cfg, self.lot([self.e(1)]))
        self.assertEqual(self.envoyer(), 0)
        self.assertEqual(self.statut("comite1@cercle1.be"), "en_attente")

    def test_mode_essai_ne_touche_pas_au_vrai_etat(self):
        cfg = self.dir / "config.json"
        cfg.write_text(json.dumps(self.cfg), encoding="utf-8")
        etat = self.dir / "vrai.sqlite"
        P.main(["--config", str(cfg), "--etat-fichier", str(etat), "envoyer", str(self.lot([self.e(1), self.e(2)])), "--essai"])
        self.assertEqual(P.base(etat).execute("SELECT COUNT(*) FROM prospects").fetchone()[0], 0)
        self.assertEqual(FauxExpediteur.envoyes, [])


if __name__ == "__main__":
    unittest.main()
