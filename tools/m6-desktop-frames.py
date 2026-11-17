"""Render reference desktop frames of the demo song for M6 visual comparison (read-only desktop import).

Run with the desktop app's Python interpreter, bytecode disabled:

    <desktop>/.venv/Scripts/python.exe -B tools/m6-desktop-frames.py --desktop <desktop> --out <dir>
"""
import argparse
import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--desktop", default=os.environ.get("MAREA_DESKTOP"), required=False)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if not args.desktop:
        parser.error("pass --desktop or set MAREA_DESKTOP")
    sys.path.insert(0, args.desktop)

    import skia
    from marea.demo_cover import demo_cover
    from marea.demo_song import exact_lyrics
    from marea.render.scene import Scene, Style

    args.out.mkdir(parents=True, exist_ok=True)
    lyrics = exact_lyrics()
    cover = demo_cover()
    timestamps_ms = [1500, 6500, 13800, 17000, 22000]

    for t_ms in timestamps_ms:
        scene = Scene(
            lyrics,
            cover,
            (540, 960),
            style=Style(title="Marea de luz", artist="Demo · letra original"),
        )
        scene.clip_start_ms = 0.0
        img = scene.snapshot(t_ms)
        out_path = args.out / f"desktop-{t_ms}.png"
        img.save(str(out_path), skia.kPNG)
        scene.close()
        print(f"saved {out_path}")


if __name__ == "__main__":
    main()
