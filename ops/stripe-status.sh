#!/usr/bin/env bash
# Diagnostic du compte Stripe de la plateforme, en lecture seule : capacités (cartes, transferts,
# Bancontact), motif d'une suspension, éléments réclamés, erreurs de vérification, et ce que
# Stripe sait de l'activité (site, secteur, libellé bancaire). La clé est lue dans .env, jamais
# affichée ni passée en argument (invisible dans la liste des processus). Rien n'est modifié.
#   ops/stripe-status.sh
set -euo pipefail
cd "$(dirname "$0")/.."
key="$(grep -E '^STRIPE_SECRET_KEY=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
[ -n "$key" ] || { echo "STRIPE_SECRET_KEY absente du fichier .env"; exit 1; }
case "$key" in sk_live_*|rk_live_*) echo "mode : réel" ;; sk_test_*|rk_test_*) echo "mode : test" ;; *) echo "clé au format inattendu"; exit 1 ;; esac
get() { printf 'user = "%s:"\n' "$key" | curl -fsS --max-time 30 -K - "https://api.stripe.com/v1/$1"; }
account="$(get account)" || { echo "Stripe a refusé la demande (clé invalide ou réseau)"; exit 1; }
balance="$(get balance || echo '{}')"
ACCOUNT="$account" BALANCE="$balance" python3 - <<'PY'
import json, os
a = json.loads(os.environ["ACCOUNT"]); b = json.loads(os.environ["BALANCE"] or "{}")
caps = a.get("capabilities") or {}
print("compte :", a.get("id"), "| pays :", a.get("country"), "| paiements autorisés :", a.get("charges_enabled"), "| virements :", a.get("payouts_enabled"))
print("capacités :", ", ".join(f"{k} = {v}" for k, v in sorted(caps.items()) if k in ("card_payments", "transfers", "bancontact_payments", "link_payments")) or "aucune")
for label, r in (("exigences actuelles", a.get("requirements") or {}), ("exigences à venir", a.get("future_requirements") or {})):
    print(f"--- {label}")
    print("  motif de désactivation :", r.get("disabled_reason"))
    for k in ("currently_due", "past_due", "eventually_due", "pending_verification"):
        if r.get(k): print(f"  {k} :", ", ".join(r[k]))
    if r.get("current_deadline"): print("  échéance :", r["current_deadline"])
    for e in r.get("errors") or []: print("  erreur :", e.get("requirement"), "|", e.get("code"), "|", e.get("reason"))
p = a.get("business_profile") or {}
pay = (a.get("settings") or {}).get("payments") or {}
card = (a.get("settings") or {}).get("card_payments") or {}
print("--- activité déclarée")
print("  site :", p.get("url"), "| secteur (MCC) :", p.get("mcc"), "| nom public :", p.get("name"))
print("  description :", (p.get("product_description") or "")[:200])
print("  libellé bancaire :", pay.get("statement_descriptor"), "| préfixe carte :", card.get("statement_descriptor_prefix"))
print("  e-mail du support :", p.get("support_email"), "| site du support :", p.get("support_url"))
fmt = lambda xs: ", ".join(f"{x.get('amount', 0) / 100:.2f} {x.get('currency', '').upper()}" for x in xs or []) or "0"
print("--- solde : disponible", fmt(b.get("available")), "| en attente", fmt(b.get("pending")))
PY
