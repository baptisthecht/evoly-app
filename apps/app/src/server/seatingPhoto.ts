import "server-only";
import { CoreError, type BlockSpec } from "@evoly/core";
import { z } from "zod";
import { env } from "@/lib/env";
import { blockSchema } from "@/lib/seatingSchemas";
import type { OrgContext } from "./context";
import { hit } from "./rateLimit";
import { seatingMapFor, type StoredPlan } from "./seating";

/**
 * Plan de salle d'après une photo ou un PDF du plan (section 9.9) : l'image est lue par l'API de Claude, qui propose
 * des blocs au format d'Evoly ; la proposition est validée comme une saisie manuelle, montrée à l'organisateur,
 * et n'est appliquée qu'après sa confirmation. L'image n'est pas conservée.
 */
const SYSTEM = `Tu convertis la photo ou le PDF d'un plan de salle en JSON pour un logiciel de billetterie.
Réponds UNIQUEMENT par un objet JSON, sans texte autour : {"categories": 1 à 3, "blocks": [ ... ]}.
Repère : x vers la droite, y vers le bas, unité ≈ écart entre deux places voisines / 30. La scène (ou le terrain, l'écran, l'autel) est en haut, vers y = -80, centrée en x = 0.
Types de blocs (au plus 40) :
- {"kind":"SHAPE","name":"Scène","x":0,"y":-80,"rotation":0,"params":{"shape":"stage"|"screen"|"pitch"|"altar"|"bar"|"entrance"|"label","width":nombre,"height":nombre,"label":"SCÈNE"}}
- {"kind":"ROWS","name":"Parterre","x":0,"y":40,"rotation":0,"category":1,"params":{"rows":nombre,"seatsFirst":places du premier rang (le plus proche de la scène),"seatsLast":places du dernier rang,"curve":0 (droit) à 1 (arc prononcé),"centerAisle":true|false,"rowLabels":{"style":"letters"|"numbers","start":"A","skip":["I","O"]},"seatNumbering":"ltr"|"rtl"|"odd-left"|"odd-right","seatStart":1}}
  x,y = centre du premier rang ; les rangs suivants s'éloignent de la scène vers y positif ; utilise "rotation" (degrés) pour les tribunes latérales ou opposées (180 = rangs vers le haut, -90 = vers la droite, 90 = vers la gauche).
- {"kind":"TABLE_ROUND","name":"Tables","x":0,"y":0,"rotation":0,"category":1,"params":{"tables":nombre,"seats":places par table,"perRow":tables par ligne}}
- {"kind":"STANDING","name":"Fosse","x":0,"y":40,"rotation":0,"category":1,"params":{"width":nombre,"height":nombre,"capacity":nombre,"label":"FOSSE"}}
Compte les rangs et les places au mieux d'après l'image, reprends les lettres ou numéros visibles, une catégorie par zone de prix visible (sinon 1). Place les blocs sans chevauchement.`;

const proposalSchema = z.object({ categories: z.coerce.number().int().min(1).max(3).catch(1), blocks: z.array(z.record(z.string(), z.unknown())).min(1).max(40) });
const COLORS = ["#FFB8E8", "#D9B8F0", "#A9C4F2"];

/** Complète une proposition brute (valeurs par défaut, catégories c1 à c3) et la valide comme une saisie manuelle. */
export function normalizePhotoPlan(raw: unknown): StoredPlan {
  const parsed = proposalSchema.safeParse(raw);
  if (!parsed.success) throw new CoreError("PHOTO_PLAN_UNREADABLE");
  const n = parsed.data.categories;
  const key = (v: unknown) => `c${Math.min(n, Math.max(1, Number(v) || 1))}`;
  const blocks: BlockSpec[] = [];
  for (const b of parsed.data.blocks) {
    const p = (b.params ?? {}) as Record<string, unknown>;
    const base = { name: String(b.name ?? "Bloc").slice(0, 40) || "Bloc", x: Number(b.x) || 0, y: Number(b.y) || 0, rotation: Number(b.rotation) || 0 };
    const candidate =
      b.kind === "ROWS" ? { ...base, kind: "ROWS", params: { seatGap: 30, rowGap: 34, curve: 0, centerAisle: false, aisleGap: 36, rowLabels: { style: "letters", start: "A", skip: [] }, seatNumbering: "ltr", seatStart: 1, accessible: [], ...p, categories: [key(b.category)] } }
      : b.kind === "TABLE_ROUND" ? { ...base, kind: "TABLE_ROUND", params: { tableGap: 30, labelStart: 1, perRow: 4, ...p, category: key(b.category) } }
      : b.kind === "STANDING" ? { ...base, kind: "STANDING", params: { label: "ZONE DEBOUT", ...p, category: key(b.category) } }
      : b.kind === "SHAPE" ? { ...base, kind: "SHAPE", params: { label: "", ...p } }
      : null;
    const ok = candidate ? blockSchema.safeParse(candidate) : null;
    if (ok?.success) blocks.push(ok.data as unknown as BlockSpec);
  }
  if (!blocks.some((b) => b.kind !== "SHAPE")) throw new CoreError("PHOTO_PLAN_UNREADABLE");
  const focusShape = blocks.find((b) => b.kind === "SHAPE");
  return { categories: Array.from({ length: n }, (_, i) => ({ key: `c${i + 1}`, name: `Catégorie ${i + 1}`, color: COLORS[i]! })), blocks, focus: focusShape ? { x: focusShape.x, y: focusShape.y } : { x: 0, y: -80 } };
}

export async function planFromPhoto(ctx: OrgContext, eventId: string, bytes: Uint8Array, fetcher: typeof fetch = fetch): Promise<StoredPlan> {
  await seatingMapFor(ctx, eventId); // Pro et événement de l'organisation
  const key = env().ANTHROPIC_API_KEY;
  if (!key) throw new CoreError("PHOTO_PLAN_UNAVAILABLE");
  if (bytes.length === 0 || bytes.length > 8_000_000) throw new CoreError("UPLOAD_TOO_LARGE");
  const head = Buffer.from(bytes.slice(0, 12));
  const media = head.subarray(0, 4).toString("latin1") === "%PDF" ? "application/pdf" : head[0] === 0xff && head[1] === 0xd8 ? "image/jpeg" : head.subarray(1, 4).toString("latin1") === "PNG" ? "image/png" : head.subarray(8, 12).toString("latin1") === "WEBP" ? "image/webp" : null;
  if (!media) throw new CoreError("UPLOAD_TYPE");
  if ((await hit(`photo-plan:${ctx.organization.id}`, 86_400)) > 20) throw new CoreError("RATE_LIMITED");
  const data = Buffer.from(bytes).toString("base64");
  const source = media === "application/pdf" ? { type: "document", source: { type: "base64", media_type: media, data } } : { type: "image", source: { type: "base64", media_type: media, data } };
  let res: Response;
  try {
    res = await fetcher("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: env().ANTHROPIC_MODEL, max_tokens: 4000, system: SYSTEM, messages: [{ role: "user", content: [source, { type: "text", text: "Voici le plan de la salle. Réponds par le JSON demandé." }] }] }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new CoreError("PHOTO_PLAN_FAILED");
  }
  if (!res.ok) throw new CoreError("PHOTO_PLAN_FAILED");
  const body = (await res.json().catch(() => null)) as { content?: Array<{ type: string; text?: string }> } | null;
  const text = (body?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new CoreError("PHOTO_PLAN_UNREADABLE");
  }
  return normalizePhotoPlan(raw);
}
