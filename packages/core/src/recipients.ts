export interface Recipient {
  email: string;
  firstName: string | null;
  lastName: string | null;
}

const EMAIL = /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]{2,}$/;

/**
 * US-ORD-03 : liste d'adresses collée par l'organisateur, une par ligne. Formats acceptés :
 * « lea@exemple.be », « Léa Martin <lea@exemple.be> », « lea@exemple.be;Léa;Martin » (ou avec des virgules, comme un export de tableur).
 * Doublons retirés ; lignes invalides signalées avec leur numéro.
 */
export function parseRecipients(text: string, max = 200): { recipients: Recipient[]; errors: Array<{ line: number; value: string }>; tooMany: boolean } {
  const recipients: Recipient[] = [];
  const errors: Array<{ line: number; value: string }> = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    let email = "";
    let firstName: string | null = null;
    let lastName: string | null = null;
    const angle = /^(.*?)<([^>]+)>\s*$/.exec(line);
    if (angle) {
      email = angle[2]!.trim();
      const names = angle[1]!.trim().replace(/^"|"$/g, "").split(/\s+/).filter(Boolean);
      firstName = names[0] ?? null;
      lastName = names.slice(1).join(" ") || null;
    } else {
      const parts = line.split(/[;,\t]/).map((p) => p.trim());
      email = parts[0] ?? "";
      firstName = parts[1] || null;
      lastName = parts[2] || null;
    }
    email = email.toLowerCase();
    if (!EMAIL.test(email)) return void errors.push({ line: i + 1, value: line.slice(0, 80) });
    if (seen.has(email)) return;
    seen.add(email);
    recipients.push({ email, firstName: firstName?.slice(0, 60) ?? null, lastName: lastName?.slice(0, 60) ?? null });
  });
  return { recipients: recipients.slice(0, max), errors, tooMany: recipients.length > max };
}
