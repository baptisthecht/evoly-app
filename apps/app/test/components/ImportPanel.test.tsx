import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { ImportPanel } from "@/app/o/[orgSlug]/events/[eventId]/distribution/ImportPanel";
import { Fr } from "./intl";

// import des billets d'un réseau en 1 clic (docs/COMPATIBILITE_RESEAUX.md)
const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
const t = (fr as unknown as Record<string, Record<string, string>>)
  .distribution!;
const errors = (fr as unknown as Record<string, Record<string, string>>)
  .formErrors!;
const report = (o: Record<string, unknown> = {}) => ({
  created: 0,
  updated: 0,
  unchanged: 0,
  cancelled: 0,
  keptEntered: 0,
  ignored: [],
  withoutTarif: 0,
  overAllocation: [],
  seatsNotFound: 0,
  seatsSoldOnEvoly: [],
  ...o,
});
let replies: unknown[] = [];
const sent: FormData[] = [];
beforeEach(() => {
  replies = [];
  sent.length = 0;
  nav.refresh.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      sent.push(init!.body as FormData);
      return new Response(JSON.stringify(replies.shift()));
    }),
  );
});
async function chooseFile(name = "ticketmaster.csv") {
  render(
    <Fr>
      <ImportPanel orgSlug="club" eventId="e1" distributorId="tm" />
    </Fr>,
  );
  fireEvent.click(screen.getByRole("button", { name: t.importOpen }));
  const file = new File(["Code-barres\n4006381333931\n"], name, {
    type: "text/csv",
  });
  fireEvent.change(screen.getByLabelText(t.importFile!), {
    target: { files: [file] },
  });
  return file;
}

describe("import des billets d'un réseau", () => {
  it("en 1 clic : fichier envoyé avec le réseau et l'option fichier complet ; compte rendu ; page rafraîchie", async () => {
    replies = [
      {
        report: report({
          created: 2,
          ignored: [{ line: 4, reason: "LINE_NO_CODE" }],
        }),
      },
    ];
    const file = await chooseFile();
    fireEvent.click(screen.getByLabelText(t.importFullFile!));
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: t.importSubmit }),
        ),
    );
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    expect([
      sent[0]!.get("file"),
      sent[0]!.get("distributorId"),
      sent[0]!.get("fullFile"),
      sent[0]!.get("mapping"),
    ]).toEqual([file, "tm", "1", null]);
    expect(screen.getByRole("status").textContent).toContain(
      "2 billets ajoutés",
    );
    expect(screen.getByText("1 ligne ignorée")).toBeTruthy();
  });

  it("colonnes demandées : le choix « code-barres » relance l'import avec ces colonnes et le même fichier", async () => {
    replies = [
      {
        report: report({
          needsMapping: {
            headers: ["Ref", "Client"],
            sample: [["X-9001", "Léa"]],
            guess: {},
          },
        }),
      },
      { report: report({ created: 1 }) },
    ];
    const file = await chooseFile();
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: t.importSubmit }),
        ),
    );
    const go = await screen.findByRole("button", { name: t.mappingSubmit });
    expect((go as HTMLButtonElement).disabled).toBe(true); // ni code-barres ni réservation choisis
    expect(screen.getByText("X-9001")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Contenu de la colonne Ref"), {
      target: { value: "code" },
    });
    fireEvent.change(screen.getByLabelText("Contenu de la colonne Client"), {
      target: { value: "fullName" },
    });
    await act(async () => void fireEvent.click(go));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    expect([
      sent[1]!.get("file"),
      JSON.parse(String(sent[1]!.get("mapping"))),
      sent[1]!.get("header"),
    ]).toEqual([file, { code: 0, fullName: 1 }, "1"]);
  });

  it("erreur de fichier expliquée ; double vente signalée en alerte", async () => {
    replies = [
      { error: "IMPORT_FILE_OLD_EXCEL" },
      {
        report: report({
          created: 1,
          seatsSoldOnEvoly: [{ line: 3, seat: "C 12" }],
        }),
      },
    ];
    await chooseFile("ancien.xls");
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: t.importSubmit }),
        ),
    );
    expect(await screen.findByText(errors.IMPORT_FILE_OLD_EXCEL!)).toBeTruthy();
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: t.importSubmit }),
        ),
    );
    expect((await screen.findByRole("alert")).textContent).toContain("C 12");
  });
});
