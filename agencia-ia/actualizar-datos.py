"""Copia datos/*.json y prompts/*.md dentro de index.html.

La presentación funciona abriendo index.html directo (sin servidor), así que los
datos viajan embebidos. Después de editar un JSON o un prompt, correr:

    python3 actualizar-datos.py
"""
import json
import pathlib
import re

BASE = pathlib.Path(__file__).parent
DATOS = {
    "servicios": "servicios.json",
    "nichos": "nichos.json",
    "precios": "precios.json",
    "finanzas": "finanzas.json",
    "riesgos": "riesgos.json",
    "plan": "plan-90-dias.json",
}

data = {k: json.loads((BASE / "datos" / f).read_text(encoding="utf-8")) for k, f in DATOS.items()}
prompts = {p.name[:2]: p.read_text(encoding="utf-8") for p in sorted((BASE / "prompts").glob("*.md"))}
files = {p.name[:2]: p.stem for p in sorted((BASE / "prompts").glob("*.md"))}


def js(obj):
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


bloque = (
    "/*DATOS*/\nconst DATA = " + js(data) + ";\nconst PROMPTS = " + js(prompts)
    + ";\nconst PFILES = " + js(files) + ";\n/*FIN_DATOS*/"
)
html_path = BASE / "index.html"
html = html_path.read_text(encoding="utf-8")
nuevo, n = re.subn(r"/\*DATOS\*/.*?/\*FIN_DATOS\*/", lambda _: bloque, html, flags=re.S)
if n != 1:
    raise SystemExit("No encontré el bloque /*DATOS*/ ... /*FIN_DATOS*/ en index.html")
html_path.write_text(nuevo, encoding="utf-8")
print("index.html actualizado:", ", ".join(DATOS), "y", len(prompts), "prompts")
