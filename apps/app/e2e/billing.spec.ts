import { expect, test } from "./fixtures";
import { appUrl, organizer, sql } from "./helpers";

test("abonnement : Free, essai sans carte, abonné par Mollie, impayé (section 9.21, docs/MOLLIE.md lot 6)", async ({
  page,
}) => {
  const { slug } = await organizer(page);
  await page.goto(appUrl(`/o/${slug}/billing`));
  await expect(
    page.getByRole("heading", { name: "Free", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("295,80 €").first()).toBeVisible();
  await expect(page.getByText("−15 %")).toBeVisible();
  // la comparaison des offres est dans une fenêtre
  await page.getByRole("button", { name: "Comparer les offres" }).click();
  const compare = page.getByRole("dialog", { name: "Free et Pro" });
  await expect(
    compare.getByText(/plafonnée à 1(,00)?\u00a0?€/).first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(compare).toHaveCount(0);

  // essai de 14 jours sans carte : rien ne passe par Mollie
  await expect(
    page.getByText(/14 jours gratuits, sans carte bancaire/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Essayer Pro 14 jours" }).click();
  await expect(page.getByText(/Votre essai Pro commence/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pro", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Essai en cours")).toBeVisible();
  await expect(
    page.getByText(/Essai gratuit jusqu’au .*, sans carte bancaire\./),
  ).toBeVisible();
  // s'abonner pendant l'essai : rien à payer avant sa fin, vérification remboursée
  await expect(
    page.getByText(
      /Rien à payer avant le .*, à la fin de votre période en cours/,
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "S’abonner" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Essayer Pro 14 jours" }),
  ).toHaveCount(0);

  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  // abonnement pris pendant l'essai (simulé en base, comme après la vérification remboursée) : premier prélèvement à
  // la fin de l'essai
  sql(
    `update "Subscription" set status = 'ACTIVE', interval = 'MONTH', "billingProvider" = 'MOLLIE', "mollieCustomerId" = 'cst_${orgId}', "mollieMandateId" = 'mdt_${orgId}', "paymentMethodLabel" = 'BE68 •••• 7034', "currentPeriodEnd" = "trialEndsAt" where "organizationId" = '${orgId}'`,
  );
  sql(
    `insert into "SubscriptionPayment" (id, "organizationId", "subscriptionId", "molliePaymentId", kind, status, interval, "amountMinor", currency, "periodStart", "periodEnd", "paidAt", "refundedAt", method, "updatedAt") select 'sv_${orgId}', '${orgId}', s.id, 'tr_v${orgId}', 'SETUP', 'PAID', 'MONTH', 2, 'EUR', s."trialEndsAt", s."trialEndsAt" + interval '1 month', now(), now(), 'bancontact', now() from "Subscription" s where s."organizationId" = '${orgId}'`,
  );
  await page.reload();
  await expect(
    page.getByText(
      /Abonnement enregistré\s:\srien à payer avant le .*\. Ensuite, 29\s€ par mois\./,
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Moyen de paiement : BE68 •••• 7034."),
  ).toBeVisible();

  // abonné par Mollie (simulé en base, comme après le premier paiement), avec sa facture
  sql(
    `update "Subscription" set status = 'ACTIVE', interval = 'MONTH', "billingProvider" = 'MOLLIE', "mollieCustomerId" = 'cst_${orgId}', "mollieMandateId" = 'mdt_${orgId}', "paymentMethodLabel" = 'BE68 •••• 7034', "currentPeriodStart" = now(), "currentPeriodEnd" = now() + interval '20 days' where "organizationId" = '${orgId}'`,
  );
  sql(
    `insert into "SubscriptionPayment" (id, "organizationId", "subscriptionId", "molliePaymentId", kind, status, interval, "amountMinor", currency, "periodStart", "periodEnd", "paidAt", method, "updatedAt") select 'sp_${orgId}', '${orgId}', s.id, 'tr_e2e${orgId}', 'FIRST', 'PAID', 'MONTH', 2900, 'EUR', now(), now() + interval '20 days', now(), 'bancontact', now() from "Subscription" s where s."organizationId" = '${orgId}'`,
  );
  sql(
    `insert into "ProInvoice" (id, "organizationId", "paymentId", number, "issuedAt", interval, "periodStart", "periodEnd", currency, "totalMinor", "vatRateBps", "vatMinor", "vatMention", method, customer) values ('pi_${orgId}', '${orgId}', 'sp_${orgId}', 'E2E-${orgId}', now(), 'MONTH', now(), now() + interval '20 days', 'EUR', 2900, 2100, 503, 'BE_VAT', 'bancontact', '{"name":"Orga","address":null,"country":"BE","vatNumber":null}')`,
  );
  await page.reload();
  await expect(page.getByText("Actif", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Prochain renouvellement le .*\s:\s29\s€ par mois\./),
  ).toBeVisible();
  await expect(
    page.getByText("Moyen de paiement : BE68 •••• 7034."),
  ).toBeVisible();
  await expect(
    page.getByText("Si vous résiliez, à la fin de la période payée :"),
  ).toBeVisible();
  const invoice = page.getByRole("link", {
    name: `Télécharger la facture E2E-${orgId}`,
  });
  await expect(invoice).toBeVisible();
  const pdf = await page.request.get(
    appUrl((await invoice.getAttribute("href"))!),
  );
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  // RG-SUB-05 : l'annuel au prochain renouvellement, sans prorata
  await page.getByRole("button", { name: /Passer à l’annuel/ }).click();
  await expect(
    page.getByText(
      /C’est noté : le changement s’appliquera au prochain renouvellement/,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Passage à l’annuel au prochain renouvellement : 295,80\s€ par an\./,
    ),
  ).toBeVisible();

  // résilier, puis reprendre avant l'échéance
  await page.getByRole("button", { name: "Résilier l’abonnement" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Résilier l’abonnement Pro ?",
  });
  await dialog.getByRole("button", { name: "Résilier", exact: true }).click();
  await expect(page.getByText("Résilié", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reprendre l’abonnement" }).click();
  await expect(
    page.getByRole("button", { name: "Résilier l’abonnement" }),
  ).toBeVisible();

  // RG-SUB-06 : impayé, à régler sur la page de Mollie, et bandeau dans tout le tableau de bord
  sql(
    `update "Subscription" set status = 'PAST_DUE', "pastDueSince" = now() - interval '2 days' where "organizationId" = '${orgId}'`,
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Régler maintenant : 29 €" }),
  ).toBeVisible();
  await page.goto(appUrl(`/o/${slug}`));
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Le paiement de votre abonnement Pro a échoué." }),
  ).toContainText("retour en Free dans 5 jours");
});

test("offre Partenaire : Pro offert, sans commission, sans bouton d'abonnement", async ({
  page,
}) => {
  const { slug } = await organizer(page);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `insert into "Subscription" (id, "organizationId", "planId", status, "updatedAt") values ('s_${orgId}', '${orgId}', 'partner', 'ACTIVE', now()) on conflict ("organizationId") do update set "planId" = 'partner', status = 'ACTIVE', "currentPeriodEnd" = null`,
  );
  await page.goto(appUrl(`/o/${slug}/billing`));
  await expect(
    page.getByRole("heading", { name: "Partenaire", exact: true }),
  ).toBeVisible();
  // carte de l'organisation, en haut de la barre latérale (dans la feuille « Plus » sur téléphone) : son offre
  // (avant le 17 novembre 2026 : « Offre Free », tout ce qui n'était pas Pro)
  await expect(
    page.getByText("Offre Partenaire", { exact: true }).first(),
  ).toBeAttached();
  await expect(page.getByText("Offre Free", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Offerte par Evoly", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/sans commission Evoly sur vos billets/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Essayer Pro/ })).toHaveCount(
    0,
  );
  await page.goto(appUrl(`/o/${slug}/settings/payments`));
  await expect(
    page.getByText(/Evoly ne prélève aucune commission sur vos billets/),
  ).toBeVisible();
});
