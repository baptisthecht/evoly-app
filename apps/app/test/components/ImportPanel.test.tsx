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
import { IMPORT_FIELDS } from "@/lib/importFields";
import { Fr } from "./intl";

// import des billets d'un réseau : lecture, confirmation de chaque information, import (docs/COMPATIBILITE_RESEAUX.md)
const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
const t = (fr as unknown as Record<string, Record<string, string>>)
  .distribution!;
const errors = (fr as unknown as Record<string, Record<string, string>>)
  .formErrors!;
const label = (field: string) => t[`field_${field}`]!;
const absentBox = (field: string) =>
  screen.getByLabelText(t.mappingAbsentFor!.replace("{field}", label(field)));
const columnSelect = (field: string) =>
  screen.getByLabelText(t.mappingFieldColumn!.replace("{field}", label(field)));
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
const preview = (o: Record<string, unknown> = {}) => ({
  fileName: "ticketmaster.csv",
  header: true,
  rowCount: 1,
  totalRows: 2,
  raw: [
    ["Code-barres", "Nom", "Divers"],
    ["TM-1", "Léa", "x"],
  ],
  proposal: { code: 0, fullName: 1 },
  remembered: false,
  warnings: [],
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
    vi.fn(
      async (_u: string, init?: RequestInit) => (
        sent.push(init!.body as FormData),
        new Response(JSON.stringify(replies.shift()))
      ),
    ),
  );
});
async function readFile() {
  render(
    <Fr>
      <ImportPanel orgSlug="club" eventId="e1" distributorId="tm" />
    </Fr>,
  );
  fireEvent.click(screen.getByRole("button", { name: t.importOpen }));
  const file = new File(
    ["Code-barres;Nom;Divers\nTM-1;Léa;x\n"],
    "ticketmaster.csv",
    { type: "text/csv" },
  );
  fireEvent.change(screen.getByLabelText(t.importFile!), {
    target: { files: [file] },
  });
  await act(
    async () =>
      void fireEvent.click(screen.getByRole("button", { name: t.readFile })),
  );
  return file;
}

describe("import : chaque information confirmée avant d'importer", () => {
  it("proposition reprise ; « Importer » inactif tant qu'une information n'est pas tranchée ; colonnes et absents envoyés", async () => {
    replies = [{ preview: preview() }, { report: report({ created: 1 }) }];
    const file = await readFile();
    expect(sent[0]!.get("step")).toBe("preview");
    const go = await screen.findByRole("button", { name: t.importSubmit });
    expect((go as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toBe(
      `${IMPORT_FIELDS.length - 2} informations à confirmer avant d’importer.`,
    );
    expect((columnSelect("code") as HTMLSelectElement).value).toBe("0");
    for (const f of IMPORT_FIELDS)
      if (f !== "code" && f !== "fullName") fireEvent.click(absentBox(f));
    expect((go as HTMLButtonElement).disabled).toBe(false);
    await act(async () => void fireEvent.click(go));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    const body = sent[1]!;
    expect([body.get("file"), body.get("step"), body.get("header")]).toEqual([
      file,
      "import",
      "1",
    ]);
    const mapping = JSON.parse(String(body.get("mapping")));
    expect(mapping).toMatchObject({
      code: 0,
      fullName: 1,
      email: null,
      consent: null,
    });
    expect(Object.keys(mapping).sort()).toEqual([...IMPORT_FIELDS].sort());
    expect(screen.getByText(t.importAnother!)).toBeTruthy();
  });

  it("choisir une colonne décoche « absent » ; sans code ni réservation, impossible d'importer", async () => {
    replies = [{ preview: preview({ proposal: {} }) }];
    await readFile();
    await screen.findByRole("button", { name: t.importSubmit });
    for (const f of IMPORT_FIELDS) fireEvent.click(absentBox(f));
    expect(screen.getByRole("status").textContent).toBe(t.mappingNeedKey);
    expect(
      (
        screen.getByRole("button", {
          name: t.importSubmit,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(columnSelect("code"), { target: { value: "0" } });
    expect((absentBox("code") as HTMLInputElement).checked).toBe(false);
    expect(
      (
        screen.getByRole("button", {
          name: t.importSubmit,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("alertes de la lecture affichées ; erreur de fichier expliquée", async () => {
    replies = [
      {
        preview: preview({
          proposal: {},
          warnings: ["NO_KEY", "NO_NAME", "UNKNOWN_HEADER"],
        }),
      },
    ];
    await readFile();
    const alert = await screen.findByRole("alert");
    for (const w of ["NO_KEY", "NO_NAME", "UNKNOWN_HEADER"])
      expect(alert.textContent).toContain(t[`warn_${w}`]!);
    fireEvent.click(screen.getByRole("button", { name: t.changeFile }));
    replies = [{ error: "IMPORT_FILE_OLD_EXCEL" }];
    fireEvent.change(screen.getByLabelText(t.importFile!), {
      target: { files: [new File(["x"], "ancien.xls")] },
    });
    await act(
      async () =>
        void fireEvent.click(screen.getByRole("button", { name: t.readFile })),
    );
    expect(await screen.findByText(errors.IMPORT_FILE_OLD_EXCEL!)).toBeTruthy();
  });
});
