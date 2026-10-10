"""Tests du script d'envoi, avec un serveur de messagerie simulé : python3 -m unittest test_envoyer"""
import json
import smtplib
import tempfile
import unittest
from pathlib import Path

import envoyer as E


class Envoi(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.cfg = {"signature": {"fr": "Baptist Hecht\nEvoly", "nl": "Baptist Hecht\nEvoly (NL)"}, "delai_secondes": [0, 0],
                    "boites": [{"adresse": "baptist@evolytickets.com", "plafond_par_jour": 2}, {"adresse": "hello@evolytickets.com", "plafond_par_jour": 2}]}
        (self.dir / "config.json").write_text(json.dumps(self.cfg), encoding="utf-8")
        self.partis, self.refus = [], set()

    def lot(self, n, **x):
        emails = [dict({"a": f"comite{i}@cercle{i}.be", "organisation": f"Cercle {i}", "objet": "Vos préventes", "message": f"Bonjour Cercle {i},\nvotre bal…"}, **x) for i in range(n)]
        f = self.dir / "lot.json"
        f.write_text(json.dumps({"lot": "2026-10-27", "emails": emails}), encoding="utf-8")
        return f

    def envoi(self, boite, mdp, msg):
        if msg["To"] in self.refus:
            raise smtplib.SMTPRecipientsRefused({msg["To"]: (550, b"unknown")})
        self.partis.append(msg)

    def lancer(self, lot, *opts):
        return E.main([str(lot), "--config", str(self.dir / "config.json"), *opts], envoi=self.envoi, copie=lambda *a: True, dormir=lambda s: None, motdepasse=lambda a: "x")

    def test_envoie_avec_signature_et_refus_dans_la_langue_puis_ne_renvoie_jamais(self):
        self.cfg["boites"][0]["plafond_par_jour"] = 10
        (self.dir / "config.json").write_text(json.dumps(self.cfg), encoding="utf-8")
        self.assertEqual(self.lancer(self.lot(3, langue="nl")), 3)
        corps = self.partis[0].get_content()
        self.assertIn("Baptist Hecht\nEvoly (NL)", corps)
        self.assertIn("Antwoord dan gewoon ‘stop’", corps)
        self.assertEqual(self.partis[0].get_content_type(), "text/plain")
        self.assertEqual(len(E.journal(self.dir)), 3)
        self.assertEqual(self.lancer(self.lot(3, langue="nl")), 0)  # même lot relancé : rien ne repart
        self.assertEqual(len(self.partis), 3)

    def test_plafond_par_boite_reparti_sur_deux_boites(self):
        self.assertEqual(self.lancer(self.lot(5)), 4)
        self.assertEqual(sorted(m["From"].addresses[0].addr_spec for m in self.partis).count("hello@evolytickets.com"), 2)
        self.assertEqual(self.lancer(self.lot(5)), 0)  # plafond du jour déjà atteint

    def test_exclus_adresses_invalides_et_adresse_refusee(self):
        (self.dir / "exclus.txt").write_text("# refus\ncomite0@cercle0.be\n", encoding="utf-8")
        f = self.lot(3)
        lot = json.loads(f.read_text(encoding="utf-8"))
        lot["emails"].append({"a": "pas-une-adresse", "organisation": "X", "objet": "Y", "message": "Z"})
        f.write_text(json.dumps(lot), encoding="utf-8")
        self.refus = {"comite1@cercle1.be"}
        self.assertEqual(self.lancer(f), 1)
        self.assertIn("comite1@cercle1.be", E.exclus(self.dir))

    def test_essai_ne_laisse_aucune_trace(self):
        self.assertEqual(self.lancer(self.lot(2), "--essai"), 2)
        self.assertEqual(self.partis, [])
        self.assertEqual(E.journal(self.dir), [])


if __name__ == "__main__":
    unittest.main()
