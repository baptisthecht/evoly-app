import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { EnableForm, ManageForms } from "@/app/compte/securite/SecurityForms";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  enableAction: vi.fn(),
  disableAction: vi.fn(),
  regenerateAction: vi.fn(),
}));
vi.mock("@/app/compte/securite/actions", () => actions);
const all = fr as unknown as Record<string, Record<string, string>>;
const t =
  all[
    Object.keys(all).find((k) => all[k]?.codesTitle && all[k]?.staffRequired)!
  ]!;
const errorKey = Object.keys(t).find((k) =>
  /invalid|wrong|incorrect/i.test(k),
)!;
// espace insécable de la ponctuation française : comparé après la même normalisation des deux côtés
const norm = (x: string) => x.replace(/\s+/g, " ").trim();
const codes = ["AAAA-1111", "BBBB-2222", "CCCC-3333"];
beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
});
const send = async (button: HTMLElement) =>
  act(async () => void fireEvent.submit(button.closest("form")!));

describe("double authentification du compte (RG-AUTH-04)", () => {
  it("activation : code envoyé, puis les codes de secours s'affichent ; un code faux est expliqué", async () => {
    actions.enableAction
      .mockResolvedValueOnce({ error: errorKey })
      .mockResolvedValueOnce({ codes });
    render(
      <Fr>
        <EnableForm />
      </Fr>,
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "123456" },
    });
    await send(screen.getByRole("button", { name: t.enable }));
    expect(await screen.findByText(t[errorKey]!)).toBeTruthy();
    await send(screen.getByRole("button", { name: t.enable }));
    await waitFor(() => expect(screen.getByText(t.codesTitle!)).toBeTruthy());
    for (const c of codes)
      expect(screen.getByText((x) => x.includes(c))).toBeTruthy();
    expect(
      (actions.enableAction.mock.calls[0]!.at(-1) as FormData).get("code"),
    ).toBe("123456");
  });

  it("renouvellement des codes de secours : la nouvelle liste s'affiche", async () => {
    actions.regenerateAction.mockResolvedValue({ codes });
    render(
      <Fr>
        <ManageForms staff={false} />
      </Fr>,
    );
    await send(screen.getByRole("button", { name: t.regenerate }));
    await waitFor(() =>
      expect(screen.getByText((x) => x.includes("BBBB-2222"))).toBeTruthy(),
    );
  });

  it("compte de l'équipe Evoly : la double authentification ne peut pas être désactivée", () => {
    render(
      <Fr>
        <ManageForms staff />
      </Fr>,
    );
    expect(screen.queryByRole("button", { name: t.disable })).toBeNull();
    expect(
      screen.getByText((c) => norm(c) === norm(t.staffRequired!)),
    ).toBeTruthy();
  });

  it("autre compte : désactivation par un code ou un code de secours", async () => {
    actions.disableAction.mockResolvedValue({ error: errorKey });
    render(
      <Fr>
        <ManageForms staff={false} />
      </Fr>,
    );
    fireEvent.change(screen.getByRole("textbox", { name: t.codeOrRecovery }), {
      target: { value: "AAAA-1111" },
    });
    await send(screen.getByRole("button", { name: t.disable }));
    await waitFor(() =>
      expect(
        (actions.disableAction.mock.calls[0]!.at(-1) as FormData).get("code"),
      ).toBe("AAAA-1111"),
    );
    expect(await screen.findByText(t[errorKey]!)).toBeTruthy();
  });
});
