import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import {
  CorrectEmail,
  HolderForm,
} from "@/app/o/[orgSlug]/orders/[orderId]/OrderActions";
import { Fr } from "./intl";

// page d'une commande : titulaire d'un billet (ajout, modification) et correction de l'e-mail annulée
const actions = vi.hoisted(() => ({
  correctEmailAction: vi.fn(),
  decideRefundAction: vi.fn(),
  holderAction: vi.fn(),
  refundOptionsAction: vi.fn(),
  refundTicketsAction: vi.fn(),
  resendTicketsAction: vi.fn(),
  revertCheckInAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/orders/actions", () => actions);
const t = (fr as unknown as Record<string, Record<string, string>>)
  .ordersAdmin!;
beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
});

describe("titulaire d'un billet", () => {
  it("sans titulaire : « ajouter » ouvre le formulaire ; prénom et nom envoyés pour ce billet", async () => {
    actions.holderAction.mockResolvedValue({ ok: true });
    render(
      <Fr>
        <HolderForm
          orgSlug="club"
          orderId="o1"
          ticketId="tk1"
          firstName=""
          lastName=""
        />
      </Fr>,
    );
    fireEvent.click(screen.getByRole("button", { name: t.addHolder }));
    fireEvent.change(screen.getByLabelText(t.firstName!), {
      target: { value: "Tom" },
    });
    fireEvent.change(screen.getByLabelText(t.lastName!), {
      target: { value: "Dubois" },
    });
    fireEvent.submit(screen.getByLabelText(t.firstName!).closest("form")!);
    await waitFor(() => expect(actions.holderAction).toHaveBeenCalled());
    const [org, order, ticket, , form] = actions.holderAction.mock.calls[0] as [
      string,
      string,
      string,
      unknown,
      FormData,
    ];
    expect([
      org,
      order,
      ticket,
      form.get("firstName"),
      form.get("lastName"),
    ]).toEqual(["club", "o1", "tk1", "Tom", "Dubois"]);
  });

  it("titulaire connu : « modifier » ouvre le formulaire déjà rempli", () => {
    render(
      <Fr>
        <HolderForm
          orgSlug="club"
          orderId="o1"
          ticketId="tk1"
          firstName="Léa"
          lastName="Martin"
        />
      </Fr>,
    );
    expect(screen.queryByRole("button", { name: t.addHolder })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: t.editHolder }));
    expect(
      (screen.getByLabelText(t.firstName!) as HTMLInputElement).value,
    ).toBe("Léa");
    expect((screen.getByLabelText(t.lastName!) as HTMLInputElement).value).toBe(
      "Martin",
    );
  });
});

describe("correction de l'e-mail", () => {
  it("formulaire ouvert avec l'adresse actuelle ; « annuler » le referme sans rien envoyer", () => {
    render(
      <Fr>
        <CorrectEmail orgSlug="club" orderId="o1" email="lea@exemple.be" />
      </Fr>,
    );
    fireEvent.click(screen.getByRole("button", { name: t.correctEmail }));
    expect(
      (document.getElementById("new-email") as HTMLInputElement).value,
    ).toBe("lea@exemple.be");
    fireEvent.click(screen.getByRole("button", { name: t.cancel }));
    expect(document.getElementById("new-email")).toBeNull();
    expect(screen.getByRole("button", { name: t.correctEmail })).toBeTruthy();
    expect(actions.correctEmailAction).not.toHaveBeenCalled();
  });
});
