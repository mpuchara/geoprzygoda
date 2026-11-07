"""Build compact PNG flag textures for reliable Android WebView SVG patterns.

The canonical 238 ISO SVG files remain untouched. The PNG previews are an
offline rendering compatibility layer, not replacements for source flags.
"""
from pathlib import Path
import re
import cairosvg

ROOT = Path(__file__).resolve().parents[1]
FLAGS = ROOT / "app/src/main/assets/flags"
OUTPUT = ROOT / "app/src/main/assets/flag-textures"


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    originals = sorted(FLAGS.glob("*.svg"))
    if len(originals) != 238:
        raise RuntimeError(f"Expected 238 ISO SVG flags, got {len(originals)}")
    total_size = 0
    for source in originals:
        if not re.fullmatch(r"[a-z]{2}", source.stem):
            raise RuntimeError(f"Unexpected flag code: {source.stem}")
        target = OUTPUT / (source.stem + ".png")
        # 4:3 size preserves stars, crosses and coats of arms without stretching.
        cairosvg.svg2png(url=str(source), write_to=str(target),
                         output_width=256, output_height=192)
        data = target.read_bytes()
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise RuntimeError(f"Invalid PNG texture: {target.name}")
        total_size += len(data)
    print(f"Generated {len(originals)} offline WebView-compatible flag PNGs; "
          f"{total_size:,} bytes")


if __name__ == "__main__":
    main()
