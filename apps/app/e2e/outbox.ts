import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DIR = process.env.EMAIL_OUTBOX_DIR ?? "/tmp/evoly-outbox";

/** Dernier e-mail d'un modèle donné, écrit par l'app dans la boîte d'envoi locale. */
export async function lastEmail(
  to: string,
  template: string,
): Promise<{ subject: string; text: string; attachments?: Array<{ filename: string; contentType: string; size: number }> }> {
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
      const m = JSON.parse(readFileSync(path.join(DIR, f), "utf8"));
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
