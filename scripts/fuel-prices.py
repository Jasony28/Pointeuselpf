# Prix moyens du carburant en Belgique (diesel et essence 95), semaine par semaine, pour le coût des trajets.
#
# Source : Bulletin pétrolier hebdomadaire de la Commission européenne (prix à la pompe, taxes comprises).
# Écrit data/carburant.json : { "semaines": { "2026-11-09": { "diesel": 2.357, "essence": 1.844 }, ... } }
# (date = lundi du relevé, prix en € par litre).
#
# Usage : python3 scripts/fuel-prices.py [fichier.xlsx]   (sans fichier : téléchargé sur le site européen)
# Lancé chaque semaine par le workflow « Prix carburant » (.github/workflows/carburant.yml).
import io
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

SOURCE_URL = ("https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en"
              "?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx")
SINCE = "2024-01-01"  # assez pour les rapports de l'appli, sans alourdir le fichier
OUT = Path(__file__).resolve().parent.parent / "data" / "carburant.json"


def load_workbook(path=None):
    if path:
        return openpyxl.load_workbook(path, read_only=True, data_only=True)
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return openpyxl.load_workbook(io.BytesIO(resp.read()), read_only=True, data_only=True)


def belgian_prices(wb):
    ws = wb["Prices with taxes"]
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    col = {str(v): i for i, v in enumerate(header) if v}
    i_essence, i_diesel = col["BE_price_with_tax_euro95"], col["BE_price_with_tax_diesel"]
    weeks = {}
    for row in rows:
        day = row[0]
        if not isinstance(day, datetime):
            continue
        key = day.strftime("%Y-%m-%d")
        if key < SINCE:
            continue
        essence, diesel = row[i_essence], row[i_diesel]
        if not isinstance(essence, (int, float)) or not isinstance(diesel, (int, float)):
            continue
        # €/1000 L -> €/L ; garde-fou contre une colonne qui aurait changé de sens
        essence, diesel = round(essence / 1000, 3), round(diesel / 1000, 3)
        if not (0.5 < essence < 5 and 0.5 < diesel < 5):
            continue
        weeks[key] = {"diesel": diesel, "essence": essence}
    return dict(sorted(weeks.items()))


def main():
    weeks = belgian_prices(load_workbook(sys.argv[1] if len(sys.argv) > 1 else None))
    if len(weeks) < 10:
        sys.exit(f"Trop peu de semaines lues ({len(weeks)}) : le fichier européen a peut-être changé de format.")
    data = {
        "source": "Bulletin pétrolier hebdomadaire (Commission européenne) — Belgique, prix à la pompe TVA comprise",
        "maj": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "semaines": weeks,
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    last = list(weeks)[-1]
    print(f"{len(weeks)} semaines, dernière : {last} {weeks[last]}")


if __name__ == "__main__":
    main()
