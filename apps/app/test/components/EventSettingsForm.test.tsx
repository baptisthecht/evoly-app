import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import {
  SettingsForm,
  type SettingsValues,
} from "@/app/o/[orgSlug]/events/[eventId]/settings/SettingsForm";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({ saveEventSettingsAction: vi.fn() }));
vi.mock("@/app/o/[orgSlug]/events/actions", () => actions);
const t = (fr as unknown as Record<string, Record<string, string>>)
  .eventSettings!;
const values = (over: Partial<SettingsValues> = {}): SettingsValues => ({
  title: "Gala",
  summary: "",
  startsAtLocal: "2026-12-20T20:00",
  endsAtLocal: "",
  timezone: "Europe/Brussels",
  locationType: "PHYSICAL",
  locationName: "Salle",
  addressLine1: "Rue Haute 1",
  postalCode: "1000",
  city: "Bruxelles",
  country: "BE",
  onlineUrl: "",
  capacity: "200",
  maxTicketsPerOrder: 10,
  maxTicketsPerBuyer: null,
  version: "v1",
  visibility: "PUBLIC",
  refundPolicy: "NON_REFUNDABLE",
  refundDeadlineLocal: "",
  salesStartLocal: "",
  salesEndLocal: "",
  resaleEnabled: true,
  resaleCutoffHours: 2,
  resaleWaitlistFirst: true,
  resaleWaitlistMinutes: 45,
  showResaleSection: true,
  ...over,
});
beforeEach(() => {
  actions.saveEventSettingsAction.mockReset();
  actions.saveEventSettingsAction.mockResolvedValue({
    ok: true,
    data: { version: "v2", concurrent: false },
  });
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());
const draw = (v = values(), readOnly = false) =>
  render(
    <Fr>
      <SettingsForm
        orgSlug="club"
        eventId="e1"
        values={v}
        readOnly={readOnly}
      />
    </Fr>,
  );
const sent = async () => {
  await act(async () => void (await vi.advanceTimersByTimeAsync(1_050)));
  return actions.saveEventSettingsAction.mock.calls.at(-1)!.at(-1) as FormData;
};

describe("réglages d'un événement : enregistrement automatique (RG-EVT-01, RG-EVT-10)", () => {
  it("revente désactivée : ses réglages restent envoyés, l'enregistrement des autres réglages n'est jamais bloqué", async () => {
    draw(values({ resaleEnabled: false }));
    fireEvent.change(document.getElementById("capacity")!, {
      target: { value: "250" },
    });
    const data = await sent();
    expect([
      data.get("capacity"),
      data.get("resaleWaitlistMinutes"),
      data.get("resaleWaitlistFirst"),
      data.get("showResaleSection"),
    ]).toEqual(["250", "45", "on", "on"]);
  });

  it("revente coupée en cours de route : la priorité à la liste d'attente et son délai ne sont pas effacés", async () => {
    draw();
    // refonte A3 : l'interrupteur « Revente entre acheteurs » (son explication fait partie de son nom)
    fireEvent.click(
      screen.getByRole("switch", { name: new RegExp(`^${t.resaleSwitch}`) }),
    );
    const data = await sent();
    expect([
      data.get("resaleEnabled"),
      data.get("resaleWaitlistFirst"),
      data.get("resaleWaitlistMinutes"),
    ]).toEqual([null, "on", "45"]);
  });

  it("délai de revente saisi en heures, envoyé en minutes", async () => {
    draw();
    // les délais et la liste d'attente sont repliés (refonte A3) : un clic les montre
    fireEvent.click(
      screen.getByRole("button", { name: t.resaleMore!.toLowerCase() }),
    );
    fireEvent.change(document.getElementById("resaleCutoffHours")!, {
      target: { value: "1.5" },
    });
    expect((await sent()).get("resaleCutoffMinutes")).toBe("90");
  });

  it("une seule sauvegarde une seconde après la dernière modification, avec la version suivie d'une sauvegarde à l'autre", async () => {
    draw();
    fireEvent.change(document.getElementById("capacity")!, {
      target: { value: "210" },
    });
    await act(async () => void (await vi.advanceTimersByTimeAsync(500)));
    fireEvent.change(document.getElementById("capacity")!, {
      target: { value: "220" },
    });
    expect(screen.getByText(t.unsaved!)).toBeTruthy();
    const first = await sent();
    expect(actions.saveEventSettingsAction).toHaveBeenCalledTimes(1);
    expect([first.get("capacity"), first.get("version")]).toEqual([
      "220",
      "v1",
    ]);
    fireEvent.change(document.getElementById("capacity")!, {
      target: { value: "230" },
    });
    expect((await sent()).get("version")).toBe("v2"); // la version renvoyée par la sauvegarde précédente
  });

  it("autre membre passé entre-temps : avertissement ; refus : « non enregistré »", async () => {
    actions.saveEventSettingsAction
      .mockResolvedValueOnce({
        ok: true,
        data: { version: "v3", concurrent: true },
      })
      .mockResolvedValueOnce({ ok: false, error: "INVALID_INPUT", fields: {} });
    draw();
    fireEvent.change(document.getElementById("capacity")!, {
      target: { value: "210" },
    });
    await sent();
    expect(screen.getByText(t.concurrentEdit!)).toBeTruthy();
    fireEvent.change(document.getElementById("capacity")!, {
      target: { value: "211" },
    });
    await sent();
    expect(screen.getByText(t.notSaved!)).toBeTruthy();
  });

  it("champs selon les choix : code d'un événement privé, date limite de remboursement ; lecture seule : rien n'est envoyé", async () => {
    const a = draw();
    expect(document.getElementById("refundDeadlineLocal")).toBeNull();
    // refonte A3 : le remboursement s'allume d'un interrupteur, puis « Comment » propose la date limite
    fireEvent.click(
      screen.getByRole("switch", { name: new RegExp(`^${t.refundSwitch}`) }),
    );
    fireEvent.change(document.getElementById("refundMode")!, {
      target: { value: "UNTIL_DEADLINE" },
    });
    expect(document.getElementById("refundDeadlineLocal")).not.toBeNull();
    fireEvent.change(document.getElementById("visibility")!, {
      target: { value: "PRIVATE" },
    });
    expect(document.querySelector('[name="accessCode"]')).not.toBeNull();
    a.unmount();
    actions.saveEventSettingsAction.mockClear();
    draw(values(), true);
    fireEvent.change(document.getElementById("capacity")!, {
      target: { value: "999" },
    });
    await act(async () => void (await vi.advanceTimersByTimeAsync(1_500)));
    expect(actions.saveEventSettingsAction).not.toHaveBeenCalled();
  });
});

describe("limites d'achat : la phrase d'exemple suit la saisie", () => {
  it("commande, personne, tarifs et prévente", () => {
    render(
      <Fr>
        <SettingsForm
          orgSlug="club"
          eventId="e1"
          values={values({
            maxTicketsPerOrder: 6,
            // la limite propre à la prévente n'apparaît que si elle existe déjà (absente de la maquette)
            presaleMaxTicketsPerBuyer: 3,
          })}
          readOnly={false}
          typeLimits={[
            { name: "Fosse", maxPerBuyer: 2 },
            { name: "Balcon", maxPerBuyer: null },
          ]}
        />
      </Fr>,
    );
    // refonte A3 (maquette Réglages, Vente) : la phrase d'exemple sous les deux champs
    const sentence = () =>
      screen.getByText((c) => c.startsWith("Une ")).textContent;
    expect(sentence()).toBe(
      "Une commande contiendra 6 billets au plus, sans limite par personne. Par personne : 2 en Fosse. Pendant la prévente : 3 billets par personne.",
    );
    fireEvent.change(screen.getByLabelText(t.maxTicketsPerBuyer!), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText(t.presaleMaxTicketsPerBuyer!), {
      target: { value: "2" },
    });
    expect(sentence()).toBe(
      "Une même personne pourra acheter 4 billets au plus, en 1 commande au moins. Par personne : 2 en Fosse. Pendant la prévente : 2 billets par personne.",
    );
  });
});

describe("réglages en parties : chaque partie montre ses champs, les autres restent dans le formulaire", () => {
  const part = (section: "general" | "venue" | "sales") =>
    render(
      <Fr>
        <SettingsForm
          orgSlug="club"
          eventId="e1"
          values={values()}
          readOnly={false}
          section={section}
        />
      </Fr>,
    );
  const shown = (el: HTMLElement) => !el.closest("[hidden]");

  it("Général : l'essentiel ; Lieu : le lieu ; Vente : la vente ; les champs masqués sont toujours envoyés", () => {
    const { unmount } = part("general");
    expect(shown(screen.getByLabelText(t.maxTicketsPerOrder!))).toBe(false);
    const form = screen.getByLabelText(t.maxTicketsPerOrder!).closest("form")!;
    expect(new FormData(form).get("maxTicketsPerOrder")).toBe(
      String(values().maxTicketsPerOrder),
    ); // masqué mais envoyé
    unmount();
    part("sales");
    expect(shown(screen.getByLabelText(t.maxTicketsPerOrder!))).toBe(true);
    const title = document.querySelector<HTMLInputElement>(
      'input[name="title"]',
    )!;
    expect([shown(title), title.closest("form") !== null]).toEqual([
      false,
      true,
    ]);
  });

  it("Lieu : le lieu seul", () => {
    part("venue");
    const title = document.querySelector<HTMLInputElement>(
      'input[name="title"]',
    )!;
    const city = document.querySelector<HTMLInputElement>(
      'input[name="city"], input[name="locationName"]',
    )!;
    expect([
      shown(title),
      shown(city),
      shown(screen.getByLabelText(t.maxTicketsPerOrder!)),
    ]).toEqual([false, true, false]);
  });
});
