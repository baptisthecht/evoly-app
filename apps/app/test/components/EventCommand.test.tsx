import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { EventCommand } from "@/app/o/[orgSlug]/events/[eventId]/EventCommands";
import { Fr } from "./intl";

// commandes d'un événement (publier, suspendre, reprendre, dupliquer, supprimer) : confirmation, action, erreur
const events = vi.hoisted(() => ({ eventCommandAction: vi.fn() }));
vi.mock("@/app/o/[orgSlug]/events/actions", () => events);
const t = (fr as unknown as Record<string, Record<string, string>>).events!;
const draw = (command: "publish" | "delete", confirm?: string) =>
  render(
    <Fr>
      <EventCommand orgSlug="club" eventId="e1" command={command} confirm={confirm} />
    </Fr>,
  );
beforeEach(() => {
  events.eventCommandAction.mockReset();
});

describe("commandes d'un événement", () => {
  it("suppression avec confirmation : refusée, rien ne part ; acceptée, la commande est envoyée", async () => {
    events.eventCommandAction.mockResolvedValue({ ok: true });
    draw("delete", "Supprimer cet événement ?");
    const button = screen.getByRole("button", { name: t.command_delete });
    expect(button.className).toContain("text-danger");
    vi.stubGlobal("confirm", () => false);
    fireEvent.submit(button.closest("form")!);
    expect(events.eventCommandAction).not.toHaveBeenCalled();
    vi.stubGlobal("confirm", () => true);
    fireEvent.submit(button.closest("form")!);
    await waitFor(() => expect(events.eventCommandAction).toHaveBeenCalled());
    expect((events.eventCommandAction.mock.calls[0] as unknown[]).slice(0, 3)).toEqual(["club", "e1", "delete"]);
  });

  it("publication refusée par le serveur : l'erreur s'affiche", async () => {
    events.eventCommandAction.mockResolvedValue({ ok: false, error: "PUBLISH_STRIPE_REQUIRED" });
    draw("publish");
    fireEvent.submit(screen.getByRole("button", { name: t.command_publish }).closest("form")!);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
