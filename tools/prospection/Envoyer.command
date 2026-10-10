#!/bin/bash
# Double-clic : envoie le lot le plus récent du dossier « lots », Mac maintenu éveillé jusqu'à la fin.
cd "$(dirname "$0")" || exit 1
lot=$(ls -t lots/*.json 2>/dev/null | grep -v "exemple" | head -1)
echo "Lot le plus récent : ${lot:-aucun nouveau lot (reprise des envois en attente et des relances)}"
echo
caffeinate -i python3 prospection.py envoyer ${lot:+"$lot"}
echo
read -n 1 -s -r -p "Terminé. Appuie sur une touche pour fermer."
