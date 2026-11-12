#!/usr/bin/env python3
"""Extract the Chinese Mediterranean Dish PDF using its typography, fully offline.

Run with PyMuPDF and Pillow installed. Output is a reviewable, versioned JSON
manifest; this command never writes to the database. See services/api/README.md for the recipe API.
"""
import argparse
import base64
import hashlib
import io
import json
import re
from collections import Counter
from pathlib import Path

import pymupdf
from PIL import Image

CHAPTERS = {
    44: "开胃小菜与沙拉", 106: "鸡蛋、面包与早餐", 141: "无肉主菜、汤与配菜",
    180: "海鲜", 219: "肉类", 260: "甜点与饮品", 289: "酱汁、腌菜与调味品",
}
# Acknowledgements begin below the final recipe on page 310.
END = (310, 470)
# Standalone essays illustrated with full-page photographs are not recipes.
RECIPE_ENDS = {113: (116, 0), 132: (134, 0)}
FRACTIONS = "¼½¾⅓⅔⅛⅜⅝⅞"
QUANTITY = rf"(?:\d+(?:\.\d+)?\s*[{FRACTIONS}]?|[{FRACTIONS}]|半)"
AMOUNT = re.compile(rf"^({QUANTITY}(?:\s*(?:或|至|到|–|—|-)\s*{QUANTITY})?)\s*(茶匙|汤匙|盎司|毫升|公斤|千克|磅|杯|克|升|个|根|瓣|颗|罐|片|块|枝|束|撮|条|只)?\s*(.*)$")


def merge(parts):
    result = ""
    for text in parts:
        text = text.strip()
        if not text:
            continue
        if result and result[-1].isascii() and result[-1].isalnum() and text[0].isascii() and text[0].isalnum():
            result += " "
        result += text
    return result


def page_lines(page, number):
    lines = []
    # dict image payloads are deliberately omitted: get_image_info supplies references.
    for block in page.get_text("dict", flags=pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES)["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            spans = line["spans"]
            text = "".join(s["text"] for s in spans).strip()
            if not text:
                continue
            lines.append({"page": number, "x": line["bbox"][0], "y": line["bbox"][1],
                          "text": text, "size": max(s["size"] for s in spans),
                          "bold": any("Bold" in s["font"] for s in spans)})
    return sorted(lines, key=lambda x: (x["y"], x["x"]))


def image_payload(doc, item):
    raw = doc.extract_image(item["xref"])["image"]
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    img.thumbnail((1400, 1400))
    output = io.BytesIO()
    img.save(output, format="JPEG", quality=85, optimize=True)
    data = output.getvalue()
    return {"data_base64": base64.b64encode(data).decode("ascii"), "mime_type": "image/jpeg",
            "sha256": hashlib.sha256(data).hexdigest(), "width": img.width, "height": img.height,
            "source_page": item["page"]}


def parse_content(lines):
    servings = ""
    lines = [l for l in lines if not re.match(r"--- (?:START|END) OF FILE", l["text"])]
    if lines and lines[0]["bold"] and lines[0]["size"] < 20:
        servings = lines.pop(0)["text"]
        # Long serving descriptions can wrap onto another centered bold line.
        while lines and lines[0]["bold"] and lines[0]["size"] < 20:
            servings += lines.pop(0)["text"]
    intro, ingredients, steps, notes = [], [], [], []
    group = ""
    phase = "intro"
    for i, line in enumerate(lines):
        text, x = line["text"], line["x"]
        step = re.match(r"^(\d+)\.\s*(.*)$", text)
        is_ingredient = (116 <= x <= 120 or (phase == "ingredients" and 97.5 <= x <= 100 and not line["bold"])) and line["size"] > 12
        next_ingredient = i + 1 < len(lines) and 116 <= lines[i + 1]["x"] <= 120
        if phase in ("intro", "ingredients") and is_ingredient:
            phase = "ingredients"
            amount = AMOUNT.match(text)
            quantity, unit, name = (amount.group(1), amount.group(2) or "", amount.group(3)) if amount else ("", "", text)
            ingredients.append({"position": len(ingredients) + 1, "group_name": group, "text": text,
                                "name": name or text, "quantity": quantity.strip(), "unit": unit})
        elif phase in ("intro", "ingredients") and line["bold"] and 96 <= x <= 100 and next_ingredient and not step:
            group = text
        elif phase == "ingredients" and step:
            phase = "steps"
            steps.append(step.group(2))
        elif phase == "steps" and step:
            steps.append(step.group(2))
        elif phase == "steps" and (line["size"] < 12 or (line["bold"] and 96 <= x <= 100)):
            phase = "notes"
            notes.append(text)
        elif phase == "steps":
            steps[-1] = merge([steps[-1], text])
        elif phase == "ingredients":
            # Wrapped ingredient lines start at the paragraph margin in this edition.
            ingredients[-1]["text"] = merge([ingredients[-1]["text"], text])
            ingredients[-1]["name"] = merge([ingredients[-1]["name"], text])
        elif phase == "notes":
            notes.append(text)
        else:
            intro.append(text)
    return servings, merge(intro), ingredients, steps, "\n".join(notes)


def extract(pdf):
    doc = pymupdf.open(pdf)
    source = {"title": "The Mediterranean Dish · 地中海饮食", "author": "Suzy Karadsheh",
              "filename": pdf.name, "sha256": hashlib.file_digest(pdf.open("rb"), "sha256").hexdigest(),
              "page_count": len(doc)}
    all_lines, images = [], []
    for number, page in enumerate(doc, 1):
        if number < 44 or number > END[0]:
            continue
        all_lines.extend(l for l in page_lines(page, number) if (number, l["y"]) < END)
        for img in page.get_image_info(xrefs=True):
            if img["xref"] and img["width"] >= 400 and img["height"] >= 300:
                images.append({"xref": img["xref"], "page": number, "y": img["bbox"][1]})
    headings = []
    for line in all_lines:
        # Recipe and chapter titles are 28.48pt; pull quotes are 26.11pt.
        if line["size"] < 28:
            continue
        if headings and headings[-1]["page"] == line["page"] and line["y"] - headings[-1]["last_y"] < 42:
            headings[-1]["text"] = merge([headings[-1]["text"], line["text"]])
            headings[-1]["last_y"] = line["y"]
        else:
            headings.append({**line, "last_y": line["y"]})
    recipes = []
    for index, heading in enumerate(headings):
        if heading["page"] in CHAPTERS:
            continue
        start = (heading["page"], heading["y"])
        end = (headings[index + 1]["page"], headings[index + 1]["y"]) if index + 1 < len(headings) else END
        end = min(end, RECIPE_ENDS.get(heading["page"], end))
        lines = [l for l in all_lines if start <= (l["page"], l["y"]) < end and l["size"] < 28]
        original = "\n".join(l["text"] for l in lines)
        servings, intro, ingredients, steps, notes = parse_content(lines.copy())
        own_images = [img for img in images if start < (img["page"], img["y"]) < end]
        category = CHAPTERS[max(p for p in CHAPTERS if p <= heading["page"])]
        if not ingredients or not steps:
            raise ValueError(f"Recipe missing ingredients or steps: p{heading['page']} {heading['text']}")
        recipes.append({"title": heading["text"], "category": category, "source_page": heading["page"],
                        "source_page_end": max([l["page"] for l in lines] + [heading["page"]]),
                        "servings": servings, "description": intro, "ingredients": ingredients,
                        "steps": steps, "notes": notes, "original_text": original,
                        "images": [image_payload(doc, img) for img in own_images]})
    return {"format_version": 1, "source": source, "recipes": recipes,
            "summary": {"recipe_count": len(recipes), "ingredient_count": sum(len(r["ingredients"]) for r in recipes),
                        "image_count": sum(len(r["images"]) for r in recipes),
                        "categories": dict(Counter(r["category"] for r in recipes))}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    manifest = extract(args.pdf)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
