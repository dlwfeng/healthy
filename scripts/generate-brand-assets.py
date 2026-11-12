# /// script
# requires-python = ">=3.10"
# dependencies = ["cairosvg==2.9.1", "pillow==13.0.0"]
# ///
"""Export all platform icons from assets/brand/healthy.svg.

macOS with Homebrew Cairo:
  DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run scripts/generate-brand-assets.py
"""

from io import BytesIO
import json
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/brand/healthy.svg"
SVG_NS = {"svg": "http://www.w3.org/2000/svg"}
source = SOURCE.read_bytes()
tree = ET.fromstring(source)
background = tree.find("svg:rect", SVG_NS)
brand_color = background.attrib["fill"]
# Native platforms apply their own mask. Fill the entire square before export.
background.attrib.pop("rx", None)
square = ET.tostring(tree)


def png(svg: bytes, size: int, destination: Path, opaque: bool = False):
    destination.parent.mkdir(parents=True, exist_ok=True)
    data = cairosvg.svg2png(bytestring=svg, output_width=size, output_height=size)
    if opaque:
        with Image.open(BytesIO(data)) as image:
            image.convert("RGB").save(destination)
    else:
        destination.write_bytes(data)


for folder in ("apps/web/assets/brand", "apps/mobile/assets/brand"):
    target = ROOT / folder
    target.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SOURCE, target / "healthy.svg")

web = ROOT / "apps/web"
shutil.copyfile(SOURCE, web / "favicon.svg")
png(square, 180, web / "apple-touch-icon.png", opaque=True)
for size in (192, 512):
    png(source, size, web / f"assets/brand/icon-{size}.png")
with Image.open(BytesIO(cairosvg.svg2png(bytestring=source, output_width=256, output_height=256))) as image:
    image.save(web / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

ios = ROOT / "apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset"
for icon in json.loads((ios / "Contents.json").read_text())["images"]:
    size = round(float(icon["size"].split("x")[0]) * float(icon["scale"].rstrip("x")))
    png(square, size, ios / icon["filename"], opaque=True)

res = ROOT / "apps/mobile/android/app/src/main/res"
for density, size in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    png(source, size, res / f"mipmap-{density}/ic_launcher.png")

# Keep the leaf paths inside Android's adaptive icon safe area. The OS masks
# the background, while the foreground remains vector at every screen density.
paths = "\n".join(
    f'    <path android:fillColor="{path.attrib["fill"]}" android:pathData="{path.attrib["d"]}"/>'
    for path in tree.findall("svg:path", SVG_NS)
)
foreground = res / "drawable/ic_launcher_foreground.xml"
foreground.write_text(
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
    '    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">\n'
    '  <group android:scaleX="0.75" android:scaleY="0.75" android:translateX="18" android:translateY="18">\n'
    + paths + '\n  </group>\n</vector>\n'
)
(res / "values/brand_colors.xml").write_text(
    f'<resources>\n  <color name="healthy_icon_background">{brand_color}</color>\n</resources>\n'
)
adaptive = res / "mipmap-anydpi-v26"
adaptive.mkdir(parents=True, exist_ok=True)
for name in ("ic_launcher", "ic_launcher_round"):
    (adaptive / f"{name}.xml").write_text(
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '  <background android:drawable="@color/healthy_icon_background"/>\n'
        '  <foreground android:drawable="@drawable/ic_launcher_foreground"/>\n'
        '</adaptive-icon>\n'
    )
for density in ("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"):
    shutil.copyfile(res / f"mipmap-{density}/ic_launcher.png", res / f"mipmap-{density}/ic_launcher_round.png")

print("Generated Web, Flutter, iOS and Android brand assets from assets/brand/healthy.svg")
