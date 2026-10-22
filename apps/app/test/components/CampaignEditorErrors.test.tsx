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

describe("éditeur de campagnes : refus du serveur", () => {
  const errorShown = (code: string) => {
    const known = (fr as unknown as Record<string, Record<string, string>>).formErrors?.[code];
    const page = document.body.textContent!.replace(/\s+/g, " ");
    return page.includes((known ?? t.error!).replace(/\s+/g, " "));
  };

  it("envoi refusé par le serveur (aucun destinataire) : l'erreur s'affiche", async () => {
    vi.stubGlobal("confirm", () => true);
    actions.saveCampaignAction.mockResolvedValue({ ok: true, data: { id: "c1" } });
    actions.scheduleAction.mockResolvedValue({ ok: false, error: "CAMPAIGN_NO_RECIPIENTS" });
    draw();
    // inactif tant que le nombre de destinataires n'est pas calculé
    await waitFor(() => expect((screen.getByRole("button", { name: t.sendNow }) as HTMLButtonElement).disabled).toBe(false));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.sendNow })));
    await waitFor(() => expect(actions.scheduleAction).toHaveBeenCalled());
    await waitFor(() => expect(errorShown("CAMPAIGN_NO_RECIPIENTS")).toBe(true));
  });

  it("suppression : annulée à la confirmation, rien ne part ; confirmée puis refusée, l'erreur s'affiche", async () => {
    actions.deleteCampaignAction.mockResolvedValue({ ok: false, error: "QUELQUE_CHOSE" });
    vi.stubGlobal("confirm", () => false);
    draw();
    await waitFor(() => expect((screen.getByRole("button", { name: t.delete }) as HTMLButtonElement).disabled).toBe(false));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.delete })));
    expect(actions.deleteCampaignAction).not.toHaveBeenCalled();
    vi.stubGlobal("confirm", () => true);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.delete })));
    await waitFor(() => expect(actions.deleteCampaignAction).toHaveBeenCalled());
    await waitFor(() => expect(errorShown("QUELQUE_CHOSE")).toBe(true));
  });
});
