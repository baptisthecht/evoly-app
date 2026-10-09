import { describe, expect, it } from "vitest";
import { ticketCommission } from "@evoly/core";
import { findCountry } from "@/lib/countries";
import { getPlans } from "@/server/plans";

describe("livre sterling et franc suisse (P1)", () => {
  it("livre : équivalent de l'euro ; franc suisse : mêmes montants qu'en euros", async () => {
    const plans = await getPlans();
    const gbp = { free: plans.free.terms.GBP!, pro: plans.pro.terms.GBP! };
    const chf = { free: plans.free.terms.CHF!, pro: plans.pro.terms.CHF! };
    expect(ticketCommission(1000, gbp.free)).toBe(45); // 0,25 £ + 2 % de 10 £
    expect(ticketCommission(50_000, gbp.free)).toBe(215); // plafond 2,15 £
    expect(ticketCommission(50_000, gbp.pro)).toBe(85); // plafond 0,85 £
    expect(ticketCommission(1000, chf.free)).toBe(49); // 0,29 CHF + 2 % de 10 CHF
    expect(ticketCommission(50_000, chf.free)).toBe(250);
    expect(ticketCommission(50_000, chf.pro)).toBe(100);
    expect(ticketCommission(0, gbp.free)).toBe(0); // RG-FEE-03
  });

  it("le Royaume-Uni et la Suisse sont proposés à l'inscription, avec leur devise", () => {
    expect(findCountry("GB")).toMatchObject({ currency: "GBP", timezone: "Europe/London" });
    expect(findCountry("CH")).toMatchObject({ currency: "CHF", timezone: "Europe/Zurich" });
  });
});
