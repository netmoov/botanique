#!/usr/bin/env python3
from __future__ import annotations
import argparse, html, json, re, sys, time
from pathlib import Path
from urllib.parse import quote

import requests
from PIL import Image, ImageOps
from io import BytesIO

ROOT = Path(__file__).resolve().parents[1]
DATA_JSON = ROOT / "data" / "plants.json"
DATA_JS = ROOT / "data" / "plants.js"
ASSET_DIR = ROOT / "assets" / "images"
SOURCES_MD = ROOT / "image-sources.md"
COVERAGE_MD = ROOT / "photo-coverage-report.md"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
UA = "BotaniqueBOF/1.0 (educational IFAPME revision app; https://github.com/netmoov/botanique)"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA})


def norm(value: str) -> str:
    value = (value or "").replace("File:", "")
    value = value.encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value or "")
    return html.unescape(re.sub(r"\s+", " ", text)).strip()


def request_json(params: dict) -> dict:
    params = dict(params)
    params.update({"format": "json", "formatversion": "2"})
    r = SESSION.get(COMMONS_API, params=params, timeout=40)
    r.raise_for_status()
    return r.json()


def imageinfo_for_file(filename: str) -> dict | None:
    payload = request_json({
        "action": "query",
        "titles": f"File:{filename}",
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": "1200",
    })
    pages = payload.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing"):
        return None
    return pages[0]


def score_candidate(page: dict, lookup: dict) -> float:
    title = norm(page.get("title", ""))
    score = 0.0
    required = [norm(x) for x in lookup.get("requiredTokens", []) if norm(x)]
    for token in required:
        score += 14 if token in title else -10
    query_tokens = [x for x in norm(lookup.get("query", "")).split() if len(x) > 3]
    for token in query_tokens:
        if token in title:
            score += 2.5
    if re.search(r"flower|fleur|leaf|leaves|foliage|plant|fruit|berries|branch|branches|habit", title):
        score += 2
    if re.search(r"map|range|distribution|logo|herbarium|illustration|drawing|diagram|seed|seeds|stamp|painting|plate", title):
        score -= 8
    if title.endswith(" svg") or title.endswith(" pdf"):
        score -= 50
    level = lookup.get("matchLevel")
    if level in {"exact", "cultivar"} and required and not all(t in title for t in required):
        score -= 30
    return score


def search_image(lookup: dict) -> dict | None:
    query = lookup.get("query", "").strip()
    if not query:
        return None
    attempts = [f"{query} filetype:bitmap", query]
    required = " ".join(lookup.get("requiredTokens", []))
    if required and required.lower() != query.lower():
        attempts.append(f"{required} filetype:bitmap")
    best = None
    best_score = -10_000
    for q in attempts:
        payload = request_json({
            "action": "query",
            "generator": "search",
            "gsrsearch": q,
            "gsrnamespace": "6",
            "gsrlimit": "20",
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "iiurlwidth": "1200",
        })
        for page in payload.get("query", {}).get("pages", []):
            info = (page.get("imageinfo") or [None])[0]
            if not info or not (info.get("thumburl") or info.get("url")):
                continue
            score = score_candidate(page, lookup)
            if score > best_score:
                best, best_score = page, score
        if best is not None and best_score >= 8:
            break
    return best


def match_note(lookup: dict, title: str) -> str:
    level = lookup.get("matchLevel", "")
    required = [norm(x) for x in lookup.get("requiredTokens", []) if norm(x)]
    exact = required and all(x in norm(title) for x in required)
    if level == "exact" and exact:
        return "Correspondance taxonomique contrôlée"
    return {
        "cultivar": "Illustration du taxon/cultivar recherché",
        "genre": "Illustration représentative du genre",
        "hybride": "Illustration représentative de l’hybride/groupe",
        "representatif": "Illustration représentative d’un taxon cité dans le référentiel",
    }.get(level, "Illustration correspondant au terme du référentiel")


def metadata_from_page(page: dict, fallback_alt: str, lookup: dict | None = None) -> dict:
    info = page["imageinfo"][0]
    meta = info.get("extmetadata") or {}
    title = page.get("title", "")
    filename = title.removeprefix("File:")
    return {
        "downloadUrl": info.get("thumburl") or info.get("url"),
        "source": "Wikimedia Commons",
        "sourceUrl": info.get("descriptionurl") or f"https://commons.wikimedia.org/wiki/File:{quote(filename)}",
        "fichierCommons": filename,
        "texteAlternatif": fallback_alt,
        "matchNote": match_note(lookup or {}, title) if lookup else "Photographie Wikimedia Commons",
        "license": strip_html((meta.get("LicenseShortName") or {}).get("value", "")),
        "author": strip_html((meta.get("Artist") or {}).get("value", "")),
    }


def download_webp(url: str, output: Path) -> None:
    r = SESSION.get(url, timeout=60)
    r.raise_for_status()
    image = Image.open(BytesIO(r.content))
    image = ImageOps.exif_transpose(image)
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGB")
    image.thumbnail((1200, 1400), Image.Resampling.LANCZOS)
    if image.mode == "RGBA":
        bg = Image.new("RGB", image.size, "white")
        bg.paste(image, mask=image.getchannel("A"))
        image = bg
    elif image.mode != "RGB":
        image = image.convert("RGB")
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, "WEBP", quality=84, method=6)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    plants = json.loads(DATA_JSON.read_text(encoding="utf-8"))
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    failures = []
    source_rows = []

    for idx, plant in enumerate(plants, 1):
        pid = plant["id"]
        output = ASSET_DIR / f"{pid}.webp"
        current = plant.get("image") or {}
        lookup = plant.get("imageLookup") or {}
        print(f"[{idx:03d}/{len(plants)}] {pid}")

        # Already converted/local: preserve metadata and optionally skip bytes.
        if current.get("url", "").startswith("assets/images/") and output.exists() and not args.force:
            source_rows.append((plant, current))
            continue

        page = None
        filename = current.get("fichierCommons")
        try:
            if filename:
                page = imageinfo_for_file(filename)
            if page is None:
                if not lookup and current.get("sourceUrl"):
                    m = re.search(r"File:([^?#]+)", current["sourceUrl"])
                    if m:
                        page = imageinfo_for_file(m.group(1).replace("%20", " "))
                if page is None and lookup:
                    page = search_image(lookup)
            if page is None:
                failures.append(f"{pid}: aucune image Wikimedia trouvée")
                print("  !! aucune image")
                continue

            meta = metadata_from_page(page, current.get("texteAlternatif") or lookup.get("texteAlternatif") or plant.get("nomCommunPrincipal") or plant.get("nomLatinPrincipal") or pid, lookup if lookup else None)
            if args.force or not output.exists():
                download_webp(meta["downloadUrl"], output)
            plant["image"] = {
                "url": f"assets/images/{pid}.webp",
                "source": meta["source"],
                "sourceUrl": meta["sourceUrl"],
                "fichierCommons": meta["fichierCommons"],
                "texteAlternatif": meta["texteAlternatif"],
                "matchNote": meta["matchNote"],
                "license": meta["license"],
                "author": meta["author"],
            }
            plant.pop("imageLookup", None)
            source_rows.append((plant, plant["image"]))
            time.sleep(0.08)
        except Exception as exc:
            failures.append(f"{pid}: {exc}")
            print(f"  !! {exc}")

    DATA_JSON.write_text(json.dumps(plants, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    DATA_JS.write_text("window.BOTANIC_PLANTS = " + json.dumps(plants, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")

    lines = ["# Sources des photographies", "", "Les photographies sont stockées localement dans `assets/images/`. Les liens ci-dessous conservent la provenance et la licence Wikimedia Commons.", ""]
    for plant, image in source_rows:
        name = plant.get("nomCommunPrincipal") or plant.get("nomLatinPrincipal") or plant["id"]
        details = []
        if image.get("author"): details.append(f"auteur : {image['author']}")
        if image.get("license"): details.append(f"licence : {image['license']}")
        suffix = " — " + "; ".join(details) if details else ""
        lines.append(f"- **{name}** (`{plant['id']}`) — [{image.get('fichierCommons','Wikimedia Commons')}]({image.get('sourceUrl','#')}){suffix}")
    SOURCES_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")

    local_count = sum(1 for p in plants if (p.get("image") or {}).get("url", "").startswith("assets/images/") and (ASSET_DIR / f"{p['id']}.webp").exists())
    report = [
        "# Couverture des photos", "",
        f"- Végétaux dans la base : **{len(plants)}**",
        f"- Photos locales présentes : **{local_count}**",
        f"- Photos manquantes : **{len(plants)-local_count}**",
        "",
    ]
    if failures:
        report += ["## Échecs à contrôler", ""] + [f"- {x}" for x in failures]
    else:
        report += ["Toutes les cartes disposent d’une photographie locale."]
    COVERAGE_MD.write_text("\n".join(report) + "\n", encoding="utf-8")

    if failures:
        print("\nÉCHECS:")
        print("\n".join(failures))
        return 2
    print(f"\nOK: {local_count}/{len(plants)} images locales")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
