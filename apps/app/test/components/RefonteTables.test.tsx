import { EUR_TERMS } from "@evoly/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { CompareOffers } from "@/app/o/[orgSlug]/billing/CompareOffers";
import { EventResaleTable } from "@/app/o/[orgSlug]/events/[eventId]/resale/EventResaleTable";
import { OptionsTable } from "@/app/o/[orgSlug]/events/[eventId]/options/OptionsTable";
import { PromoTable } from "@/app/o/[orgSlug]/events/[eventId]/promo/PromoTable";
import { ComplimentaryTable } from "@/app/o/[orgSlug]/events/[eventId]/tickets/complimentary/ComplimentaryTable";
import { TicketTypesTable } from "@/app/o/[orgSlug]/events/[eventId]/tickets/TicketTypesTable";
import type { TicketTypeRow } from "@/app/o/[orgSlug]/events/[eventId]/tickets/TicketTypeEditor";
import { FinanceByEventTable } from "@/app/o/[orgSlug]/finances/FinanceTables";
import {
  CampaignsTable,
  ContactsTable,
  ImportDialog,
} from "@/app/o/[orgSlug]/marketing/MarketingTables";
import {
  InviteDialog,
  MembersTable,
} from "@/app/o/[orgSlug]/members/MembersTable";
import { OrdersTable } from "@/app/o/[orgSlug]/orders/OrdersTable";
import { ResaleTable } from "@/app/o/[orgSlug]/resale/ResaleTable";
import { Fr } from "./intl";

// tableaux de la refonte (étape 3) : pastilles, jauges, liens, actions et fenêtres
const ev = vi.hoisted(() =>
  Object.fromEntries(
    [
      "cancelListingAction",
      "complimentaryAction",
      "createOptionAction",
      "createPromoAction",
      "optionCommandAction",
      "optionsRefundPolicyAction",
      "promoCommandAction",
      "saveTicketTypeAction",
      "saveTiersAction",
      "ticketCommandAction",
      "updateOptionAction",
    ].map((k) => [k, vi.fn(async () => null)]),
  ),
);
const team = vi.hoisted(() =>
  Object.fromEntries(
    [
      "deleteRoleAction",
      "invitationCommandAction",
      "inviteAction",
      "leaveAction",
      "memberRoleAction",
      "removeMemberAction",
      "saveRoleAction",
      "transferAction",
    ].map((k) => [k, vi.fn(async () => null)]),
  ),
);
vi.mock("@/app/o/[orgSlug]/events/actions", () => ev);
vi.mock("@/app/o/[orgSlug]/members/actions", () => team);
vi.mock("next/navigation", () => ({
  usePathname: () => "/o/club",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
const all = fr as unknown as Record<string, Record<string, string>>;
const table = () => screen.getByRole("table");
const draw = (ui: React.ReactNode) => render(<Fr>{ui}</Fr>);

describe("codes promo et équipe", () => {
  it("codes promo : jauge des utilisations, point qui pulse pour un code actif, supprimer seulement s'il n'a pas servi", () => {
    draw(
      <PromoTable
        orgSlug="club"
        eventId="e1"
        manage
        rows={[
          {
            id: "p1",
            code: "GALA",
            active: true,
            unlocks: true,
            value: "−20 %",
            scope: "Tous les tarifs",
            used: 5,
            max: 10,
            until: null,
          },
          {
            id: "p2",
            code: "VIP",
            active: false,
            unlocks: false,
            value: "Gratuit",
            scope: "VIP",
            used: 0,
            max: null,
            until: "12 mai",
          },
        ]}
      />,
    );
    const rows = within(table()).getAllByRole("row").slice(1);
    const gala = rows.find((r) => r.textContent!.includes("GALA"))!;
    expect(gala.textContent).toContain("5 / 10 utilisations");
    expect(
      gala.querySelector<HTMLElement>('[style*="width"]')!.style.width,
    ).toBe("50%");
    expect(gala.querySelector(".animate-ping")).toBeTruthy();
    expect(gala.textContent).toContain(all.promo!.unlocks);
    expect(
      within(gala).queryByRole("button", { name: all.promo!.delete }),
    ).toBeNull();
    const vip = rows.find((r) => r.textContent!.includes("VIP"))!;
    expect(
      within(vip).getByRole("button", { name: all.promo!.delete }),
    ).toBeTruthy();
    expect(
      within(vip).getByRole("button", { name: all.promo!.activate }),
    ).toBeTruthy();
  });

  it("membres : initiales, rôle modifiable sur place ou pastille ; inviter ouvre la fenêtre", async () => {
    draw(
      <>
        <InviteDialog
          orgSlug="club"
          roles={[{ id: "r1", label: "Billetterie" }]}
        />
        <MembersTable
          orgSlug="club"
          roles={[{ id: "r1", label: "Billetterie" }]}
          rows={[
            {
              id: "m1",
              name: "Léa Martin",
              email: "lea@club.be",
              joined: "1 mars",
              joinedAt: 1,
              self: true,
              owner: true,
              suspended: false,
              roleId: "o",
              roleLabel: "Propriétaire",
              editable: false,
            },
            {
              id: "m2",
              name: "Tom Dubois",
              email: "tom@club.be",
              joined: "2 mars",
              joinedAt: 2,
              self: false,
              owner: false,
              suspended: true,
              roleId: "r1",
              roleLabel: "Billetterie",
              editable: true,
            },
          ]}
        />
      </>,
    );
    const rows = within(table()).getAllByRole("row").slice(1);
    expect(rows[0]!.textContent).toContain("LM");
    expect(rows[0]!.textContent).toContain("Propriétaire");
    expect(within(rows[1]!).getByRole("combobox")).toBeTruthy();
    expect(rows[1]!.textContent).toContain(all.team!.suspended);
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: `+ ${all.team!.inviteTitle}` }),
        ),
    );
    expect(
      screen.getByRole("dialog", { name: all.team!.inviteTitle }),
    ).toBeTruthy();
  });
});

describe("marketing, commandes, revente", () => {
  it("contacts : consentement en pastille ; campagnes : lien vers la fiche, taux, point qui pulse pendant l'envoi", () => {
    const { unmount } = draw(
      <ContactsTable
        rows={[
          {
            id: "c1",
            name: "Inès Benali",
            email: "ines@x.be",
            consent: "yes",
            consentLabel: "Accepte",
            orders: 2,
            tickets: 3,
            spent: "45 €",
            spentMinor: 4500,
            last: "1 mai",
            lastAt: 1,
          },
        ]}
      />,
    );
    expect(within(table()).getByText("Accepte")).toBeTruthy();
    expect(within(table()).getByText("IB")).toBeTruthy();
    unmount();
    draw(
      <CampaignsTable
        rows={[
          {
            id: "k1",
            name: "Rentrée",
            subject: "On rouvre",
            status: "SENDING",
            statusLabel: "En cours",
            recipients: 100,
            opens: 42,
            clicks: null,
            when: "2 mai",
            whenAt: 1,
            href: "/o/club/marketing/campaigns/k1",
          },
        ]}
      />,
    );
    const row = within(table()).getAllByRole("row")[1]!;
    expect(
      within(row)
        .getByRole("link", { name: /Rentrée/ })
        .getAttribute("href"),
    ).toBe("/o/club/marketing/campaigns/k1");
    expect(row.textContent).toContain("42 %");
    expect(row.querySelector(".animate-ping")).toBeTruthy();
  });

  it("import des contacts dans une fenêtre", async () => {
    draw(
      <ImportDialog label="Importer des contacts">
        <p>Formulaire d'import</p>
      </ImportDialog>,
    );
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: "Importer des contacts" }),
        ),
    );
    expect(
      within(screen.getByRole("dialog")).getByText("Formulaire d'import"),
    ).toBeTruthy();
  });

  it("commandes : pastille du canal, pastilles de suivi, seule une commande Evoly mène à sa fiche", () => {
    const base = {
      email: "x@y.be",
      reference: "R1",
      extra: [],
      tickets: 1,
      total: "10 €",
      totalMinor: 1000,
      date: "1 mai",
      dateAt: 1,
    };
    draw(
      <OrdersTable
        caption="Commandes"
        rows={[
          {
            ...base,
            id: "o1",
            kind: "order",
            name: "Léa Martin",
            event: "Gala",
            channel: "Evoly",
            statusLabel: "Payée",
            statusTone: "success",
            extra: [{ label: "Remboursement demandé", tone: "warning" }],
            href: "/o/club/orders/o1",
          },
          {
            ...base,
            id: "x1",
            kind: "network",
            name: "Fnac 1234",
            event: "Debout",
            channel: "Fnac",
            statusLabel: "Pas encore entré",
            statusTone: "neutral",
            href: null,
          },
        ]}
        footer={<nav aria-label="Pagination">…</nav>}
      />,
    );
    const rows = within(table()).getAllByRole("row").slice(1);
    const order = rows.find((r) => r.textContent!.includes("Léa"))!;
    const network = rows.find((r) => r.textContent!.includes("Fnac 1234"))!;
    expect(
      within(order)
        .getByRole("link", { name: /^Léa Martin/ })
        .getAttribute("href"),
    ).toBe("/o/club/orders/o1");
    expect(order.textContent).toContain("Remboursement demandé");
    expect(within(network).queryByRole("link")).toBeNull();
    expect(network.textContent).toContain("Fnac");
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeTruthy();
  });

  it("revente : transfert en pastille, point qui pulse en vente ; événement : échec expliqué, annulation possible seulement en vente", () => {
    const { unmount } = draw(
      <ResaleTable
        rows={[
          {
            id: "l1",
            code: "AB12",
            type: "Adulte",
            event: "Gala",
            price: null,
            priceMinor: 0,
            status: "ACTIVE",
            statusLabel: "En vente",
            tone: "success",
            listed: "1 mai",
            listedAt: 1,
            href: "/o/club/events/e1/resale",
          },
        ]}
      />,
    );
    const r = within(table()).getAllByRole("row")[1]!;
    expect(r.textContent).toContain(all.resaleAdmin!.transfer);
    expect(r.querySelector(".animate-ping")).toBeTruthy();
    unmount();
    const row = {
      code: "CD34",
      type: "Adulte",
      seller: "s@x.be",
      price: "20 €",
      priceMinor: 2000,
      face: "25 €",
      listed: "1 mai",
      listedAt: 1,
      sold: null,
      refund: null,
    };
    draw(
      <EventResaleTable
        orgSlug="club"
        eventId="e1"
        rows={[
          {
            ...row,
            id: "a",
            status: "FAILED",
            statusLabel: "Échouée",
            tone: "danger",
            cancellable: false,
          },
          {
            ...row,
            id: "b",
            code: "EF56",
            status: "ACTIVE",
            statusLabel: "En vente",
            tone: "success",
            cancellable: true,
          },
        ]}
      />,
    );
    const rows = within(table()).getAllByRole("row").slice(1);
    const failed = rows.find((x) => x.textContent!.includes("CD34"))!;
    expect(failed.textContent).toContain(all.resaleAdmin!.failedHint);
    expect(within(failed).queryByRole("button")).toBeNull();
    expect(
      within(rows.find((x) => x.textContent!.includes("EF56"))!).getByRole(
        "button",
      ),
    ).toBeTruthy();
  });
});

describe("billetterie et finances", () => {
  it("billets offerts : entrées en pastilles ; « Offrir des billets » ouvre la fenêtre avec le formulaire", async () => {
    const row = {
      email: "g@x.be",
      types: "2 × Adulte",
      sent: "1 mai",
      sentAt: 1,
      href: "/o/club/orders/c",
    };
    draw(
      <ComplimentaryTable
        orgSlug="club"
        eventId="e1"
        manage
        ticketTypes={[{ id: "t1", name: "Adulte" }]}
        rows={[
          { ...row, id: "c1", name: "Tous", tickets: 2, entered: 2 },
          { ...row, id: "c2", name: "Moitié", tickets: 2, entered: 1 },
          { ...row, id: "c3", name: "Aucun", tickets: 2, entered: 0 },
        ]}
      />,
    );
    const text = within(table())
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.textContent!);
    expect(text.some((x) => x.includes(all.complimentary!.allIn!))).toBe(true);
    expect(text.some((x) => x.includes("1 sur 2 entrés"))).toBe(true);
    expect(text.some((x) => x.includes(all.complimentary!.notYet!))).toBe(true);
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: `+ ${all.complimentary!.title}` }),
        ),
    );
    expect(
      within(screen.getByRole("dialog")).getByLabelText(
        all.complimentary!.recipients!,
      ),
    ).toBeTruthy();
  });

  it("options : jauge du stock ; ajouter, réglages et modifier ouvrent chacun leur fenêtre", async () => {
    draw(
      <OptionsTable
        orgSlug="club"
        eventId="e1"
        manage
        symbol="€"
        refundAfterStart={false}
        rows={[
          {
            id: "op1",
            name: "Vestiaire",
            description: "",
            price: "2 €",
            priceMinor: 200,
            sold: 25,
            stock: 100,
            redeemed: 3,
            maxPerOrder: 4,
            active: true,
            initial: {
              id: "op1",
              name: "Vestiaire",
              description: "",
              price: "2.00",
              stock: "100",
              maxPerOrder: "4",
              standalone: false,
            },
          },
        ]}
      />,
    );
    const row = within(table()).getAllByRole("row")[1]!;
    expect(
      row.querySelector<HTMLElement>('[style*="width"]')!.style.width,
    ).toBe("25%");
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: `+ ${all.options!.newTitle}` }),
        ),
    );
    expect(
      screen.getByRole("dialog", { name: all.options!.newTitle }),
    ).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: all.options!.settings }),
        ),
    );
    expect(
      screen.getByRole("dialog", { name: all.options!.settings }),
    ).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await act(
      async () =>
        void fireEvent.click(
          within(row).getByRole("button", { name: all.options!.edit }),
        ),
    );
    expect(screen.getByRole("dialog", { name: "Vestiaire" })).toBeTruthy();
  });

  it("tarifs : complet, paliers, période de vente ; « Modifier » ouvre l'édition complète", async () => {
    const tt = (over: Partial<TicketTypeRow>): TicketTypeRow => ({
      id: "t1",
      name: "Adulte",
      description: "",
      price: "25",
      priceMinor: 2500,
      quantity: "100",
      quantitySold: 100,
      minPerOrder: 1,
      maxPerOrder: 10,
      maxPerBuyer: null,
      salesStartLocal: "",
      salesEndLocal: "",
      visibility: "VISIBLE",
      status: "ACTIVE",
      isNominative: false,
      requireHolderEmail: false,
      resaleAllowed: true,
      priceLocked: true,
      tiers: [],
      ...over,
    });
    draw(
      <TicketTypesTable
        orgSlug="club"
        eventId="e1"
        terms={EUR_TERMS.free}
        currency="EUR"
        tiersEnabled
        tiersLocked={false}
        manage
        rows={[
          tt({}),
          tt({
            id: "t2",
            name: "Enfant",
            quantity: "",
            quantitySold: 3,
            visibility: "CODE_ONLY",
            tiers: [
              {
                id: "p",
                name: "Prévente",
                price: "10",
                startsAtLocal: "",
                endsAtLocal: "",
                quantityLimit: "",
                sold: 0,
              },
            ],
          }),
        ]}
      />,
    );
    const rows = within(table()).getAllByRole("row").slice(1);
    expect(rows[0]!.textContent).toContain(all.tickets!.tableSoldOut);
    expect(rows[1]!.textContent).toContain("1 palier");
    expect(rows[1]!.textContent).toContain(all.tickets!.tableAlways);
    await act(
      async () =>
        void fireEvent.click(
          within(rows[0]!).getByRole("button", { name: all.tickets!.edit }),
        ),
    );
    expect(
      within(screen.getByRole("dialog", { name: "Adulte" })).getByLabelText(
        new RegExp(all.tickets!.name!),
      ),
    ).toBeTruthy();
  });

  it("finances : déductions en rouge doux, net en vert, l'événement mène à sa vue d'ensemble ; comparer les offres dans une fenêtre", async () => {
    draw(
      <>
        <FinanceByEventTable
          rows={[
            {
              id: "e1",
              title: "Gala",
              tickets: 10,
              gross: "250 €",
              grossMinor: 25000,
              refunded: "25 €",
              refundedMinor: 2500,
              commission: null,
              commissionMinor: 0,
              bankFees: "3 €",
              bankFeeMinor: 300,
              net: "222 €",
              netMinor: 22200,
              href: "/o/club/events/e1",
            },
          ]}
        />
        <CompareOffers label="Comparer les offres" title="Comparer">
          <p>Free et Pro</p>
        </CompareOffers>
      </>,
    );
    const row = within(table()).getAllByRole("row")[1]!;
    expect(row.textContent).toContain("−25 €");
    expect(row.querySelector(".text-success")!.textContent).toBe("222 €");
    expect(
      within(row).getByRole("link", { name: "Gala" }).getAttribute("href"),
    ).toBe("/o/club/events/e1");
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: "Comparer les offres" }),
        ),
    );
    expect(
      within(screen.getByRole("dialog", { name: "Comparer" })).getByText(
        "Free et Pro",
      ),
    ).toBeTruthy();
  });
});
