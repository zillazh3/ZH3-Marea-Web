"""Dump reference values from the desktop engine into tests/fixtures/engine/*.json.

Run it with the desktop app's own interpreter, bytecode disabled, so nothing is written in that tree:

    <desktop>/.venv/Scripts/python.exe -B tools/export-fixtures.py --desktop <desktop>

The desktop path can also come from the MAREA_DESKTOP environment variable. The generated files are committed, so CI and
contributors never need Python or the desktop repository; regenerate them only after an intentional engine change and review
the diff like code.
"""
import argparse
import json
import math
import os
import shutil
import statistics
import sys
import unicodedata
import zlib
from pathlib import Path

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "tests" / "fixtures" / "engine"

# Golden scenarios stay small on purpose: they are committed. Every frame in a scenario is simulated, only some are recorded.
SAMPLE_EVERY = 40


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--desktop", default=os.environ.get("MAREA_DESKTOP"), help="path to the desktop repository")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    if not args.desktop:
        parser.error("pass --desktop or set MAREA_DESKTOP")
    desktop = Path(args.desktop)
    if not (desktop / "marea" / "engine").is_dir():
        parser.error(f"{desktop} does not look like the desktop repository (marea/engine is missing)")
    return desktop, args.out


def write(out: Path, name: str, data) -> None:
    out.mkdir(parents=True, exist_ok=True)
    path = out / name
    path.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{path.name}: {path.stat().st_size} bytes")


# ---- lyrics, in the camelCase shape the TypeScript engine reads ----

def syllable_json(s):
    return {"text": s.text, "begin": s.begin, "end": s.end, "wordEnd": s.word_end}


def line_json(line):
    return {
        "start": line.start,
        "end": line.end,
        "agent": line.agent,
        "syllables": [syllable_json(s) for s in line.syllables],
        "bg": [{"start": b.start, "end": b.end, "syllables": [syllable_json(s) for s in b.syllables]} for b in line.bg],
        "approx": line.approx,
    }


def lyrics_json(lyrics):
    return {
        "lines": [line_json(l) for l in lyrics.lines],
        "reference": {  # computed by the desktop model, to check the ported helpers
            "texts": [l.text for l in lyrics.lines],
            "interludes": [[i.start, i.end] for i in lyrics.interludes],
        },
    }


# ---- python-compat helpers ----

def ranges(codepoints):
    out, start, prev = [], None, None
    for cp in codepoints:
        if start is None:
            start = prev = cp
        elif cp == prev + 1:
            prev = cp
        else:
            out.append([start, prev])
            start = prev = cp
    if start is not None:
        out.append([start, prev])
    return out


def pycompat_fixture(demo_lines):
    halves = [0.5, 1.5, 2.5, 3.5, -0.5, -1.5, -2.5, 2.675, 0.49999999999999994, 1234567.5, 4.5, 123.456, -0.0, 7.0, 1e15 + 0.5]
    warm = [(t_ms - max(0, t_ms - 3000)) / 1000 / dt for t_ms in (0, 1, 999, 2500, 3000, 21400, 45400, 123456) for dt in (1 / 60, 1 / 64)]
    unicode_max = 0x30000
    assigned = [cp for cp in range(unicode_max) if unicodedata.category(chr(cp)) != "Cn"]
    alnum = [cp for cp in assigned if chr(cp).isalnum()]
    texts = ["", "a", "hello", "ñandú", "你好", "😀 emoji", "Si la marea sube, déjala subir", *demo_lines]
    return {
        "round": [[x, round(x)] for x in halves + warm],
        "mod": [[a, b, a % b] for a, b in [(-1, 1000), (-7, 3), (7.5, -2), (5.5, 2.0), (1e-9, 0.22), (123456789, 1000), (-0.5, 1.0)]],
        "crc32": [[s, zlib.crc32(s.encode())] for s in texts],
        "phase": [[a, b, c, (a * 73856093 ^ b * 19349663 ^ c * 83492791) % 1000 / 1000 * 6.28]
                  for a, b, c in [(0, 0, 0), (13, 97, 5), (10, 100, 40), (250, 300, 200), (1000, 1000, 1000), (3, 4, 5), (999, 98, 12)]],
        "median": [[xs, statistics.median(xs)] for xs in ([0.5], [3.0, 1.0], [1.0, 2.0, 4.0, 10.0], [0.04, 0.01, 0.03], [0.1, 0.1])],
        "codePoints": [[s, len(s)] for s in ("abc", "ñ", "😀", "a😀b", "é", "")],
        "assignedRanges": ranges(assigned),
        "alnumRanges": ranges(alnum),
        "unicodeVersion": unicodedata.unidata_version,
    }


# ---- pure-function fixtures not covered by the frozen refs ----

def curves_fixture(curves, interlude):
    xs = [i / 40 for i in range(-2, 43)]
    glow = curves.glow_curve(0.85, 0.7)
    peak_early = curves.glow_curve(0.3, 1.0)
    return {
        "xs": xs,
        "WIPE": [curves.WIPE(x) for x in xs],
        "WIPE_INV": [curves.WIPE_INV(x) for x in xs],
        "glow": [glow(x) for x in xs],
        "glowEarly": [peak_early(x) for x in xs],
        "smoothstepRange": [[a, b, x, curves.smoothstep_range(a, b, x)] for a, b in ((0.2, 0.8), (0.5, 0.5), (1.0, 0.0)) for x in (-0.1, 0.0, 0.2, 0.5, 0.8, 1.0, 1.4)],
        "clamp": [[v, curves.clamp(v, -1.0, 2.0)] for v in (-3.0, -1.0, 0.5, 2.0, 5.0)],
        "dotOp": [interlude.dot_op(f) for f in (-0.2, 0.0, 0.5, 1.0, 1.5)],
        "dotEnter": [[i, ms, interlude.dot_enter(i, ms)] for i in range(3) for ms in (-10, 0, 80, 400, 900)],
    }


def layout_fixture(layout):
    return {
        "blur": [[i, a, bm, sc, layout.blur_level(i, a, bm, sc)] for a in (0, 3, 6) for i in range(0, 10) for bm, sc in ((1.0, 1.0), (0.5, 2.0), (0.0, 1.0))],
    }


def motion_fixture(motion, lyrics):
    cases = []
    for line in lyrics.lines:
        cases.append({"line": line_json(line), "pick": motion.pick(line)})
    # Hand-made lines for the branches the demo song never reaches.
    from marea.model.lyrics import Line, Syllable
    fast = Line(0, 2000, "v1", [Syllable("ab", 0, 40), Syllable("cd", 40, 80, True), Syllable("ef", 80, 120)])
    approx = Line(0, 2000, "v1", [Syllable("hello", 0, 2000)], approx=True)
    empty = Line(0, 100, "v1", [Syllable(" ", 0, 100)])
    for name, line in (("fast", fast), ("approx", approx), ("blank", empty)):
        cases.append({"line": line_json(line), "pick": motion.pick(line), "name": name})

    us = [i / 50 - 0.5 for i in range(0, 90)]
    bumps = [[d, st, [motion.bump(u, d, st) for u in us]] for d in (0.16, 0.3, 0.6) for st in (0.0, 0.5)]
    limits = [[w, b, cap, motion.limit(w, b, cap)] for w in (-0.2, -0.01, 0.0, 0.05, 0.3) for b in (-0.09, -0.02, 0.0, 0.04) for cap in (0.09, 0.08)]
    syllables = []
    for name, pf in motion.PROFILES.items():
        for b, e, n, sus in ((1.0, 1.4, 4, 0.0), (1.0, 2.6, 3, 0.8), (2.0, 2.1, 6, 0.0), (0.0, 0.0, 2, 0.0), (5.0, 6.5, 1, 1.0)):
            for t in (b - 0.1, b + 0.02, b + (e - b) * 0.4, e, e + 0.3, e + 0.8):
                for dip in (0.0, 0.01):
                    out = motion.syllable(pf, 1.0, t, b, e, n, sus, dip, -0.01, 0.02)
                    syllables.append({"profile": name, "t": t, "b": b, "e": e, "n": n, "sus": sus, "dip": dip, "out": out})
    dips = [[name, t, w, motion.enter_dip(pf, 1.2, t, 1.0, w)] for name, pf in motion.PROFILES.items() for t in (0.9, 1.0, 1.05, 1.15, 1.3, 1.5) for w in (0, 3, 9)]
    resolve = [[mode, reduce, auto, (motion.resolve(mode, reduce, auto) or None) and list(vars(motion.resolve(mode, reduce, auto)).values())]
               for mode in motion.MODES for reduce in (False, True) for auto in ("onda", "suave")]
    return {"pick": cases, "bump": {"us": us, "cases": bumps}, "limit": limits, "syllable": syllables, "enterDip": dips, "resolve": resolve}


# ---- engine goldens ----

def measure(line, active):
    return 60.0 + (30.0 if active and line.bg else 0.0)


def params_json(p):
    return {"align": p.align, "stagger": p.stagger, "blurm": p.blurm, "float": p.float, "emph": p.emph, "scale": p.scale,
            "vib": p.vib, "wob": p.wob, "motion": p.motion, "motionAmt": p.motion_amt, "reduce": p.reduce}


def part_json(u):
    return {"p": u.p, "x": u.x, "y": u.y, "s": u.scale, "glowR": u.glow_r, "glowA": u.glow_a, "wdy": u.wdy, "wds": u.wds}


def near_json(L):
    if L.is_gap:
        return {"gap": True, "op": L.grp_op, "sc": L.grp_sc, "phase": L.phase,
                "dots": [{"op": d.op, "y": d.y, "s": d.scale, "haloR": d.halo_r, "haloA": d.halo_a} for d in L.dots]}
    if L.is_credit:
        return {"credit": True}
    return {"words": [{"p": w.p, "parts": [part_json(u) for u in w.parts]} for w in L.words], "motion": L.motion}


def frame_json(eng):
    items = [{"y": L.y.p, "s": L.s.p, "blurT": L.blur_tw.t, "opT": L.op_tw.t, "blur": L.blur, "opacity": L.opacity,
              "act": L.act, "bgP": L.bg_p, "bgOp": L.bg_op, "on": L.on, "h": L.h} for L in eng.items]
    return {"t": eng.t, "now": eng.now, "active": eng.active, "live": sorted(eng.live), "range": list(eng._active_range),
            "settled": eng.is_settled(), "items": items, "near": {str(i): near_json(eng.items[i]) for i in eng._active_range}}


def run_scenario(Engine, Params, lyrics, spec):
    """spec: name, params (Params), dt, start_ms, warmup (bool), total, events [{frame, type, ...}], paused [[from, to)], credit_h."""
    eng = Engine(lyrics, measure, stage_h=900, font_px=42, params=spec["params"], now=spec.get("now0", 0.0), credit_h=spec.get("credit_h", 0.0))
    dt = spec["dt"]
    recorded_params = params_json(spec["params"])  # the run below may change them (reconfigure events)
    if spec.get("warmup"):
        eng.warmup(spec["start_ms"])
    else:
        eng.start(spec["start_ms"])
    events = {e["frame"]: e for e in spec["events"]}
    keep = {f for f in range(0, spec["total"], SAMPLE_EVERY)} | {f + d for f in events for d in (0, 1, 2)} | {spec["total"] - 1}
    frames = []
    for frame in range(spec["total"]):
        e = events.get(frame)
        if e and e["type"] == "seek":
            eng.seek(e["t"])
        elif e and e["type"] == "reconfigure":
            eng.p.blurm = e["blurm"]
            eng.reconfigure()
        running = not any(a <= frame < b for a, b in spec.get("paused", []))
        eng.advance(dt, running=running)
        if frame in keep:
            frames.append({"frame": frame, **frame_json(eng)})
    return {
        "name": spec["name"], "dt": dt, "now0": spec.get("now0", 0.0), "startMs": spec["start_ms"], "warmup": bool(spec.get("warmup")),
        "total": spec["total"], "params": recorded_params, "approx": bool(spec.get("approx")), "creditH": spec.get("credit_h", 0.0),
        "events": spec["events"], "paused": spec.get("paused", []), "stageH": 900, "fontPx": 42, "frames": frames,
    }


def goldens(Engine, Params, exact_lyrics):
    from marea.model.lyrics import Line, Lyrics

    def approx_copy():
        base = exact_lyrics()
        return Lyrics([Line(l.start, l.end, l.agent, l.syllables, l.bg, approx=True) for l in base.lines])

    cases = [
        ("dt64-seeks", exact_lyrics, dict(
            params=Params(vib=False), dt=1 / 64, start_ms=9000, total=2600, now0=1234.5,
            events=[{"frame": 1600, "type": "seek", "t": 13400}, {"frame": 2100, "type": "seek", "t": 30000}])),
        ("dt60-vibrato-warmup", exact_lyrics, dict(
            params=Params(vib=True), dt=1 / 60, start_ms=21400, warmup=True, total=720,
            events=[{"frame": 300, "type": "seek", "t": 36200}], paused=[[500, 540]])),
        ("approx-lines", approx_copy, dict(
            params=Params(), dt=1 / 60, start_ms=13400, warmup=True, total=600, approx=True, events=[])),
        ("reduced-credit", exact_lyrics, dict(
            params=Params(reduce=True, motion="rebote"), dt=1 / 60, start_ms=45400, warmup=True, total=420, credit_h=30.0, events=[])),
        ("custom-params", exact_lyrics, dict(
            params=Params(align=0.5, stagger=0.0, blurm=0.5, float=True, emph=False, scale=False, vib=True, wob=0.6,
                          motion="respira", motion_amt=1.5), dt=1 / 60, start_ms=0, total=900, events=[{"frame": 450, "type": "seek", "t": 24800}, {"frame": 700, "type": "reconfigure", "blurm": 1.0}])),
    ]
    return [run_scenario(Engine, Params, make(), {**spec, "name": name}) for name, make, spec in cases]


def export_lyrics_fixtures(desktop: Path, out: Path) -> None:
    from marea.model import lyrics as model
    import lyrics_cases

    out.mkdir(parents=True, exist_ok=True)
    demo = desktop / "assets" / "demo" / "marea-de-luz.ttml"
    shutil.copyfile(demo, out / "marea-de-luz.ttml")
    write(out, "parsers.json", lyrics_cases.parsers_fixture(model, demo))
    from marea.providers.lyrics import lrclib, spicy
    import project_cases

    project_cases.export_projects(out.parent / "project")

    write(out, "providers.json", lyrics_cases.providers_fixture(spicy, lrclib))


def main():
    desktop, out = parse_args()
    sys.path.insert(0, str(desktop))
    from marea.demo_song import exact_lyrics
    from marea.engine import curves, interlude, layout, motion
    from marea.engine.engine import Engine, Params

    lyrics = exact_lyrics()
    out.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(desktop / "tests" / "fixtures" / "engine_refs.json", out / "refs.json")
    print("refs.json: copied unchanged")
    write(out, "lyrics-demo.json", lyrics_json(lyrics))
    write(out, "pycompat.json", pycompat_fixture([line.text for line in lyrics.lines]))
    write(out, "curves.json", curves_fixture(curves, interlude))
    write(out, "layout.json", layout_fixture(layout))
    write(out, "motion.json", motion_fixture(motion, lyrics))
    export_lyrics_fixtures(desktop, out.parent / "lyrics")
    from marea.demo_cover import demo_cover
    from marea.render.text import Fonts, ItemLayout, layout_credit
    from marea.wordfx.palette import dominant_colors
    import render_cases

    write(out.parent / "render", "layout.json", render_cases.layout_fixture(lyrics, Fonts, ItemLayout, layout_credit))
    write(out.parent / "render", "palette.json", render_cases.palette_fixture(demo_cover, dominant_colors))
    write(out.parent / "presets", "cases.json", render_cases.presets_fixture(desktop))
    import m8_cases

    write(out.parent / "audio", "analysis.json", m8_cases.audio_analysis_fixture())
    write(out.parent / "wordfx", "matcher.json", m8_cases.matcher_fixture(exact_lyrics))
    write(out.parent / "wordfx", "plan.json", m8_cases.plan_fixture(exact_lyrics, dominant_colors, demo_cover))
    write(out.parent / "wordfx", "anim.json", m8_cases.anim_fixture(exact_lyrics, dominant_colors, demo_cover))
    write(out.parent / "hooks", "suggest.json", m8_cases.hooks_fixture(exact_lyrics))
    for scenario in goldens(Engine, Params, exact_lyrics):
        write(out, f"golden-{scenario['name']}.json", scenario)


if __name__ == "__main__":
    main()
