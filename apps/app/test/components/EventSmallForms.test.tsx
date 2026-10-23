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
  OptionCommand,
  OptionForm,
} from "@/app/o/[orgSlug]/events/[eventId]/options/OptionForm";
import { BotProtection } from "@/app/o/[orgSlug]/events/[eventId]/settings/BotProtection";
import { EventReminders } from "@/app/o/[orgSlug]/events/[eventId]/settings/EventReminders";
import { TableForm } from "@/app/o/[orgSlug]/events/[eventId]/tables/TableForm";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  createOptionAction: vi.fn(),
  updateOptionAction: vi.fn(),
  optionCommandAction: vi.fn(),
  saveTablesAction: vi.fn(),
  saveBotProtectionAction: vi.fn(),
  reminderAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/events/actions", () => actions);
const all = fr as unknown as Record<string, Record<string, string>>;
const [opt, tab, rem] = [all.options!, all.tables!, all.reminders!];
beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: null });
  }
});
const wrap = (ui: React.ReactNode) => render(<Fr>{ui}</Fr>);
const submit = async (name: string) =>
  act(
    async () =>
      void fireEvent.submit(
        screen.getByRole("button", { name }).closest("form")!,
      ),
  );

describe("options d'un événement (section 9.29)", () => {
  it("nouvelle option : créée, « vendable seule » transmise, confirmée", async () => {
    wrap(<OptionForm orgSlug="club" eventId="e1" symbol="€" />);
    fireEvent.change(document.getElementById("option-new-name")!, {
      target: { value: "Vestiaire" },
    });
    fireEvent.change(document.getElementById("option-new-price")!, {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    await submit(opt.add!);
    await waitFor(() => expect(actions.createOptionAction).toHaveBeenCalled());
    const data = actions.createOptionAction.mock.calls[0]!.at(-1) as FormData;
    expect([
      data.get("name"),
      data.get("price"),
      data.get("standalone"),
      data.get("maxPerOrder"),
    ]).toEqual(["Vestiaire", "2", "on", "10"]);
    expect(await screen.findByText(opt.saved!)).toBeTruthy();
    expect(actions.updateOptionAction).not.toHaveBeenCalled();
  });

  it("option existante : modifiée, jamais recréée", async () => {
    wrap(
      <OptionForm
        orgSlug="club"
        eventId="e1"
        symbol="€"
        option={{
          id: "o1",
          name: "Boisson",
          description: "",
          price: "3",
          stock: "100",
          maxPerOrder: "4",
          standalone: false,
        }}
      />,
    );
    expect(
      (document.getElementById("option-o1-stock") as HTMLInputElement).value,
    ).toBe("100");
    await submit(opt.save!);
    await waitFor(() =>
      expect(actions.updateOptionAction.mock.calls[0]!.slice(0, 3)).toEqual([
        "club",
        "e1",
        "o1",
      ]),
    );
    expect(actions.createOptionAction).not.toHaveBeenCalled();
  });

  it("retirer une option de la vente, ou l'y remettre", async () => {
    wrap(
      <OptionCommand
        orgSlug="club"
        eventId="e1"
        optionId="o1"
        command="deactivate"
        label="Retirer"
      />,
    );
    await submit("Retirer");
    await waitFor(() =>
      expect(actions.optionCommandAction.mock.calls[0]!.slice(0, 4)).toEqual([
        "club",
        "e1",
        "o1",
        "deactivate",
      ]),
    );
  });
});

describe("tables et forfaits (section 9.31)", () => {
  const type = (locked: boolean) => ({
    id: "tt1",
    groupSize: 6,
    tableLabels: ["Table 1", "Table 2"],
    locked,
    includedOptions: [{ optionId: "o1", quantity: 2 }],
  });
  it("personnes par table non modifiables une fois verrouillées", () => {
    wrap(
      <TableForm orgSlug="club" eventId="e1" type={type(true)} options={[]} />,
    );
    expect(
      (document.getElementById("table-tt1-size") as HTMLInputElement).readOnly,
    ).toBe(true);
    expect(screen.getByText(tab.locked!)).toBeTruthy();
  });
  it("noms des tables et options comprises envoyés", async () => {
    wrap(
      <TableForm
        orgSlug="club"
        eventId="e1"
        type={type(false)}
        options={[
          { id: "o1", name: "Bouteille" },
          { id: "o2", name: "Softs" },
        ]}
      />,
    );
    expect(
      (
        screen.getByRole("spinbutton", {
          name: "Bouteille",
        }) as HTMLInputElement
      ).value,
    ).toBe("2");
    expect(
      (screen.getByRole("spinbutton", { name: "Softs" }) as HTMLInputElement)
        .value,
    ).toBe("0");
    await submit(tab.save!);
    await waitFor(() => expect(actions.saveTablesAction).toHaveBeenCalled());
    const data = actions.saveTablesAction.mock.calls[0]!.at(-1) as FormData;
    expect([
      data.get("groupSize"),
      data.get("tableLabels"),
      data.get("include_o1"),
      data.get("include_o2"),
    ]).toEqual(["6", "Table 1\nTable 2", "2", "0"]);
  });
});

describe("interrupteurs des réglages : jamais un état affiché différent de l'état enregistré", () => {
  const labels = {
    title: "Protection anti-robots",
    hint: "Pour les ventes à forte demande",
    saved: "Enregistré",
  };
  it("protection anti-robots : activée et confirmée ; échec : retour en arrière ; lecture seule : non modifiable", async () => {
    const a = wrap(
      <BotProtection
        orgSlug="club"
        eventId="e1"
        enabled={false}
        readOnly={false}
        labels={labels}
      />,
    );
    await act(async () => void fireEvent.click(screen.getByRole("checkbox")));
    expect(actions.saveBotProtectionAction).toHaveBeenCalledWith(
      "club",
      "e1",
      true,
    );
    expect(await screen.findByText("Enregistré")).toBeTruthy();
    actions.saveBotProtectionAction.mockResolvedValue({
      ok: false,
      error: "INCONNUE",
    });
    await act(async () => void fireEvent.click(screen.getByRole("checkbox")));
    await waitFor(() =>
      expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
        true,
      ),
    ); // l'arrêt a échoué : toujours active
    a.unmount();
    wrap(
      <BotProtection
        orgSlug="club"
        eventId="e1"
        enabled
        readOnly
        labels={labels}
      />,
    );
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(
      true,
    );
  });

  const reminders = [
    { type: "REMINDER_J7" as const, enabled: true, lastRunAt: null },
    { type: "REMINDER_J1" as const, enabled: true, lastRunAt: null },
  ];
  it("rappel coupé : envoyé ; échec : retour à l'état réel (avant : affiché coupé alors qu'il partirait)", async () => {
    wrap(
      <EventReminders orgSlug="club" eventId="e1" pro reminders={reminders} />,
    );
    const j7 = () =>
      screen.getByRole("checkbox", {
        name: rem.type_REMINDER_J7,
      }) as HTMLInputElement;
    await act(async () => void fireEvent.click(j7()));
    expect(actions.reminderAction).toHaveBeenCalledWith(
      "club",
      "e1",
      "REMINDER_J7",
      false,
    );
    expect(j7().checked).toBe(false);
    actions.reminderAction.mockResolvedValue({
      ok: false,
      error: "PRO_REQUIRED",
    });
    await act(async () => void fireEvent.click(j7()));
    await waitFor(() => expect(j7().checked).toBe(false)); // la réactivation a échoué : toujours coupé
    expect(
      (
        screen.getByRole("checkbox", {
          name: rem.type_REMINDER_J1,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it("sans l'offre Pro : aucun rappel proposé", () => {
    wrap(
      <EventReminders
        orgSlug="club"
        eventId="e1"
        pro={false}
        reminders={reminders}
      />,
    );
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});
