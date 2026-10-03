import { z } from "zod";

/** Validation des blocs du plan de salle, commune aux actions de l'éditeur et au plan proposé d'après une photo. */
export const sInt = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
export const num = (min: number, max: number) => z.coerce.number().min(min).max(max);
export const NUMBERING = z.enum(["ltr", "rtl", "odd-left", "odd-right"]);
export const rowLabels = z.object({ style: z.enum(["letters", "numbers"]), start: z.string().trim().min(1).max(3), skip: z.array(z.string().trim().length(1)).max(10) });
export const catRef = z.string().max(40);
export const viewUrl = { viewUrl: z.string().url().max(500).optional() };
export const blockBase = { id: z.string().max(40).nullish(), name: z.string().trim().min(1).max(40), x: num(-20000, 20000), y: num(-20000, 20000), rotation: num(-360, 360) };
export const blockSchema = z.discriminatedUnion("kind", [
  z.object({ ...blockBase, kind: z.literal("ROWS"), params: z.object({ rows: sInt(1, 100), seatsFirst: sInt(1, 200), seatsLast: sInt(1, 200), seatGap: num(16, 80), rowGap: num(16, 120), curve: num(0, 1), centerAisle: z.boolean(), aisleGap: num(0, 200), rowLabels, seatNumbering: NUMBERING, seatStart: sInt(0, 9999), categories: z.array(catRef).min(1).max(100), accessible: z.array(z.object({ row: sInt(0, 99), ends: sInt(0, 10) })).max(100), ...viewUrl }).refine((p) => p.rows * Math.max(p.seatsFirst, p.seatsLast) <= 10000, { message: "validation.tooManySeats" }) }),
  z.object({ ...blockBase, kind: z.literal("TABLE_ROUND"), params: z.object({ tables: sInt(1, 200), seats: sInt(1, 30), perRow: sInt(1, 30), tableGap: num(0, 300), labelStart: sInt(0, 9999), category: catRef, ...viewUrl }) }),
  z.object({ ...blockBase, kind: z.literal("TABLE_RECT"), params: z.object({ tables: sInt(1, 200), seatsPerSide: sInt(1, 30), endSeats: z.union([z.literal(0), z.literal(1), z.literal(2)]), perRow: sInt(1, 30), tableGap: num(0, 300), labelStart: sInt(0, 9999), category: catRef, ...viewUrl }) }),
  z.object({ ...blockBase, kind: z.literal("STANDING"), params: z.object({ width: num(40, 5000), height: num(40, 5000), capacity: sInt(1, 100000), label: z.string().trim().max(40), category: catRef, ...viewUrl }) }),
  z.object({ ...blockBase, kind: z.literal("SHAPE"), params: z.object({ shape: z.enum(["stage", "screen", "pitch", "altar", "bar", "entrance", "label"]), width: num(10, 5000), height: num(10, 5000), label: z.string().trim().max(40) }) }),
]);
