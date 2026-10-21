import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { CampaignEditor } from "@/app/o/[orgSlug]/marketing/campaigns/CampaignEditor";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  audienceAction: vi.fn(),
  deleteCampaignAction: vi.fn(),
  previewAction: vi.fn(),
  saveCampaignAction: vi.fn(),
  saveTemplateAction: vi.fn(),
  scheduleAction: vi.fn(),
  testAction: vi.fn(),
  unscheduleAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/marketing/campaigns/actions", () => actions);
vi.mock("@/app/o/[orgSlug]/brand/BrandClient", () => ({ uploadFile: vi.fn() }));
vi.mock("@/components/email/EmailEditor", () => ({ EmailEditor: () => null }));
vi.mock("@/components/email/EmailPreview", () => ({ EmailPreview: () => null }));
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const t = (fr as unknown as Record<string, Record<string, string>>).campaigns!;
const initial = {
  name: "Gala",
  subject: "Le gala approche",
  previewText: "",
  content: { type: "doc" as const, content: [] },
  segment: { kind: "ALL_CONSENTING" as const, locale: null },
};
beforeEach(() => {
  for (const f of [...Object.values(actions), ...Object.values(router)]) f.mockReset();
  actions.audienceAction.mockResolvedValue(250);
  actions.saveCampaignAction.mockResolvedValue({ ok: true, data: { id: "c1" } });
  actions.scheduleAction.mockResolvedValue({ ok: true, data: null });
  actions.deleteCampaignAction.mockResolvedValue({ ok: true, data: null });
  actions.testAction.mockResolvedValue({ ok: true, data: { to: "orga@exemple.be" } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const draw = (over: Partial<Parameters<typeof CampaignEditor>[0]> = {}) =>
  render(
    <Fr>
      <CampaignEditor
        orgSlug="club"
        id="c1"
        status="DRAFT"
        scheduledAt={null}
        initial={initial}
        events={[{ id: "e1", title: "Gala" }]}
        userEmail="orga@exemple.be"
        {...over}
      />
    </Fr>,
  );
const sendNow = () => screen.getByRole("button", { name: t.sendNow }) as HTMLButtonElement;
const ready = async () => waitFor(() => expect(screen.getByTestId("audience-count").textContent).not.toBe("…"));

describe("campagnes d'e-mails : envoi (US-MKT-03)", () => {
  it("campagne en cours d'envoi, envoyée, annulée ou en échec : plus modifiable", () => {
    for (const status of ["SENDING", "SENT", "CANCELLED", "FAILED"]) {
      const { container, unmount } = draw({ status });
      expect(container.textContent).toBe("");
      unmount();
    }
  });

  it("le nombre de destinataires suit le public ; une réponse en retard n'est jamais affichée pour un autre public", async () => {
    vi.useFakeTimers();
    const replies: Array<(n: number) => void> = [];
    actions.audienceAction.mockImplementation(() => new Promise((ok) => replies.push(ok)));
    draw();
    await act(async () => void (await vi.advanceTimersByTimeAsync(305)));
    fireEvent.change(screen.getByRole("combobox", { name: t.audience }), { target: { value: "EVENTS" } });
    await act(async () => void (await vi.advanceTimersByTimeAsync(305)));
    expect(actions.audienceAction.mock.calls.map((c) => (c[1] as { kind: string }).kind)).toEqual(["ALL_CONSENTING", "EVENTS"]);
    await act(async () => replies[1]!(12));
    await act(async () => replies[0]!(250)); // en retard : pour « tous les contacts »
    expect(screen.getByTestId("audience-count").textContent).toContain("12");
    expect(screen.getByTestId("audience-count").textContent).not.toContain("250");
  });

  it("envoi immédiat : confirmation annonçant le nombre de destinataires ; annulée, rien ne part", async () => {
    draw();
    await ready();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(async () => void fireEvent.click(sendNow()));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(String(confirm.mock.calls[0]![0])).toContain("250");
    expect(actions.scheduleAction).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => void fireEvent.click(sendNow()));
    await waitFor(() => expect(actions.scheduleAction).toHaveBeenCalledWith("club", "c1", null));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("programmation à une date : sans confirmation, la date envoyée", async () => {
    draw();
    await ready();
    const confirm = vi.spyOn(window, "confirm");
    fireEvent.change(document.getElementById("c-at")!, { target: { value: "2026-11-01T10:00" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.schedule })));
    await waitFor(() => expect(actions.scheduleAction).toHaveBeenCalledWith("club", "c1", new Date("2026-11-01T10:00").toISOString()));
    expect(confirm).not.toHaveBeenCalled();
  });

  it("envoi impossible sans destinataire, ou avant le premier enregistrement", async () => {
    actions.audienceAction.mockResolvedValue(0);
    const a = draw();
    await ready();
    expect(sendNow().disabled).toBe(true);
    a.unmount();
    draw({ id: null });
    expect(sendNow().disabled).toBe(true);
    expect(screen.getByText(t.saveFirst!)).toBeTruthy();
  });

  it("enregistrement d'une nouvelle campagne : son adresse définitive ; refus : champs à corriger", async () => {
    draw({ id: null });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.save })));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/o/club/marketing/campaigns/c1"));
    actions.saveCampaignAction.mockResolvedValue({ ok: false, error: "INVALID_INPUT", fields: { subject: "validation.required" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.save })));
    expect(await screen.findByText(t.fixFields!)).toBeTruthy();
  });

  it("envoi de test à l'organisateur : confirmé avec son adresse", async () => {
    draw();
    await ready();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: (n) => n.startsWith(t.sendTest!.split("{")[0]!.trim()) })));
    await waitFor(() => expect(actions.testAction).toHaveBeenCalledWith("club", "c1"));
    const sentText = t.testSent!.replace("{email}", "orga@exemple.be").replace(/\s+/g, " ").trim();
    expect(await screen.findByText((c) => c.replace(/\s+/g, " ").trim() === sentText)).toBeTruthy();
  });

  it("suppression : jamais sans confirmation", async () => {
    draw();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.delete })));
    expect(actions.deleteCampaignAction).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.delete })));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/o/club/marketing?tab=campaigns"));
  });
});

describe("éditeur de campagnes : ciblage par événement, modèle, déprogrammation", () => {
  it("ciblage par événement : événement, tarif, présence et langue transmis au calcul de l'audience", async () => {
    const user = userEvent.setup();
    draw({ ticketTypes: [{ id: "t1", name: "Fosse", eventId: "e1" }] });
    await user.selectOptions(screen.getByLabelText(t.audience!), "EVENTS");
    // la bascule coche d'office le premier événement, dont les tarifs s'affichent
    expect(((await screen.findByRole("checkbox", { name: "Gala" })) as HTMLInputElement).checked).toBe(true);
    await user.click(await screen.findByRole("checkbox", { name: "Fosse" }));
    await user.selectOptions(screen.getByLabelText(t.attendance!), "PRESENT");
    await user.selectOptions(screen.getByLabelText(t.language!), "fr");
    await waitFor(
      () => {
        const last = JSON.stringify(actions.audienceAction.mock.calls.at(-1));
        for (const part of ['"kind":"EVENTS"', '"eventIds":["e1"]', '"ticketTypeIds":["t1"]', '"attendance":"PRESENT"', '"locale":"fr"'])
          expect(last).toContain(part);
      },
      { timeout: 3000 },
    );
  });

  it("enregistrer comme modèle : action appelée, confirmation affichée", async () => {
    actions.saveTemplateAction.mockResolvedValue({ ok: true, data: null });
    draw();
    fireEvent.click(screen.getByRole("button", { name: t.saveAsTemplate! }));
    // le texte cherché est normalisé comme celui de la page (espaces insécables du français)
    expect(await screen.findByText(t.templateSaved!.replace(/\s+/g, " "))).toBeTruthy();
    expect(actions.saveTemplateAction).toHaveBeenCalledWith("club", expect.objectContaining({ name: "Gala", subject: "Le gala approche" }));
  });

  it("campagne programmée : la déprogrammer appelle l'action", async () => {
    actions.unscheduleAction.mockResolvedValue({ ok: true, data: null });
    draw({ status: "SCHEDULED", scheduledAt: new Date(Date.now() + 86_400_000).toISOString() });
    fireEvent.click(screen.getByRole("button", { name: t.unschedule! }));
    await waitFor(() => expect(actions.unscheduleAction).toHaveBeenCalled());
  });
});
