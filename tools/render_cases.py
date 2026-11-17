"""Dump desktop renderer layout (and later palette/preset) fixtures, read-only against desktop."""


def layout_fixture(lyrics, Fonts, ItemLayout, layout_credit):
    fonts = Fonts()
    stress_lines = [
        "Bajé a la orilla sin saber nadar",
        "¿Y si el mar nos devuelve? — Fi fl ffi AVATAR Tj año",
        "sin palabras",
    ]
    sizes = [35.64, 71.28]

    glyph_runs = []
    for size in sizes:
        f = fonts.font(size, True)
        ls = -0.012 * size
        for text in stress_lines + [l.text for l in lyrics.lines]:
            glyphs = f.textToGlyphs(text)
            widths = f.getWidths(glyphs)
            xs, x = [], 0.0
            for w in widths:
                xs.append(x)
                x += w + ls
            glyph_runs.append({"text": text, "size": size, "xs": xs, "width": x})

    baselines = [{"size": s, "baseline": fonts.baseline(s)} for s in sizes]

    from marea.engine.engine import Engine
    from marea.render.text import PAD_L, PAD_R

    item_layouts = []
    for w, h in ((540, 960), (1080, 1920)):
        ref = min(w, 0.8 * h)
        size = 0.066 * ref
        stage_w = min(0.94 * w, 1.2 * h)
        eng = Engine(lyrics, lambda _l, _a: 0.0, 0.72 * h, size)
        items = []
        for item in eng.items:
            if item.is_gap or item.is_credit:
                continue
            lay = ItemLayout(item, fonts, size, stage_w)
            items.append({
                "index": item.index,
                "duet": item.duet,
                "hInactive": lay.h_inactive,
                "hActive": lay.h_active,
                "mainW": lay.main_w,
                "bgW": lay.bg_w,
                "mainRows": [[{"text": word.text, "x": wx, "w": ww} for word, wx, ww in row] for row in lay.main],
                "bgRows": [[{"text": word.text, "x": wx, "w": ww} for word, wx, ww in row] for row in lay.bg],
            })
        credit_blocks, csize, credit_h = layout_credit(
            [("Written by", "A. Autora, B. Autor"), ("Provided by", "Apple Music")],
            fonts,
            size,
            stage_w - PAD_L * size - PAD_R * stage_w,
        )
        item_layouts.append({
            "w": w,
            "h": h,
            "size": size,
            "stageW": stage_w,
            "items": items,
            "credit": {
                "csize": csize,
                "height": credit_h,
                "blocks": [[[{"word": wd, "x": wx, "bold": bd} for wd, wx, bd in row] for row in block] for block in credit_blocks],
            },
        })

    return {
        "glyphRuns": glyph_runs,
        "baselines": baselines,
        "itemLayouts": item_layouts,
    }


def palette_fixture(demo_cover, dominant_colors):
    import numpy as np
    import skia

    img = demo_cover()
    dom = dominant_colors(img, 3)

    surf = skia.Surface(32, 32)
    surf.getCanvas().drawImageRect(img, skia.Rect.MakeWH(32, 32), skia.SamplingOptions(skia.FilterMode.kLinear))
    px = surf.makeImageSnapshot().toarray(colorType=skia.kRGBA_8888_ColorType)
    return {
        "demoCoverDominant": [list(c) for c in dom],
        "sample32Rgba": px.reshape(-1).tolist(),
    }


def presets_fixture(desktop):
    from dataclasses import asdict
    from marea.engine.engine import Params
    from marea.model.background import BackgroundConfig
    from marea.presets import schema
    from marea.presets.store import PresetStore
    from marea.render.scene import Style

    store = PresetStore(desktop / "assets" / "presets", desktop / "nonexistent_user_dir")
    builtins = [
        {"name": p.name, "signature": p.signature, "preset": p.preset}
        for p in store.list()
    ]

    dirty = {
        "schema": "marea.preset",
        "version": 1,
        "name": "  Mi Look Muy Largo " + "x" * 80,
        "description": "  desc  ",
        "unknown_top": 42,
        "tipografia": {"font_family": "Comic Sans MS", "font_frac": 0.99, "extra": 1},
        "color": {"text_rgb": "#12ab34", "glow_rgb": "bad", "glow_gain": -5, "bloom": "yes"},
        "fondo": {"bg_blur": 9.0, "bg_veil": -1.0, "source": "invalid"},
        "efectos": {"motion": "invalid_mode", "wob": 0.01, "vib": False},
        "marca_de_agua": {"wm_side": "right", "wm_alpha": 2.5},
    }
    validated = schema.validate(dirty)

    partial = {
        "schema": "marea.preset",
        "version": 1,
        "name": "Solo color",
        "color": {"text_rgb": "#AABBCC", "bloom": False},
        "efectos": {"wob": 0.8},
    }
    st, pa, bg, fx = schema.apply(partial, Style(), Params(), BackgroundConfig(), schema.FxSettings(), sections=("color",))
    diff_after_color = schema.changed_sections(partial, schema.current_values(st, pa, bg, fx))
    st2, pa2, bg2, fx2 = schema.apply(partial, st, pa, bg, fx, sections=schema.SECTIONS)
    diff_after_all = schema.changed_sections(partial, schema.current_values(st2, pa2, bg2, fx2))

    from_state = schema.from_state({
        "style": {"text_rgb": [10, 20, 30], "wm_text": "Web", "bloom": False},
        "params": {"wob": 0.75, "motion": "onda"},
        "fx": {"fx_intensity": 1.2, "adapt_bg": False},
    })

    return {
        "builtins": builtins,
        "validated": {"preset": validated.preset, "flags": validated.flags},
        "partialApply": {
            "partial": partial,
            "colorOnlyStyle": {
                "textRgb": list(st.text_rgb),
                "bloom": st.bloom,
                "wob": pa.wob,
            },
            "diffAfterColor": diff_after_color,
            "diffAfterAll": diff_after_all,
        },
        "fromState": from_state,
    }
