"""Documents légaux du site vitrine : legal/*.md → dist/<adresse>/index.html (section 9.25).

Convertisseur Markdown volontairement minimal (titres, paragraphes, listes, tableaux, gras, liens) :
aucune dépendance à installer, comme le reste du site.
"""
import html
import pathlib
import re

ROOT = pathlib.Path(__file__).parent
DOCS = [
    ("cgu", "Conditions d'utilisation des organisateurs"),
    ("conditions-de-vente", "Conditions de vente des participants"),
    ("sous-traitance", "Accord de sous-traitance des données"),
    ("privacy", "Politique de confidentialité"),
    ("cookies", "Politique cookies"),
    ("legal", "Mentions légales"),
]


def typo(text: str) -> str:
    """Typographie française : apostrophe courbe, espace insécable avant % et €."""
    return re.sub(r" ([%€])", "\u00a0\\1", text.replace("'", "\u2019"))


def inline(text: str) -> str:
    t = html.escape(typo(text), quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", lambda m: f'<a href="{html.escape(m.group(2))}">{m.group(1)}</a>', t)
    return t


def render(md: str) -> str:
    out, para, items, table = [], [], [], []

    def flush():
        if para:
            out.append(f"<p>{inline(' '.join(para))}</p>")
            para.clear()
        if items:
            out.append("<ul>" + "".join(f"<li>{inline(i)}</li>" for i in items) + "</ul>")
            items.clear()
        if table:
            rows = [[c.strip() for c in r.strip().strip("|").split("|")] for r in table if not re.match(r"^\s*\|?\s*-{3}", r)]
            head, body = rows[0], rows[1:]
            out.append('<div class="table"><table><thead><tr>' + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>" + "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in body) + "</tbody></table></div>")
            table.clear()

    for line in md.splitlines():
        if not line.strip():
            flush()
        elif m := re.match(r"^(#{1,3}) (.+)$", line):
            flush()
            level = max(2, len(m.group(1)))  # le titre de la page est le seul h1
            out.append(f"<h{level}>{inline(m.group(2))}</h{level}>")
        elif line.startswith("- "):
            if para:
                flush()
            items.append(line[2:].strip())
        elif line.lstrip().startswith("|"):
            if para or items:
                flush()
            table.append(line)
        else:
            para.append(line.strip())
    flush()
    return "\n".join(out)


PAGE = """<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} - Evoly</title><meta name="robots" content="index, follow"><link rel="canonical" href="{canonical}"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Poppins:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{{--charbon:#222222;--creme:#FFF6F0;--lilas:#F3D9F0;--rose:#FFB8E8}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--creme);color:var(--charbon);font:16px/1.65 Poppins,system-ui,sans-serif}}
header{{background:var(--charbon);color:var(--creme);padding:18px 24px}}header a{{color:var(--creme);font:26px/1 "Archivo Black",Arial Black,sans-serif;text-decoration:none;letter-spacing:-.04em}}
main{{max-width:760px;margin:0 auto;padding:40px 24px 80px}}h1,h2,h3,h4{{font-family:"Archivo Black",Arial Black,sans-serif;letter-spacing:-.03em;line-height:1.15}}
h1{{font-size:38px;margin:0 0 8px}}h2{{font-size:24px;margin:40px 0 12px}}h3{{font-size:19px;margin:28px 0 8px}}a{{color:inherit}}
.draft{{background:var(--lilas);border-radius:14px;padding:14px 18px;margin:18px 0 28px;font-size:14px}}.version{{color:#555;font-size:14px}}
.table{{overflow-x:auto}}table{{border-collapse:collapse;width:100%;font-size:14px}}th,td{{text-align:left;padding:8px 10px;border-bottom:1px solid #e8dcd5;vertical-align:top}}
footer{{border-top:1px solid #e8dcd5;margin-top:48px;padding-top:18px;font-size:14px;display:flex;flex-wrap:wrap;gap:8px 18px}}
</style></head>
<body><header><a href="/">evoly</a></header>
<main><h1>{title}</h1><p class="version">Version {version}</p>
<p class="draft"><strong>Projet de document.</strong> À faire valider par un avocat avant publication. Les éléments entre crochets sont à compléter.</p>
{body}
<footer>{links}</footer></main></body></html>
"""

VERSION = "2026-09"


def build(out_dir: pathlib.Path | None = None) -> list[pathlib.Path]:
    out = out_dir or ROOT / "dist"
    links = " ".join(f'<a href="/{slug}/">{html.escape(title)}</a>' for slug, title in DOCS)
    written = []
    for slug, title in DOCS:
        src = (ROOT / "legal" / f"{slug}.md").read_text(encoding="utf-8")
        target = out / slug / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        # typographie française : espace insécable avant ; : ! ? (hors adresses web)
        body = re.sub(r" ([;:!?])(?!//)", "\u00a0\\1", render(src))
        target.write_text(PAGE.format(title=html.escape(typo(title)), canonical=f"https://evoly.me/{slug}/", version=VERSION, body=body, links=links.replace("'", "\u2019")), encoding="utf-8")
        written.append(target)
    return written


if __name__ == "__main__":
    for p in build():
        print(p.relative_to(ROOT))
