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
  DistributorBlockPanel,
  DistributorSeatPanel,
} from "@/app/o/[orgSlug]/events/[eventId]/seating/DistributorSeats";
import { Fr } from "./intl";

// éditeur du plan : places confiées à un réseau de billetterie (docs/COMPATIBILITE_RESEAUX.md)
const actions = vi.hoisted(() => ({ seatingDistributorAction: vi.fn() }));
vi.mock("@/app/o/[orgSlug]/events/actions", () => actions);
const t = (fr as unknown as Record<string, Record<string, string>>)
  .seatingEditor!;
const networks = [
  { id: "tm", name: "Ticketmaster" },
  { id: "fnac", name: "Fnac (France Billet)" },
];
const seat = (id: string, o: Record<string, unknown> = {}) =>
  ({
    id,
    blockId: "b1",
    status: "AVAILABLE",
    distributorId: null,
    row: "A",
    label: id,
    ...o,
  }) as never;
/** Exécution immédiate, comme l'éditeur : l'action, puis la suite avec son résultat. */
const run = (fn: () => Promise<unknown>, after?: (r: never) => void) =>
  void fn().then((r) => after?.(r as never));
const calls = () =>
  actions.seatingDistributorAction.mock.calls.map((c) => c[2]);
beforeEach(() => {
  actions.seatingDistributorAction.mockReset();
  actions.seatingDistributorAction.mockResolvedValue({
    ok: true,
    data: { changed: 1 },
  });
});

describe("éditeur du plan : réseau de vente", () => {
  it("place libre confiée à un réseau, puis passée à un autre réseau : rendue puis confiée", async () => {
    const { rerender } = render(
      <Fr>
        <DistributorSeatPanel
          orgSlug="club"
          eventId="e1"
          seat={seat("s1")}
          networks={networks}
          pending={false}
          run={run}
        />
      </Fr>,
    );
    await act(
      async () =>
        void fireEvent.change(screen.getByLabelText(t.soldBy!), {
          target: { value: "tm" },
        }),
    );
    await waitFor(() =>
      expect(calls()).toEqual([
        { distributorId: "tm", seatIds: ["s1"], assign: true },
      ]),
    );
    rerender(
      <Fr>
        <DistributorSeatPanel
          orgSlug="club"
          eventId="e1"
          seat={seat("s1", { status: "BLOCKED", distributorId: "tm" })}
          networks={networks}
          pending={false}
          run={run}
        />
      </Fr>,
    );
    await act(
      async () =>
        void fireEvent.change(screen.getByLabelText(t.soldBy!), {
          target: { value: "fnac" },
        }),
    );
    await waitFor(() =>
      expect(calls().slice(1)).toEqual([
        { distributorId: "tm", seatIds: ["s1"], assign: false },
        { distributorId: "fnac", seatIds: ["s1"], assign: true },
      ]),
    );
  });

  it("place vendue : le réseau ne se change plus", () => {
    render(
      <Fr>
        <DistributorSeatPanel
          orgSlug="club"
          eventId="e1"
          seat={seat("s1", { status: "SOLD" })}
          networks={networks}
          pending={false}
          run={run}
        />
      </Fr>,
    );
    expect(
      (screen.getByLabelText(t.soldBy!) as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(screen.getByText(t.networkSeatTaken!)).toBeTruthy();
  });

  it("bloc : seules les places libres sont confiées ; les places du réseau choisi se rendent ; rien de changé : expliqué", async () => {
    const seats = [
      seat("s1"),
      seat("s2", { status: "SOLD" }),
      seat("s3"),
      seat("s4", { status: "BLOCKED", distributorId: "fnac" }),
      seat("x9", { blockId: "autre" }),
    ];
    render(
      <Fr>
        <DistributorBlockPanel
          orgSlug="club"
          eventId="e1"
          blockId="b1"
          seats={seats}
          networks={networks}
          pending={false}
          run={run}
        />
      </Fr>,
    );
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: "Confier les places libres (2)" }),
        ),
    );
    await waitFor(() =>
      expect(calls()).toEqual([
        { distributorId: "tm", seatIds: ["s1", "s3"], assign: true },
      ]),
    );
    fireEvent.change(screen.getByLabelText(t.networkChoose!), {
      target: { value: "fnac" },
    });
    actions.seatingDistributorAction.mockResolvedValueOnce({
      ok: true,
      data: { changed: 0 },
    });
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", {
            name: "Rendre les places de ce réseau (1)",
          }),
        ),
    );
    await waitFor(() =>
      expect(calls()[1]).toEqual({
        distributorId: "fnac",
        seatIds: ["s4"],
        assign: false,
      }),
    );
    expect(await screen.findByText(t.networkNoneChanged!)).toBeTruthy();
  });
});
