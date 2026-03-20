"""
Generates PWA icons for What to Watch.
Design: #020202 background → green (#16db65) rounded-square → white "W" lettermark.
"""
from PIL import Image, ImageDraw
import os

GREEN  = (22, 219, 101, 255)   # #16db65
WHITE  = (255, 255, 255, 255)
BG     = (2,   2,   2,   255)  # #020202


def create_icon(size: int) -> Image.Image:
    img  = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)
    p    = lambda x: int(size * x)          # proportional coordinate helper

    # ── Green rounded-rect background ──────────────────────────────────────
    margin = p(0.06)
    radius = p(0.20)
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        fill=GREEN,
    )

    # ── White "W" lettermark ───────────────────────────────────────────────
    # 12-point polygon forming a clean bold W
    pts = [
        (p(0.14), p(0.22)),   # top-left  outer
        (p(0.26), p(0.22)),   # top-left  inner
        (p(0.38), p(0.68)),   # left V    bottom
        (p(0.50), p(0.48)),   # centre    peak
        (p(0.62), p(0.68)),   # right V   bottom
        (p(0.74), p(0.22)),   # top-right inner
        (p(0.86), p(0.22)),   # top-right outer
        (p(0.69), p(0.78)),   # bottom-right outer
        (p(0.57), p(0.78)),   # bottom-right inner
        (p(0.50), p(0.60)),   # centre    trough
        (p(0.43), p(0.78)),   # bottom-left  inner
        (p(0.31), p(0.78)),   # bottom-left  outer
    ]
    draw.polygon(pts, fill=WHITE)

    return img


PWA_SIZES = [72, 96, 128, 144, 152, 192, 384, 512]

os.makedirs("public/icons", exist_ok=True)

for s in PWA_SIZES:
    create_icon(s).save(f"public/icons/icon-{s}x{s}.png")
    print(f"  ✓ icon-{s}x{s}.png")

# Favicon (multi-size ICO: 16 + 32 + 48)
ico_images = [create_icon(s).convert("RGBA") for s in (16, 32, 48)]
ico_images[0].save(
    "public/favicon.ico",
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48)],
    append_images=ico_images[1:],
)
print("  ✓ favicon.ico")
print("\nDone!")
