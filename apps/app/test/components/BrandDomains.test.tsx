import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { AddDomain, DomainRow, SubdomainForm, uploadFile } from "@/app/o/[orgSlug]/brand/BrandClient";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  addDomainAction: vi.fn(),
  changeSubdomainAction: vi.fn(),
  checkSubdomainAction: vi.fn(),
  domainCommandAction: vi.fn(),
  saveBrandAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/brand/actions", () => actions);
const t = (fr as unknown as Record<string, Record<string, string>>).brand!;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const fill = (msg: string, vars: Record<string, string>) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), msg);
beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: null });
  }
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const wrap = (ui: React.ReactNode) => render(<Fr>{ui}</Fr>);

describe("envoi d'une image de la marque", () => {
  it("vers la route d'envoi de l'organisation, avec le fichier, son usage et l'événement", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ url: "https://cdn.evoly.me/x.png" })));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["x"], "logo.png", { type: "image/png" });
    expect(await uploadFile("club", file, "cover", "e1")).toEqual({ url: "https://cdn.evoly.me/x.png" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = init.body as FormData;
    expect([url, init.method, body.get("kind"), body.get("eventId"), (body.get("file") as File).name]).toEqual([
      "/o/club/brand/upload",
      "POST",
      "cover",
      "e1",
      "logo.png",
    ]);
    await uploadFile("club", file, "logo");
    expect(((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as FormData).has("eventId")).toBe(false);
  });
});

describe("adresse de l'organisation (RG-SDM-02)", () => {
  const field = () => screen.getByRole("textbox", { name: t.subdomain });
  it("adresse inchangée : ni vérification ni annonce de redirection", async () => {
    vi.useFakeTimers();
    wrap(<SubdomainForm orgSlug="club" current="club" baseDomain="evoly.me" />);
    await act(async () => void (await vi.advanceTimersByTimeAsync(400)));
    expect(actions.checkSubdomainAction).not.toHaveBeenCalled();
    expect(screen.queryByText((c) => norm(c) === norm(fill(t.redirectNotice!, { old: "club.evoly.me" })))).toBeNull();
  });

  it("une réponse arrivée en retard n'est jamais affichée pour une autre adresse", async () => {
    vi.useFakeTimers();
    const replies: Array<(v: unknown) => void> = [];
    actions.checkSubdomainAction.mockImplementation(() => new Promise((ok) => replies.push(ok)));
    wrap(<SubdomainForm orgSlug="club" current="club" baseDomain="evoly.me" />);
    fireEvent.change(field(), { target: { value: "amis" } });
    await act(async () => void (await vi.advanceTimersByTimeAsync(305)));
    fireEvent.change(field(), { target: { value: "amis-2026" } });
    await act(async () => void (await vi.advanceTimersByTimeAsync(305)));
    await act(async () => replies[1]!({ ok: false, reason: "TAKEN" }));
    await act(async () => replies[0]!({ ok: true }));
    expect(screen.getByText(t.unavailable_TAKEN!)).toBeTruthy();
    expect(screen.queryByText(t.available!)).toBeNull();
  });

  it("nouvelle adresse : en minuscules, redirection de l'ancienne annoncée, changement confirmé", async () => {
    wrap(<SubdomainForm orgSlug="club" current="club" baseDomain="evoly.me" />);
    fireEvent.change(field(), { target: { value: "AMIS" } });
    expect((field() as HTMLInputElement).value).toBe("amis");
    expect(screen.getByText((c) => norm(c) === norm(fill(t.redirectNotice!, { old: "club.evoly.me" })))).toBeTruthy();
    await act(async () => void fireEvent.submit(screen.getByRole("button", { name: t.changeSubdomain }).closest("form")!));
    await waitFor(() => expect((actions.changeSubdomainAction.mock.calls[0]!.at(-1) as FormData).get("subdomain")).toBe("amis"));
    expect(await screen.findByText(t.subdomainChanged!)).toBeTruthy();
  });
});

describe("domaines personnalisés (section 9.21)", () => {
  it("ajout : pour l'organisation par défaut, ou pour un événement", async () => {
    wrap(<AddDomain orgSlug="club" events={[{ id: "e1", title: "Gala" }]} />);
    fireEvent.change(document.getElementById("new-domain")!, { target: { value: "billets.club.be" } });
    fireEvent.change(document.getElementById("domain-target")!, { target: { value: "e1" } });
    await act(async () => void fireEvent.submit(screen.getByRole("button", { name: t.addDomain }).closest("form")!));
    await waitFor(() => expect(actions.addDomainAction).toHaveBeenCalled());
    const data = actions.addDomainAction.mock.calls[0]!.at(-1) as FormData;
    expect([data.get("domain"), data.get("target")]).toEqual(["billets.club.be", "e1"]);
  });

  const dnsError = Object.keys(t).find((k) => k.startsWith("dnsError_"))!;
  const row = (over: Record<string, unknown> = {}, planOk = true) =>
    wrap(
      <DomainRow
        orgSlug="club"
        planOk={planOk}
        d={
          {
            id: "d1",
            domain: "billets.club.be",
            status: "PENDING_DNS",
            dnsTarget: "domaines.evoly.me",
            lastError: `${dnsError.slice(9)}:autre.cible`,
            target: "Organisation",
            checksStopped: false,
            ...over,
          } as never
        }
      />,
    );

  it("domaine en attente : instructions CNAME, valeur à copier, erreur trouvée, vérification à la demande", async () => {
    const { container } = row();
    expect(container.textContent).toContain("CNAME");
    expect(container.textContent).toContain("domaines.evoly.me");
    expect(container.textContent).toContain(t.autoChecks!);
    await act(async () => void fireEvent.submit(screen.getByRole("button", { name: t.verifyNow }).closest("form")!));
    await waitFor(() => expect(actions.domainCommandAction.mock.calls[0]!.slice(0, 3)).toEqual(["club", "d1", "verify"]));
  });

  it("sans l'offre Pro : désactivé ; domaine actif : ni instructions ni vérification", () => {
    const a = row({}, false);
    expect(a.container.textContent).toContain(t.domain_DISABLED!);
    a.unmount();
    const b = row({ status: "ACTIVE", lastError: null });
    expect(b.container.textContent).not.toContain("CNAME");
    expect(screen.queryByRole("button", { name: t.verifyNow })).toBeNull();
  });

  it("retrait : jamais sans confirmation", async () => {
    row();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(async () => void fireEvent.submit(screen.getByRole("button", { name: t.removeDomain }).closest("form")!));
    expect(confirm).toHaveBeenCalledWith(fill(t.confirmRemove!, { domain: "billets.club.be" }));
    expect(actions.domainCommandAction).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => void fireEvent.submit(screen.getByRole("button", { name: t.removeDomain }).closest("form")!));
    await waitFor(() => expect(actions.domainCommandAction.mock.calls[0]!.slice(0, 3)).toEqual(["club", "d1", "remove"]));
  });
});
