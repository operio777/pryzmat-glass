"""Generate web delivery variants; keep original photographs unchanged.

Run with Python and Pillow installed: python scripts/optimize-images.py
"""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1] / "assets" / "images"
VARIANTS = [
    ("20220507_125303.jpg", "windows-hero-1600.webp", 1600),
    ("20220507_125303.jpg", "windows-hero-960.webp", 960),
    ("IMG20220906151655.jpg", "gallery-high-glazing.webp", 1200),
    ("IMG_0185.jpeg", "gallery-building.webp", 1200),
    ("IMG_20230403_100652334.jpg", "gallery-house.webp", 1600),
    ("311786603_435481512024427_3637700432706579218_n (1).jpg", "gallery-glazing.webp", 1200),
]

if __name__ == "__main__":
    for source, destination, maximum in VARIANTS:
        with Image.open(ROOT / source) as original:
            image = ImageOps.exif_transpose(original).convert("RGB")
            image.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
            image.save(ROOT / destination, "WEBP", quality=84, method=6)
            print(f"{destination}: {image.width}x{image.height}, "
                  f"{(ROOT / source).stat().st_size} -> {(ROOT / destination).stat().st_size} bytes")
