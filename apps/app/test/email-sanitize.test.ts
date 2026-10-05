import { describe, expect, it } from "vitest";
import { inspectEmailHtml, sanitizeEmailHtml } from "@/server/email/sanitize";

// Le HTML nettoyé ne doit jamais rien pouvoir exécuter, ni charger ailleurs que par des images https.
const dangerous = (html: string) =>
  /<\s*(script|iframe|object|embed|form|input|svg|math|style|link|meta|base)\b|\son[a-z]+\s*=|javascript:|vbscript:|data:|expression\(|url\(/i.test(html);

describe("nettoyage du HTML brut des e-mails", () => {
  it.each([
    ["<script>alert(1)</script><p>ok</p>"],
    ["<SCRIPT>alert(1)</SCRIPT><ScRiPt>alert(2)</ScRiPt><p>ok</p>"],
    ["<scr<script>ipt>alert(1)</script><p>ok</p>"],
    ['<img src="x" onerror="alert(1)">'],
    ['<img src="https://cdn.test/a.png" onerror="alert(1)" onload=alert(2)>'],
    ['<a href="javascript:alert(1)">x</a>'],
    ['<a href="&#106;avascript:alert(1)">x</a>'],
    ['<a href="  JAVASCRIPT:alert(1)">x</a>'],
    ['<a href="vbscript:msgbox(1)">x</a>'],
    ['<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>'],
    ['<iframe src="https://evil.test"></iframe><object data="x"></object><embed src="x">'],
    ['<form action="https://evil.test"><input name="carte"><button>Envoyer</button></form>'],
    ["<svg onload=alert(1)><circle r=1></circle></svg>"],
    ["<math><mtext><script>alert(1)</script></mtext></math>"],
    ["<style>body{background:url(javascript:alert(1))}</style><p>x</p>"],
    ['<link rel="stylesheet" href="https://evil.test/a.css"><p>x</p>'],
    ['<meta http-equiv="refresh" content="0;url=https://evil.test"><base href="https://evil.test/">'],
    ['<div style="background:url(javascript:alert(1));color:red">t</div>'],
    ['<div style="width:expression(alert(1))">t</div>'],
    ['<img src="data:image/png;base64,AAAA">'],
    ['<a href="//evil.test">x</a>'],
    ['<p style="color:red;position:fixed;top:0;behavior:url(x.htc)">t</p>'],
  ])("neutralise %s", (raw) => {
    const html = sanitizeEmailHtml(raw);
    expect(dangerous(html), html).toBe(false);
  });

  it("garde la mise en page d'un e-mail (tableaux, styles sûrs, liens, images https, balises)", () => {
    const raw =
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px;background-color:#ffb8e8;font-size:15px">Bonjour {{prenom}}, <a href="https://evoly.me/gala">réservez</a><img src="https://cdn.evoly.me/a.png" alt="Affiche" width="200"></td></tr></table>';
    const html = sanitizeEmailHtml(raw);
    expect(html).toContain('<table role="presentation" width="100%" cellpadding="0" cellspacing="0">');
    expect(html).toContain('style="padding:16px;background-color:#ffb8e8;font-size:15px"');
    expect(html).toContain("Bonjour {{prenom}}");
    expect(html).toContain('<a href="https://evoly.me/gala" rel="noopener noreferrer">réservez</a>');
    expect(html).toContain('<img src="https://cdn.evoly.me/a.png" alt="Affiche" width="200" />');
  });

  it("ne garde que les propriétés de style sûres", () => {
    expect(sanitizeEmailHtml('<p style="color:red;position:fixed">t</p>')).toBe('<p style="color:red">t</p>');
    expect(sanitizeEmailHtml('<div style="width:expression(alert(1))">t</div>')).toBe("<div>t</div>");
  });

  it("retire les commentaires et prévient de ce qui a été retiré", () => {
    expect(sanitizeEmailHtml("<!-- note --><p>a</p>")).toBe("<p>a</p>");
    const { warnings } = inspectEmailHtml('<script>x</script><img src="https://a.test/a.png" onerror="x"><iframe></iframe><a href="javascript:x">y</a>');
    expect(warnings).toEqual(expect.arrayContaining(["SCRIPT", "EVENT_HANDLER", "EMBED", "DANGEROUS_URL"]));
    expect(inspectEmailHtml("<p>propre</p>").warnings).toEqual([]);
  });
});
