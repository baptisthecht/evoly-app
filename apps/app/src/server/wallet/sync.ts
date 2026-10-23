import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { appleCredentials, type AppleCredentials } from "./apple";
import {
  googleCredentials,
  googleWalletClaims,
  type GoogleCredentials,
} from "./google";
import { googleAccessToken, patchGoogle } from "./googleApi";
import { sendApplePushes } from "./push";
import {
  walletFingerprint,
  walletTicketById,
  type WalletTicket,
} from "./ticket";

type Deps = {
  apple?: AppleCredentials | null;
  google?: GoogleCredentials | null;
  push?: typeof sendApplePushes;
  fetch?: typeof fetch;
};

/**
 * RG-POST-04 : passes Wallet tenus à jour, toutes les 5 minutes. Seuls les billets ajoutés à un portefeuille sont suivis
 * (téléphone inscrit chez Apple, bouton Google utilisé) ; un pass n'est renvoyé que si ce qu'il affiche a changé (événement,
 * date, lieu, tarif, titulaire, place, billet désactivé) : un passage à l'entrée ne déclenche rien.
 */
export async function syncWalletPasses(deps: Deps = {}, now = new Date()) {
  const apple = deps.apple === undefined ? appleCredentials() : deps.apple;
  const google = deps.google === undefined ? googleCredentials() : deps.google;
  const tickets = await db.ticket.findMany({
    where: {
      OR: [{ walletGoogle: true }, { walletRegistrations: { some: {} } }],
      event: { startsAt: { gt: new Date(now.getTime() - 30 * 86_400_000) } },
    },
    select: {
      id: true,
      walletHash: true,
      walletGoogle: true,
      walletRegistrations: { select: { pushToken: true } },
    },
    take: 5000,
  });
  const tokens = new Set<string>();
  const forGoogle: Array<WalletTicket & { valid: boolean }> = [];
  let changed = 0;
  for (const tk of tickets) {
    const t = await walletTicketById(tk.id);
    if (!t) continue;
    const hash = walletFingerprint(t);
    if (hash === tk.walletHash) continue;
    changed++;
    await db.ticket.update({
      where: { id: tk.id },
      data: { walletHash: hash, walletUpdatedAt: now },
    });
    for (const r of tk.walletRegistrations) tokens.add(r.pushToken);
    if (tk.walletGoogle) forGoogle.push(t);
  }
  let applePushes = 0;
  if (apple && tokens.size > 0) {
    const gone = await (deps.push ?? sendApplePushes)([...tokens], apple);
    applePushes = tokens.size - gone.length;
    if (gone.length > 0)
      await db.walletRegistration.deleteMany({
        where: { pushToken: { in: gone } },
      });
  }
  let googlePatches = 0;
  if (google && forGoogle.length > 0) {
    const token = await googleAccessToken(google, deps.fetch);
    const classes = new Set<string>();
    for (const t of forGoogle) {
      const { eventTicketClasses, eventTicketObjects } = googleWalletClaims(
        t,
        google,
        env().NEXT_PUBLIC_APP_URL,
        now,
      ).payload;
      const cls = eventTicketClasses[0]!;
      const obj = eventTicketObjects[0]!;
      if (!classes.has(cls.id)) {
        classes.add(cls.id);
        await patchGoogle("eventTicketClass", cls.id, cls, token, deps.fetch);
        googlePatches++;
      }
      await patchGoogle(
        "eventTicketObject",
        obj.id,
        { ...obj, state: t.valid ? "ACTIVE" : "INACTIVE" },
        token,
        deps.fetch,
      );
      googlePatches++;
    }
  }
  return { checked: tickets.length, changed, applePushes, googlePatches };
}
