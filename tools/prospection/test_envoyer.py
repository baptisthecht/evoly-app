"""Tests du script d'envoi, avec un serveur de messagerie simulé : python3 -m unittest test_envoyer"""
import json
import tempfile
import unittest
from pathlib import Path

import envoyer as E


class Envoi(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.cfg = {"delai_secondes": [0, 0], "boites": [{"adresse": "a@exemple.fr", "smtp": "x", "plafond_par_jour": 2}, {"adresse": "b@exemple.fr", "smtp": "x", "plafond_par_jour": 2}]}
        (self.dir / "config.json").write_text(json.dumps(self.cfg), encoding="utf-8")
        self.partis = []

    def lot(self, n):
        f = self.dir / "lot.json"
        f.write_text(json.dumps({"emails": [{"a": f"comite{i}@cercle{i}.be", "objet": f"Objet {i}", "message": f"Message {i} exact."} for i in range(n)]}), encoding="utf-8")
        return f

    def lancer(self, lot, *opts):
        return E.main([str(lot), "--config", str(self.dir / "config.json"), *opts], envoi=lambda b, m, msg: self.partis.append(msg), dormir=lambda s: None, motdepasse=lambda a: "x")

    def test_envoie_le_message_tel_quel(self):
        self.lancer(self.lot(1))
        self.assertEqual(self.partis[0]["Subject"], "Objet 0")
        self.assertEqual(self.partis[0].get_content().strip(), "Message 0 exact.")

    def test_plafond_et_repartition_puis_reprise_sans_doublon(self):
        self.assertEqual(self.lancer(self.lot(5)), 4)
        self.assertEqual(sum(m["From"].addresses[0].addr_spec == "b@exemple.fr" for m in self.partis), 2)
        self.cfg["boites"][0]["plafond_par_jour"] = 10
        (self.dir / "config.json").write_text(json.dumps(self.cfg), encoding="utf-8")
        self.assertEqual(self.lancer(self.lot(5)), 1)  # seul le 5e part : les 4 premiers sont déjà envoyés
        self.assertEqual(len({m["To"] for m in self.partis}), 5)

    def test_essai_n_envoie_rien(self):
        self.assertEqual(self.lancer(self.lot(2), "--essai"), 2)
        self.assertEqual(self.partis, [])
        self.assertEqual(E.journal(self.dir), [])


if __name__ == "__main__":
    unittest.main()
