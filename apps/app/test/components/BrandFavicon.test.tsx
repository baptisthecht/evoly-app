import { contrastRatio, inkOn, palette } from "@evoly/ui";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import {
  BrandForm,
  type BrandValues,
} from "@/app/o/[orgSlug]/brand/BrandClient";
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
const ratio = (c: string) => Math.round(contrastRatio(c, inkOn(c)) * 10) / 10;
const contrastText = (c: string) =>
  norm(t.contrast!.replace("{ratio}", String(ratio(c)).replace(".", ",")));
const contrastAlt = (c: string) =>
  norm(t.contrast!.replace("{ratio}", String(ratio(c))));
const values = (over: Partial<BrandValues> = {}): BrandValues => ({
  displayName: "Club",
  logoUrl: "",
  faviconUrl: "",
  primaryColor: "#1B4D8C",
  accentColor: "#FFB8E8",
  emailFromName: "Club",
  emailReplyTo: "",
  hideEvolyBranding: false,
  backgroundColor: "",
  radius: "",
  headingFont: "",
  bodyFont: "",
  buttonLabel: "",
  socials: {
    website: "",
    instagram: "",
    facebook: "",
    tiktok: "",
    linkedin: "",
    youtube: "",
  },
  ...over,
});
beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: null });
  }
});
afterEach(() => vi.unstubAllGlobals());
const draw = (v = values(), canHide = true) =>
  render(
    <Fr>
      <BrandForm
        orgSlug="club"
        values={v}
        organizationName="Club"
        canHide={canHide}
      />
    </Fr>,
  );
const hasContrast = (c: string) =>
  screen.getAllByText((x) =>
    [contrastText(c), contrastAlt(c)].includes(norm(x)),
  ).length > 0;

describe("marque : favicon", () => {
  it("favicon envoyé avec son usage, puis affiché", async () => {
    const sent: FormData[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.body instanceof FormData) sent.push(init.body);
        return new Response(
          JSON.stringify({ url: "https://cdn.evoly.me/orgs/o1/favicon.png" }),
        );
      }),
    );
    const { container } = draw();
    const input = container.querySelectorAll(
      'input[type="file"]',
    )[1] as HTMLInputElement;
    await act(
      async () =>
        void fireEvent.change(input, {
          target: {
            files: [new File(["x"], "favicon.png", { type: "image/png" })],
          },
        }),
    );
    await waitFor(() =>
      expect(
        container.querySelector(
          'img[src="https://cdn.evoly.me/orgs/o1/favicon.png"]',
        ),
      ).not.toBeNull(),
    );
    expect(sent.some((f) => [...f.values()].includes("favicon"))).toBe(true);
  });
});
