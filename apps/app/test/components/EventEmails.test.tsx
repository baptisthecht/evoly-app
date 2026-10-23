import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { EventEmailBlocks } from "@/app/o/[orgSlug]/events/[eventId]/settings/EventEmailBlocks";
import { EventMarketingEmails } from "@/app/o/[orgSlug]/events/[eventId]/settings/EventMarketingEmails";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  previewEventEmailBlockAction: vi.fn(),
  saveEventEmailBlockAction: vi.fn(),
  marketingAutomationAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/events/actions", () => actions);
const previews = vi.hoisted(() => ({
  last: null as null | { content: unknown; action: (i: unknown) => unknown },
}));
const edited = {
  type: "doc" as const,
  content: [
    {
      type: "paragraph" as const,
      content: [{ type: "text" as const, text: "Parking gratuit" }],
    },
  ],
};
vi.mock("@/components/email/EmailEditor", () => ({
  EmailEditor: ({ onChange }: { onChange: (d: unknown) => void }) => (
    <button type="button" onClick={() => onChange(edited)}>
      modifier le contenu
    </button>
  ),
}));
vi.mock("@/components/email/EmailPreview", () => ({
  EmailPreview: (p: { content: unknown; action: (i: unknown) => unknown }) => {
    previews.last = p;
    return <p>aperçu</p>;
  },
}));
const all = fr as unknown as Record<string, Record<string, string>>;
const [b, m, te] = [
  all.eventEmailBlocks!,
  all.marketingAutomations!,
  all.emailEditor!,
];
const empty = { type: "doc" as const, content: [] };
beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: null });
  }
  previews.last = null;
});
const wrap = (ui: React.ReactNode) => render(<Fr>{ui}</Fr>);

describe("blocs des e-mails de billets et de rappel", () => {
  it("contenu modifié envoyé pour le bon e-mail ; enregistrement confirmé ou échec signalé", async () => {
    wrap(
      <EventEmailBlocks
        orgSlug="club"
        eventId="e1"
        ticket={empty}
        reminder={empty}
      />,
    );
    const ticket = within(screen.getByRole("region", { name: b.ticket }));
    fireEvent.click(
      ticket.getByRole("button", { name: "modifier le contenu" }),
    );
    await act(
      async () =>
        void fireEvent.click(ticket.getByRole("button", { name: b.save })),
    );
    expect(actions.saveEventEmailBlockAction).toHaveBeenCalledWith(
      "club",
      "e1",
      "ticket",
      edited,
    );
    expect(ticket.getByRole("status").textContent).toBe(b.saved);
    actions.saveEventEmailBlockAction.mockResolvedValue({
      ok: false,
      error: "INCONNUE",
    });
    await act(
      async () =>
        void fireEvent.click(ticket.getByRole("button", { name: b.save })),
    );
    await waitFor(() =>
      expect(ticket.getByRole("status").textContent).toBe(b.error),
    );
    fireEvent.click(
      ticket.getByRole("button", { name: "modifier le contenu" }),
    );
    expect(ticket.queryByRole("status")).toBeNull(); // une modification efface l'ancien statut
  });

  it("aperçu demandé pour le bon e-mail, avec le contenu en cours", async () => {
    wrap(
      <EventEmailBlocks
        orgSlug="club"
        eventId="e1"
        ticket={empty}
        reminder={empty}
      />,
    );
    const reminder = within(screen.getByRole("region", { name: b.reminder }));
    fireEvent.click(
      reminder.getByRole("button", { name: "modifier le contenu" }),
    );
    fireEvent.click(
      reminder
        .getAllByRole("button")
        .find(
          (x) =>
            x.textContent &&
            x.textContent !== b.save &&
            x.textContent !== "modifier le contenu",
        )!,
    );
    expect(previews.last!.content).toEqual(edited);
    await previews.last!.action({
      subject: "",
      previewText: "",
      content: edited,
    });
    expect(actions.previewEventEmailBlockAction).toHaveBeenCalledWith(
      "club",
      "e1",
      "reminder",
      expect.anything(),
    );
  });

  it("les deux blocs coexistent, chacun avec son propre envoi", async () => {
    wrap(
      <EventEmailBlocks
        orgSlug="club"
        eventId="e1"
        ticket={empty}
        reminder={empty}
      />,
    );
    const reminder = within(screen.getByRole("region", { name: b.reminder }));
    await act(
      async () =>
        void fireEvent.click(reminder.getByRole("button", { name: b.save })),
    );
    expect(actions.saveEventEmailBlockAction).toHaveBeenCalledWith(
      "club",
      "e1",
      "reminder",
      empty,
    );
    expect(
      within(screen.getByRole("region", { name: b.ticket })).queryByRole(
        "status",
      ),
    ).toBeNull();
  });
});

const automations = [
  {
    type: "POST_EVENT" as const,
    enabled: true,
    subject: "Merci d'être venu",
    content: empty,
    sent: false,
  },
  {
    type: "LAST_TICKETS" as const,
    enabled: false,
    subject: "Dernières places",
    content: empty,
    sent: true,
  },
];
describe("e-mails marketing de l'événement (US-MKT-02)", () => {
  it("sujet, contenu et activation envoyés, puis confirmés", async () => {
    wrap(
      <EventMarketingEmails
        orgSlug="club"
        eventId="e1"
        automations={automations}
      />,
    );
    const subject = document.getElementById(
      "POST_EVENT-subject",
    ) as HTMLInputElement;
    fireEvent.change(subject, { target: { value: "Merci, et à bientôt" } });
    fireEvent.click(
      screen.getAllByRole("button", { name: "modifier le contenu" })[0]!,
    );
    await act(async () => void fireEvent.submit(subject.closest("form")!));
    await waitFor(() =>
      expect(actions.marketingAutomationAction).toHaveBeenCalled(),
    );
    const [org, ev, type] = actions.marketingAutomationAction.mock.calls[0]!;
    const data = actions.marketingAutomationAction.mock.calls[0]!.at(
      -1,
    ) as FormData;
    expect([
      org,
      ev,
      type,
      data.get("subject"),
      JSON.parse(String(data.get("content"))),
      data.get("enabled"),
    ]).toEqual([
      "club",
      "e1",
      "POST_EVENT",
      "Merci, et à bientôt",
      edited,
      "on",
    ]);
    expect(await screen.findByText(m.saved!)).toBeTruthy();
  });

  it("« derniers billets » : la carte de l'événement ajoutée à l'envoi figure aussi dans l'aperçu", () => {
    wrap(
      <EventMarketingEmails
        orgSlug="club"
        eventId="e1"
        automations={[automations[1]!]}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: (n) =>
          n === te.preview || n === te.hidePreview || /aperçu/i.test(n),
      }),
    );
    expect(previews.last!.content).toEqual({
      type: "doc",
      content: [{ type: "eventCard", attrs: { eventId: "e1" } }],
    });
  });

  it("e-mail déjà parti : signalé comme envoyé ; autre e-mail : moment de l'envoi annoncé", () => {
    const { container } = wrap(
      <EventMarketingEmails
        orgSlug="club"
        eventId="e1"
        automations={automations}
      />,
    );
    expect(container.textContent).toContain(m.sent!);
    expect(container.textContent).toContain(m.when_POST_EVENT!);
  });
});
