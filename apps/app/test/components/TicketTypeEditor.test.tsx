import { EUR_TERMS } from "@evoly/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import {
  TicketTypeCard,
  TicketTypeForm,
  type TicketTypeRow,
} from "@/app/o/[orgSlug]/events/[eventId]/tickets/TicketTypeEditor";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  saveTicketTypeAction: vi.fn(),
  ticketCommandAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/events/actions", () => actions);
const tk = fr.tickets as unknown as Record<string, string>;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const fill = (msg: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(`{${k}}`, String(v)),
    msg,
  );
const row = (over: Partial<TicketTypeRow> = {}): TicketTypeRow => ({
  id: "t1",
  name: "Fosse",
  description: "",
  price: "25",
  priceMinor: 2_500,
  quantity: "50",
  quantitySold: 0,
  minPerOrder: 1,
  maxPerOrder: 10,
  salesStartLocal: "",
  salesEndLocal: "",
  visibility: "VISIBLE",
  status: "ACTIVE",
  isNominative: false,
  resaleAllowed: true,
  priceLocked: false,
  tiers: [],
  ...over,
});
beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: null });
  }
});
const card = (r: TicketTypeRow, index = 0, count = 1) =>
  render(
    <Fr>
      <TicketTypeCard
        orgSlug="club"
        eventId="e1"
        row={r}
        terms={EUR_TERMS.free}
        currency="EUR"
        index={index}
        count={count}
        tiersEnabled={false}
        tiersLocked={false}
      />
    </Fr>,
  );
const has = (name: string) => !!screen.queryByRole("button", { name });
const edit = () =>
  fireEvent.click(screen.getByRole("button", { name: tk.edit }));

describe("tarifs de l'événement : carte d'un tarif", () => {
  it("statut, visibilité et ventes, sur un total ou en illimité", () => {
    const { container, unmount } = card(
      row({ quantitySold: 12, visibility: "HIDDEN", status: "PAUSED" }),
    );
    expect(container.textContent).toContain(tk.status_PAUSED!);
    expect(container.textContent).toContain(tk.visibility_HIDDEN!);
    expect(norm(container.textContent!)).toContain(
      norm(fill(tk.soldOf!, { sold: 12, total: 50 })),
    );
    unmount();
    const b = card(row({ quantity: "", quantitySold: 3 }));
    expect(norm(b.container.textContent!)).toContain(
      norm(fill(tk.soldUnlimited!, { sold: 3 })),
    );
  });

  it("flèches de déplacement absentes aux extrémités de la liste", () => {
    const a = card(row(), 0, 3);
    expect([has(tk.moveUp!), has(tk.moveDown!)]).toEqual([false, true]);
    a.unmount();
    const b = card(row(), 2, 3);
    expect([has(tk.moveUp!), has(tk.moveDown!)]).toEqual([true, false]);
    b.unmount();
    card(row(), 1, 3);
    expect([has(tk.moveUp!), has(tk.moveDown!)]).toEqual([true, true]);
  });

  it("actions selon l'état : supprimer seulement sans vente, archiver un tarif vendu, pause et réactivation", () => {
    const cases: Array<[Partial<TicketTypeRow>, Record<string, boolean>]> = [
      [
        { status: "ACTIVE", quantitySold: 0 },
        { pause: true, activate: false, archive: false, delete: true },
      ],
      [
        { status: "ACTIVE", quantitySold: 5 },
        { pause: true, activate: false, archive: true, delete: false },
      ],
      [
        { status: "PAUSED", quantitySold: 5 },
        { pause: false, activate: true, archive: true, delete: false },
      ],
      [
        { status: "ARCHIVED", quantitySold: 5 },
        { pause: false, activate: true, archive: false, delete: false },
      ],
    ];
    for (const [over, expected] of cases) {
      const r = card(row(over));
      edit();
      expect(
        Object.fromEntries(Object.keys(expected).map((k) => [k, has(tk[k]!)])),
      ).toEqual(expected);
      r.unmount();
    }
  });

  it("une action est envoyée avec le bon tarif et la bonne commande", async () => {
    card(row({ status: "ACTIVE", quantitySold: 0 }));
    edit();
    await act(
      async () =>
        void fireEvent.submit(
          screen.getByRole("button", { name: tk.pause }).closest("form")!,
        ),
    );
    await waitFor(() =>
      expect(actions.ticketCommandAction.mock.calls[0]!.slice(0, 4)).toEqual([
        "club",
        "e1",
        "t1",
        "pause",
      ]),
    );
  });
});

describe("tarifs de l'événement : formulaire", () => {
  it("nouveau tarif : envoyé, puis le formulaire se referme après l'enregistrement ; revente autorisée par défaut", async () => {
    const onDone = vi.fn();
    render(
      <Fr>
        <TicketTypeForm
          orgSlug="club"
          eventId="e1"
          row={null}
          terms={EUR_TERMS.free}
          onDone={onDone}
        />
      </Fr>,
    );
    expect(
      (
        screen.getByRole("checkbox", {
          name: tk.resaleAllowed,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText(new RegExp(`^${tk.name}`)), {
      target: { value: "Balcon" },
    });
    await act(
      async () =>
        void fireEvent.submit(
          screen
            .getByRole("button", { name: tk.addTicketType })
            .closest("form")!,
        ),
    );
    await waitFor(() =>
      expect(actions.saveTicketTypeAction).toHaveBeenCalled(),
    );
    const [org, ev, id] = actions.saveTicketTypeAction.mock.calls[0]!;
    expect([
      org,
      ev,
      id,
      (actions.saveTicketTypeAction.mock.calls[0]!.at(-1) as FormData).get(
        "name",
      ),
    ]).toEqual(["club", "e1", null, "Balcon"]);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("tarif vendu : la quantité ne descend pas sous les ventes ; prix verrouillé signalé", () => {
    render(
      <Fr>
        <TicketTypeForm
          orgSlug="club"
          eventId="e1"
          row={row({ quantitySold: 12, priceLocked: true })}
          terms={EUR_TERMS.free}
        />
      </Fr>,
    );
    expect(
      (screen.getByLabelText(new RegExp(`^${tk.quantity}`)) as HTMLInputElement)
        .min,
    ).toBe("12");
    expect(screen.getByText(tk.priceLocked!)).toBeTruthy();
    expect(screen.getByRole("button", { name: tk.save })).toBeTruthy();
  });

  it("refus du serveur : le formulaire reste ouvert", async () => {
    actions.saveTicketTypeAction.mockResolvedValue({
      ok: false,
      error: "INVALID_INPUT",
      fields: { name: "validation.required" },
    });
    const onDone = vi.fn();
    render(
      <Fr>
        <TicketTypeForm
          orgSlug="club"
          eventId="e1"
          row={null}
          terms={EUR_TERMS.free}
          onDone={onDone}
        />
      </Fr>,
    );
    await act(
      async () =>
        void fireEvent.submit(
          screen
            .getByRole("button", { name: tk.addTicketType })
            .closest("form")!,
        ),
    );
    await waitFor(() =>
      expect(actions.saveTicketTypeAction).toHaveBeenCalled(),
    );
    expect(onDone).not.toHaveBeenCalled();
  });
});
