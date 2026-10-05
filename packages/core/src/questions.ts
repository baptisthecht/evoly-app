export type QuestionType = "TEXT" | "TEXTAREA" | "SELECT" | "MULTI_SELECT" | "CHECKBOX" | "NUMBER" | "DATE" | "PHONE" | "EMAIL";
export interface QuestionDef {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options?: string[] | null;
  scope: "ORDER" | "TICKET";
  ticketTypeIds: string[];
}

const TYPES: QuestionType[] = ["TEXT", "TEXTAREA", "SELECT", "MULTI_SELECT", "CHECKBOX", "NUMBER", "DATE", "PHONE", "EMAIL"];

/** US-QST-01 : définition d'une question (libellé, type, choix pour les listes : 2 à 30, sans doublon). */
export function validateQuestion(input: {
  label?: unknown;
  type?: unknown;
  options?: unknown;
  required?: unknown;
  scope?: unknown;
  ticketTypeIds?: unknown;
  helpText?: unknown;
}) {
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (label.length < 2 || label.length > 200) return { ok: false as const, code: "QUESTION_LABEL" };
  if (!TYPES.includes(input.type as QuestionType)) return { ok: false as const, code: "QUESTION_TYPE" };
  const type = input.type as QuestionType;
  let options: string[] | null = null;
  if (type === "SELECT" || type === "MULTI_SELECT") {
    const raw = Array.isArray(input.options) ? input.options : typeof input.options === "string" ? input.options.split("\n") : [];
    options = [...new Set(raw.map((o) => String(o).trim()).filter(Boolean))].map((o) => o.slice(0, 100));
    if (options.length < 2 || options.length > 30) return { ok: false as const, code: "QUESTION_OPTIONS" };
  }
  const ticketTypeIds = Array.isArray(input.ticketTypeIds)
    ? [...new Set(input.ticketTypeIds.filter((t): t is string => typeof t === "string" && t.length <= 40))]
    : [];
  const helpText = typeof input.helpText === "string" && input.helpText.trim() ? input.helpText.trim().slice(0, 300) : null;
  return {
    ok: true as const,
    value: {
      label,
      type,
      options,
      required: input.required === true,
      scope: input.scope === "TICKET" ? ("TICKET" as const) : ("ORDER" as const),
      ticketTypeIds,
      helpText,
    },
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ().\-/]{6,24}$/;

/** Réponse normalisée à une question, ou code d'erreur. Réponse vide non obligatoire : null (rien n'est enregistré). */
export function answerFor(
  q: Pick<QuestionDef, "type" | "required" | "options">,
  raw: unknown,
): { ok: true; value: string | number | boolean | string[] | null } | { ok: false; code: "REQUIRED" | "INVALID" } {
  const empty =
    raw == null ||
    (typeof raw === "string" && raw.trim() === "") ||
    (Array.isArray(raw) && raw.length === 0) ||
    (q.type === "CHECKBOX" && raw !== true && raw !== "true" && raw !== "on");
  if (empty) return q.required ? { ok: false, code: "REQUIRED" } : { ok: true, value: null };
  const s = typeof raw === "string" ? raw.trim() : raw;
  switch (q.type) {
    case "TEXT":
      return typeof s === "string" && s.length <= 200 ? { ok: true, value: s } : { ok: false, code: "INVALID" };
    case "TEXTAREA":
      return typeof s === "string" && s.length <= 2000 ? { ok: true, value: s } : { ok: false, code: "INVALID" };
    case "SELECT":
      return typeof s === "string" && (q.options ?? []).includes(s) ? { ok: true, value: s } : { ok: false, code: "INVALID" };
    case "MULTI_SELECT": {
      const list = Array.isArray(raw) ? [...new Set(raw.map(String))] : [];
      return list.length > 0 && list.every((o) => (q.options ?? []).includes(o)) ? { ok: true, value: list } : { ok: false, code: "INVALID" };
    }
    case "CHECKBOX":
      return { ok: true, value: true };
    case "NUMBER": {
      const n = typeof s === "number" ? s : Number(String(s).replace(",", "."));
      return Number.isFinite(n) && Math.abs(n) < 1e9 ? { ok: true, value: n } : { ok: false, code: "INVALID" };
    }
    case "DATE": {
      if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, code: "INVALID" };
      const d = new Date(`${s}T12:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? { ok: true, value: s } : { ok: false, code: "INVALID" };
    }
    case "PHONE":
      return typeof s === "string" && PHONE.test(s) ? { ok: true, value: s } : { ok: false, code: "INVALID" };
    case "EMAIL":
      return typeof s === "string" && s.length <= 200 && EMAIL.test(s) ? { ok: true, value: s.toLowerCase() } : { ok: false, code: "INVALID" };
  }
}

const applies = (q: Pick<QuestionDef, "ticketTypeIds">, ticketTypeId: string) => q.ticketTypeIds.length === 0 || q.ticketTypeIds.includes(ticketTypeId);

/** Questions posées pour une commande : par commande si un tarif concerné est choisi, par billet pour chaque billet concerné. */
export function questionsForOrder<Q extends QuestionDef>(questions: readonly Q[], lines: ReadonlyArray<{ orderItemId: string; ticketTypeId: string }>) {
  return {
    order: questions.filter((q) => q.scope === "ORDER" && lines.some((l) => applies(q, l.ticketTypeId))),
    perLine: Object.fromEntries(lines.map((l) => [l.orderItemId, questions.filter((q) => q.scope === "TICKET" && applies(q, l.ticketTypeId))])) as Record<
      string,
      Q[]
    >,
  };
}

/** Code d'accès d'un événement privé (RG-PUB-06) : insensible à la casse et aux espaces, 4 à 32 caractères. */
export function normalizeAccessCode(input: string): string | null {
  const v = input.trim().toUpperCase().replace(/\s+/g, "");
  return v.length >= 4 && v.length <= 32 && /^[A-Z0-9-]+$/.test(v) ? v : null;
}
