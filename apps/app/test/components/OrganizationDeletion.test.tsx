import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { DeleteOrganization } from "@/app/o/[orgSlug]/settings/SettingsClient";
import { Fr } from "./intl";

// suppression de l'organisation (RG-ORG-06)
const settings = vi.hoisted(() => ({
  deleteOrganizationAction: vi.fn(),
  saveSettingsAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/settings/actions", () => settings);
const o = (fr as unknown as Record<string, Record<string, string>>)
  .orgSettings!;
beforeEach(() => {
  settings.deleteOrganizationAction.mockReset();
});

describe("suppression de l'organisation", () => {
  it("blocages : affichés à la place du formulaire", () => {
    render(
      <Fr>
        <DeleteOrganization
          orgSlug="club"
          name="Club de Mouscron"
          blockers={Object.keys(o)
            .filter((k) => k.startsWith("blocker_"))
            .slice(0, 2)
            .map((k) => k.slice(8))}
        />
      </Fr>,
    );
    expect(screen.queryByRole("button", { name: o.deleteSubmit })).toBeNull();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("double confirmation : champ affiché après « je comprends », nom mal recopié signalé, bon nom envoyé", async () => {
    settings.deleteOrganizationAction.mockResolvedValue({ ok: true });
    render(
      <Fr>
        <DeleteOrganization
          orgSlug="club"
          name="Club de Mouscron"
          blockers={[]}
        />
      </Fr>,
    );
    expect(document.getElementById("delete-confirm")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(document.getElementById("delete-confirm")!, {
      target: { value: "Club" },
    });
    expect(screen.getByText(o.deleteMismatch!)).toBeTruthy();
    fireEvent.change(document.getElementById("delete-confirm")!, {
      target: { value: " Club de Mouscron " },
    });
    expect(screen.queryByText(o.deleteMismatch!)).toBeNull();
    fireEvent.submit(
      document.getElementById("delete-confirm")!.closest("form")!,
    );
    await waitFor(() =>
      expect(settings.deleteOrganizationAction).toHaveBeenCalled(),
    );
    const [org, , form] = settings.deleteOrganizationAction.mock.calls[0] as [
      string,
      unknown,
      FormData,
    ];
    expect([org, form.get("understood"), form.get("confirmation")]).toEqual([
      "club",
      "on",
      " Club de Mouscron ",
    ]);
  });
});
