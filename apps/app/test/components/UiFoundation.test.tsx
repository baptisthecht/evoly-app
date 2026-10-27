import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ButtonTabs } from "@/components/ui/ButtonTabs";
import { Badge } from "@/components/ui/Card";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Fr } from "./intl";

// socle de la refonte : tableau, fenêtre, onglets en boutons, pastille
const nav = vi.hoisted(() => ({
  path: "/o/club/events/e1/tickets",
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ push: nav.push }),
}));
if (!("PointerEvent" in window))
  Object.defineProperty(window, "PointerEvent", {
    value: class extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    },
  });
beforeEach(() => nav.push.mockReset());

type Order = {
  id: string;
  buyer: string;
  total: number;
  status: "PAID" | "REFUNDED";
};
const orders: Order[] = [
  { id: "o1", buyer: "Léa Martin", total: 4500, status: "PAID" },
  { id: "o2", buyer: "Tom Dubois", total: 1200, status: "REFUNDED" },
  { id: "o3", buyer: "Inès Benali", total: 9000, status: "PAID" },
];
const columns: TableColumn<Order>[] = [
  { key: "buyer", header: "Acheteur", sortable: true, mobile: "title" },
  {
    key: "status",
    header: "Statut",
    mobile: "badge",
    cell: (o) => (
      <Badge tone={o.status === "PAID" ? "success" : "neutral"} dot>
        {o.status === "PAID" ? "Payée" : "Remboursée"}
      </Badge>
    ),
  },
  {
    key: "total",
    header: "Total",
    sortable: true,
    align: "right",
    cell: (o) => `${(o.total / 100).toFixed(2)} €`,
  },
];
const table = () => screen.getByRole("table");
const names = () =>
  within(table())
    .getAllByRole("row")
    .slice(1)
    .map(
      (r) => r.querySelector("td:nth-child(2) a, td:nth-child(2)")!.textContent,
    );

function Orders(props: Partial<Parameters<typeof DataTable<Order>>[0]> = {}) {
  const [sel, setSel] = useState<string[]>([]);
  return (
    <Fr>
      <DataTable
        rows={orders}
        columns={columns}
        getRowId={(o) => o.id}
        caption="Commandes"
        selectable
        selected={sel}
        onSelectedChange={setSel}
        rowHref={(o) => `/o/club/orders/${o.id}`}
        bulkActions={(ids) => (
          <button type="button">Exporter {ids.length}</button>
        )}
        {...props}
      />
    </Fr>
  );
}

describe("tableau Evoly", () => {
  it("tri : croissant puis décroissant, annoncé aux lecteurs d'écran", () => {
    render(<Orders />);
    const total = within(table()).getByRole("button", { name: /Total/ });
    fireEvent.click(total);
    expect(total.closest("th")!.getAttribute("aria-sort")).toBe("ascending");
    expect(names()).toEqual(["Tom Dubois", "Léa Martin", "Inès Benali"]);
    fireEvent.click(total);
    expect([
      total.closest("th")!.getAttribute("aria-sort"),
      names()[0],
    ]).toEqual(["descending", "Inès Benali"]);
  });

  it("sélection : barre d'actions groupées avec les bonnes lignes, tout sélectionner, annuler", () => {
    render(<Orders />);
    fireEvent.click(
      within(table()).getAllByRole("checkbox", {
        name: /Sélectionner la ligne/,
      })[0]!,
    );
    const bar = screen.getByRole("region", { name: "Sélection" });
    expect(within(bar).getByText("1 sélectionné")).toBeTruthy();
    expect(
      within(bar).getByRole("button", { name: "Exporter 1" }),
    ).toBeTruthy();
    fireEvent.click(
      within(table()).getByRole("checkbox", { name: "Tout sélectionner" }),
    );
    expect(within(bar).getByText("3 sélectionnés")).toBeTruthy();
    fireEvent.click(
      within(bar).getByRole("button", { name: "Annuler la sélection" }),
    );
    expect(screen.queryByRole("region", { name: "Sélection" })).toBeNull();
  });

  it("ligne cliquable vers sa fiche, sauf sur sa case ; le titre est un lien", () => {
    render(<Orders />);
    const row = within(table()).getAllByRole("row")[1]!;
    fireEvent.click(row.querySelector("td:last-child")!);
    expect(nav.push).toHaveBeenCalledWith("/o/club/orders/o1");
    nav.push.mockReset();
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(nav.push).not.toHaveBeenCalled();
    expect(
      within(row)
        .getByRole("link", { name: "Léa Martin" })
        .getAttribute("href"),
    ).toBe("/o/club/orders/o1");
  });

  it("vide : son titre et son bouton ; chargement : lignes fantômes", () => {
    const { unmount } = render(
      <Orders
        rows={[]}
        emptyState={{
          title: "Aucune commande",
          action: <button type="button">Partager le lien</button>,
        }}
      />,
    );
    expect(within(table()).getByText("Aucune commande")).toBeTruthy();
    expect(
      within(table()).getByRole("button", { name: "Partager le lien" }),
    ).toBeTruthy();
    unmount();
    render(<Orders rows={[]} loading />);
    expect(
      table().querySelectorAll('tbody tr[aria-hidden="true"]').length,
    ).toBe(4);
  });

  it("téléphone : chaque ligne devient une carte, avec son titre, ses pastilles et ses détails", () => {
    render(<Orders />);
    const cards = within(
      screen.getByRole("list", { name: "Commandes" }),
    ).getAllByRole("listitem");
    expect(cards).toHaveLength(3);
    expect(within(cards[0]!).getByRole("link").getAttribute("href")).toBe(
      "/o/club/orders/o1",
    );
    expect(cards[0]!.textContent).toContain("Léa Martin");
    expect(cards[0]!.textContent).toContain("Payée");
    expect(cards[0]!.textContent).toContain("Total45.00 €");
  });
});

describe("fenêtre", () => {
  function Host({ onClose = vi.fn() }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <Fr>
        <button type="button" onClick={() => setOpen(true)}>
          Ajouter un code
        </button>
        <Dialog
          open={open}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          title="Nouveau code promo"
        >
          <label>
            Code
            <input />
          </label>
        </Dialog>
      </Fr>
    );
  }

  it("Échap, le fond, la croix et la poignée tirée la ferment ; le clavier y entre puis revient au bouton", async () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    const opener = screen.getByRole("button", { name: "Ajouter un code" });
    opener.focus();
    await act(async () => void fireEvent.click(opener));
    const dialog = screen.getByRole("dialog", { name: "Nouveau code promo" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    await act(async () => void fireEvent.click(opener));
    fireEvent.click(screen.getAllByRole("button", { name: "Fermer" })[0]!); // le fond
    await act(async () => void fireEvent.click(opener));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Fermer",
      }),
    ); // la croix
    await act(async () => void fireEvent.click(opener));
    const grab = screen.getByRole("dialog").querySelector("[data-grab]")!;
    fireEvent.pointerDown(grab, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(grab, { clientY: 320, pointerId: 1 });
    fireEvent.pointerUp(grab, { clientY: 320, pointerId: 1 });
    expect(onClose).toHaveBeenCalledTimes(4);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("onglets en boutons et pastille", () => {
  it("l'onglet actif : l'adresse exacte, sinon le plus long préfixe ; compteur facultatif", () => {
    nav.path = "/o/club/events/e1/tickets/questions";
    render(
      <ButtonTabs
        label="Billetterie"
        items={[
          { href: "/o/club/events/e1/tickets", label: "Tarifs" },
          {
            href: "/o/club/events/e1/tickets/questions",
            label: "Questions",
            count: 3,
          },
        ]}
      />,
    );
    const nav2 = screen.getByRole("navigation", { name: "Billetterie" });
    expect(
      within(nav2).getByRole("link", { current: "page" }).textContent,
    ).toBe("Questions3");
    expect(
      within(nav2)
        .getByRole("link", { name: "Tarifs" })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("pastille : point de couleur, et point qui pulse pour un état en cours", () => {
    const { container } = render(
      <Badge tone="info" live>
        En vente
      </Badge>,
    );
    expect(container.textContent).toBe("En vente");
    expect(container.querySelector(".animate-ping")).toBeTruthy();
  });
});
