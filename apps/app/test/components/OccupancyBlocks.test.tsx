import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { EmailPreview } from "@/components/email/EmailPreview";
import { EmbedBook, EmbedHeight } from "@/components/public/Embed";
import { sanitizeEmbedEvent } from "@/components/public/embedEvents";
import { OccupancyPlan } from "@/components/seating/OccupancyPlan";
import { Fr } from "./intl";

vi.mock("@/app/o/[orgSlug]/marketing/campaigns/actions", () => ({
  previewDraftAction: vi.fn(),
}));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const e = fr.emailEditor as Record<string, string>;
const doc = { type: "doc" as const, content: [] };
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("plan d'occupation : tous les types de blocs", () => {
  it("scène, fosse debout, table ronde et gradin avec ses rangées : affichés, comptes annoncés", () => {
    const seat = (
      id: string,
      blockId: string | null,
      row: string,
      label: string,
      state: string,
      holder: string | null,
      x: number,
      y: number,
    ) => ({
      id,
      x,
      y,
      blockId,
      row,
      label,
      state,
      holder,
      categoryId: "c1",
      accessible: state === "FREE",
    });
    const data = {
      blocks: [
        {
          id: "b1",
          kind: "SHAPE",
          name: "Scène",
          x: 0,
          y: -120,
          rotation: 0,
          params: { shape: "stage", w: 200, h: 40, label: "Scène" },
        },
        {
          id: "b2",
          kind: "STANDING",
          name: "Fosse",
          x: 0,
          y: 220,
          rotation: 0,
          params: { w: 200, h: 80, category: "c1", capacity: 100 },
        },
        {
          id: "b3",
          kind: "TABLE_ROUND",
          name: "Table 1",
          x: 320,
          y: 0,
          rotation: 0,
          params: { seats: 2 },
        },
        {
          id: "b4",
          kind: "ROWS",
          name: "Gradin",
          x: 0,
          y: 360,
          rotation: 0,
          params: { rows: 1, seats: 2 },
        },
      ],
      rows: [{ id: "r1", name: "G", blockId: "b4" }],
      categories: [{ id: "c1", color: "#FFB8E8" }],
      counts: { entered: 1, sold: 2, free: 2, blocked: 0 },
      seats: [
        seat("s1", "b3", "T1", "1", "IN", "Léa Martin", 300, 0),
        seat("s2", "b3", "T1", "2", "FREE", null, 340, 0),
        seat("s3", "b4", "G", "1", "SOLD", "Tom Dubois", 0, 360),
        seat("s4", "b4", "G", "2", "FREE", null, 30, 360),
      ],
    };
    render(
      <Fr>
        <OccupancyPlan data={data as never} />
      </Fr>,
    );
    const o = fr.occupancy as Record<string, string>;
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      o.planLabel!.replace("{entered}", "1").replace("{sold}", "2"),
    );
    expect(screen.getByText("Léa Martin")).toBeTruthy();
    expect(screen.getByText("Tom Dubois")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(3); // en-tête et deux places occupées
  });
});
