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

describe("aperçu des e-mails en temps réel", () => {
  it("rendu demandé 300 ms après la dernière modification ; une réponse arrivée en retard ne remplace jamais la plus récente", async () => {
    vi.useFakeTimers();
    const resolvers: Array<(v: unknown) => void> = [];
    const action = vi.fn(() => new Promise((ok) => resolvers.push(ok)));
    const r = render(
      <Fr>
        <EmailPreview
          orgSlug="club"
          subject="Un"
          previewText=""
          content={doc}
          action={action as never}
        />
      </Fr>,
    );
    r.rerender(
      <Fr>
        <EmailPreview
          orgSlug="club"
          subject="Deux"
          previewText=""
          content={doc}
          action={action as never}
        />
      </Fr>,
    );
    await act(async () => void (await vi.advanceTimersByTimeAsync(299)));
    expect(action).not.toHaveBeenCalled(); // l'utilisateur tape encore
    await act(async () => void (await vi.advanceTimersByTimeAsync(5)));
    expect(action).toHaveBeenCalledTimes(1);
    expect((action.mock.calls[0] as unknown[])[0]).toMatchObject({
      subject: "Deux",
    });
    r.rerender(
      <Fr>
        <EmailPreview
          orgSlug="club"
          subject="Trois"
          previewText=""
          content={doc}
          action={action as never}
        />
      </Fr>,
    );
    await act(async () => void (await vi.advanceTimersByTimeAsync(305)));
    await act(async () =>
      resolvers[1]!({
        ok: true,
        data: { html: "<p>Trois</p>", subject: "Trois", warnings: [] },
      }),
    );
    await act(async () =>
      resolvers[0]!({
        ok: true,
        data: { html: "<p>Deux</p>", subject: "Deux", warnings: [] },
      }),
    ); // en retard
    expect(screen.getByTitle(e.previewFrame!).getAttribute("srcdoc")).toBe(
      "<p>Trois</p>",
    );
  });

  it("cadre isolé sans script, avertissements traduits, largeur téléphone au choix", async () => {
    vi.useFakeTimers();
    const action = vi.fn(async () => ({
      ok: true,
      data: { html: "<p>x</p>", subject: "x", warnings: ["SCRIPT"] },
    }));
    render(
      <Fr>
        <EmailPreview
          orgSlug="club"
          subject="x"
          previewText="Aperçu court"
          content={doc}
          action={action as never}
        />
      </Fr>,
    );
    await act(async () => void (await vi.advanceTimersByTimeAsync(305)));
    const frame = screen.getByTitle(e.previewFrame!);
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(screen.getByRole("status").textContent).toContain(e.warn_SCRIPT!);
    expect(screen.getByText("Aperçu court")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: e.mobile }));
    expect([
      (frame as HTMLIFrameElement).style.width,
      screen
        .getByRole("button", { name: e.mobile })
        .getAttribute("aria-pressed"),
    ]).toEqual(["375px", "true"]);
  });
});

describe("billetterie intégrée sur le site de l'organisateur (section 9.26, RG-EMB-07)", () => {
  let parent: { postMessage: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    parent = { postMessage: vi.fn() };
  });
  const embedded = () =>
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: parent,
    });
  const topLevel = () =>
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: window,
    });
  afterEach(() => topLevel());

  it("hauteur transmise à la page d'accueil seulement quand la billetterie est intégrée", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    topLevel();
    const a = render(<EmbedHeight />);
    a.unmount();
    expect(parent.postMessage).not.toHaveBeenCalled();
    embedded();
    render(<EmbedHeight />);
    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "evoly:height" }),
      "*",
    );
    vi.unstubAllGlobals();
  });

  it("« Réserver » : fenêtre d'achat ouverte, la page d'accueil prévenue ; seuls les messages de cette fenêtre sont relayés, nettoyés", () => {
    embedded();
    const popup = {} as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);
    render(<EmbedBook url="https://club.evoly.me/gala" label="Réserver" />);
    fireEvent.click(screen.getByRole("link", { name: "Réserver" }));
    expect(window.open).toHaveBeenCalledWith(
      "https://club.evoly.me/gala",
      "evoly-billetterie",
      expect.stringContaining("popup=yes"),
    );
    expect(parent.postMessage).toHaveBeenCalledWith(
      { type: "evoly:open" },
      "*",
    );
    const order = {
      type: "evoly:order_completed",
      tickets: 2,
      totalMinor: 5_000,
      currency: "EUR",
      email: "lea@exemple.be",
    };
    act(
      () =>
        void window.dispatchEvent(
          new MessageEvent("message", { data: order, source: {} as Window }),
        ),
    );
    expect(parent.postMessage).toHaveBeenCalledTimes(1); // une autre fenêtre : ignoré
    act(
      () =>
        void window.dispatchEvent(
          new MessageEvent("message", { data: order, source: popup as never }),
        ),
    );
    const relayed = sanitizeEmbedEvent(order);
    if (relayed)
      expect(parent.postMessage).toHaveBeenLastCalledWith(relayed, "*");
    expect(JSON.stringify(parent.postMessage.mock.calls)).not.toContain(
      "lea@exemple.be",
    ); // aucune donnée personnelle
  });
});

describe("plan d'occupation à l'accueil (section 9.9)", () => {
  const data = {
    blocks: [],
    rows: [],
    categories: [{ id: "c1", color: "#FFB8E8" }],
    counts: { entered: 1, sold: 2, free: 1, blocked: 0 },
    seats: [
      {
        id: "s1",
        x: 0,
        y: 0,
        blockId: null,
        row: "A",
        label: "1",
        state: "IN",
        holder: "Léa Martin",
        categoryId: "c1",
        accessible: false,
      },
      {
        id: "s2",
        x: 30,
        y: 0,
        blockId: null,
        row: "A",
        label: "2",
        state: "SOLD",
        holder: "Tom Dubois",
        categoryId: "c1",
        accessible: false,
      },
      {
        id: "s3",
        x: 60,
        y: 0,
        blockId: null,
        row: "B",
        label: "1",
        state: "FREE",
        holder: null,
        categoryId: "c1",
        accessible: true,
      },
    ],
  };
  it("places occupées listées par rang, impression, et rafraîchissement toutes les 10 secondes pendant le contrôle", async () => {
    vi.useFakeTimers();
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(
      <Fr>
        <OccupancyPlan data={data as never} />
      </Fr>,
    );
    expect(screen.getByText("Léa Martin")).toBeTruthy();
    expect(screen.getByText("Tom Dubois")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(3); // en-tête et deux places occupées
    fireEvent.click(
      screen.getByRole("button", {
        name: (fr.occupancy as Record<string, string>).print,
      }),
    );
    expect(print).toHaveBeenCalled();
    await act(async () => void (await vi.advanceTimersByTimeAsync(20_500)));
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });
});
