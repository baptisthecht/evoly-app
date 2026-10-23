import type { EmailDoc } from "@evoly/core";
import { describe, expect, it } from "vitest";
import type { EmailBrand } from "@/server/email/brand";
import { renderCampaign } from "@/server/email/campaignRender";

const doc: EmailDoc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Bonjour" },
        { type: "text", text: " " },
        { type: "mergeTag", attrs: { name: "prenom" } },
        { type: "text", text: " !" },
      ],
    },
    { type: "eventCard", attrs: { eventId: "e1" } },
    {
      type: "rawHtml",
      attrs: {
        html: '<p>Bloc maison</p><script>alert(1)</script><img src="https://exemple.be/a.png" onerror="alert(2)">',
      },
    },
  ],
};
const brand = {
  fromName: "Club",
  logoUrl: null,
  accent: null,
  accentInk: null,
  primary: null,
} as unknown as EmailBrand;
const render = (over: Partial<Parameters<typeof renderCampaign>[0]> = {}) =>
  renderCampaign({
    subject: "Le gala approche, {{prenom}}",
    previewText: "Places limitées, {{prenom}}",
    doc,
    brand,
    organizationName: "Club <Amis>",
    organizationAddress: "Rue Haute 1, Bruxelles",
    firstName: "Léa",
    locale: "fr",
    unsubscribeUrl: "https://club.evoly.me/desinscription?t=abc&x=1",
    events: new Map([
      [
        "e1",
        {
          title: "Gala de printemps",
          startsAt: new Date("2026-11-20T19:00:00Z"),
          timezone: "Europe/Brussels",
          place: "Salle des fêtes",
          url: "https://club.evoly.me/gala",
          coverImageUrl: null,
        },
      ],
    ]),
    ...over,
  });

describe("rendu d'une campagne (section 9.18, RG-MKT-02)", () => {
  it("personnalisation dans le sujet, l'aperçu et le corps ; sans prénom, la balise disparaît sans espace en trop", () => {
    const r = render();
    expect(r.subject).toBe("Le gala approche, Léa");
    expect(r.html).toContain("Places limitées, Léa");
    expect(r.html).toMatch(/Bonjour\s*Léa\s*!/);
    const anon = render({ firstName: null, subject: "Bonjour {{prenom}} !" });
    expect(anon.subject).toBe("Bonjour !");
    expect(anon.html).not.toContain("{{");
    expect(anon.text).not.toContain("{{");
  });

  it("prénom piégé : jamais interprété comme du HTML, ni dans le corps ni dans l'aperçu", () => {
    const r = render({ firstName: '<img src=x onerror="alert(1)">' });
    expect(r.html).not.toContain("<img src=x");
    expect(r.html).toContain("&lt;img src=x");
  });

  it("pied de page obligatoire, en HTML comme en texte : organisation, adresse, raison et lien de désinscription", () => {
    const r = render();
    expect(r.html).toContain("Club &lt;Amis&gt; · Rue Haute 1, Bruxelles");
    expect(r.html).toContain(
      "vous avez accepté de recevoir les actualités de Club &lt;Amis&gt;",
    );
    expect(r.html).toContain(
      'href="https://club.evoly.me/desinscription?t=abc&amp;x=1"',
    );
    expect(r.html).toContain("Se désinscrire");
    expect(r.text).toContain(
      "Se désinscrire : https://club.evoly.me/desinscription?t=abc&x=1",
    );
    expect(render({ organizationAddress: "" }).html).not.toContain(
      "Club &lt;Amis&gt; · ",
    );
  });

  it("en-tête : logo de la marque, sinon le nom de l'organisation", () => {
    expect(
      render({
        brand: {
          ...brand,
          logoUrl: "https://cdn.evoly.me/logo.png",
        } as EmailBrand,
      }).html,
    ).toContain(
      '<img src="https://cdn.evoly.me/logo.png" alt="Club &lt;Amis&gt;"',
    );
    expect(render().html).not.toContain("cdn.evoly.me/logo.png");
  });

  it("bloc HTML nettoyé au rendu : aucun script, aucun gestionnaire d'événement", () => {
    const r = render();
    expect(r.html).toContain("Bloc maison");
    expect(r.html).not.toMatch(/<script/i);
    expect(r.html).not.toMatch(/onerror/i);
  });

  it("carte d'événement : titre, lien et bouton dans la langue du destinataire", () => {
    const r = render();
    expect(r.html).toContain("Gala de printemps");
    expect(r.html).toContain("https://club.evoly.me/gala");
    expect(r.html).toContain("Voir l’événement");
  });

  it("langue du destinataire pour le pied de page ; sans aperçu, pas de bloc caché", () => {
    expect(render({ locale: "nl" }).html).toContain("Uitschrijven");
    expect(render({ locale: "en" }).text).toContain(
      "Unsubscribe : https://club.evoly.me/desinscription?t=abc&x=1",
    );
    expect(render({ previewText: null }).html).not.toContain("display:none");
  });
});
