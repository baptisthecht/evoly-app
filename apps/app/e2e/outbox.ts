import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DIR = process.env.EMAIL_OUTBOX_DIR ?? "/tmp/evoly-outbox";

type OutboxEmail = {
  to: string;
  template: string;
  subject: string;
  text: string;
  attachments?: Array<{ filename: string; contentType: string; size: number }>;
};

/** Dernier e-mail d'un modèle donné, écrit par l'app dans la boîte d'envoi locale. */
export async function lastEmail(
  to: string,
  template: string,
): Promise<OutboxEmail> {
  for (let i = 0; i < 50; i++) {
    const files = (() => {
      try {
        return readdirSync(DIR)
          .filter((f) => f.endsWith(".json"))
          .sort()
          .reverse();
      } catch {
        return [];
      }
    })();
    for (const f of files) {
      // fichier illisible (incomplet ou retiré entre-temps, les parcours tournent en parallèle) : ignoré pour ce tour,
      // relu au suivant, au lieu de faire échouer le parcours
      let m: OutboxEmail;
      try {
        m = JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as OutboxEmail;
      } catch {
        continue;
      }
      if (m.to === to && m.template === template) return m;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`E-mail ${template} introuvable pour ${to}`);
}

export function firstLink(text: string): string {
  const m = text.match(/https?:\/\/\S+/);
  if (!m) throw new Error("Aucun lien dans l'e-mail");
  return m[0];
}
