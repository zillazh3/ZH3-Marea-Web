"""Fixture builders for M8: audio analysis, wordfx matcher/composer/anim, and Anzuelo hooks."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np


def make_test_stereo(rate: int = 48000, seconds: float = 4.5) -> np.ndarray:
    """Deterministic stereo clip (melodic + percussive + pause + loud finale) shared with TS parity tests."""
    n = round(rate * seconds)
    out = np.zeros((n, 2), dtype=np.float32)
    for i in range(n):
        t = i / rate
        beat_phase = t % 0.5
        kick = math.exp(-beat_phase * 28.0)
        # Quiet dip around 2.1s..3.0s so _find_pauses triggers, then bright high-harmonic chorus at the end.
        env = 0.04 if 2.1 <= t <= 3.0 else (0.78 if t > 3.1 else 0.42)
        melody = 0.35 * math.sin(2 * math.pi * 440.0 * t) + 0.25 * math.sin(2 * math.pi * 554.37 * t) + 0.2 * math.sin(2 * math.pi * 659.25 * t)
        hf = (0.35 if t > 3.1 else 0.08) * math.sin(2 * math.pi * 3100.0 * t) + (0.2 if t > 3.1 else 0.04) * math.sin(2 * math.pi * 4700.0 * t)
        s = env * (melody + hf + 0.5 * kick * math.sin(2 * math.pi * 1200.0 * beat_phase))
        out[i, 0] = s
        out[i, 1] = s * 0.92
    return out


def audio_analysis_fixture() -> dict:
    from marea.audio.align import onset_envelope
    from marea.audio.analysis import analyze_audio
    from marea.wordfx import audiofeat

    rate = 48000
    stereo = make_test_stereo(rate, 4.5)
    mono = stereo.mean(axis=1).astype(np.float32)
    onset, onset_rate = onset_envelope(mono, rate)
    ana = analyze_audio(stereo, rate)
    stats = audiofeat.analyze(stereo, rate, analysis=ana)

    return {
        "rate": rate,
        "seconds": 4.5,
        "onsetRate": float(onset_rate),
        "onsetLen": int(len(onset)),
        "onsetSamples": [float(onset[i]) for i in range(0, len(onset), 25)],
        "analysis": {
            "rate": float(ana.rate),
            "durationMs": float(ana.duration_ms),
            "tempoBpm": float(ana.tempo_bpm),
            "beatPeriodMs": float(ana.beat_period_ms),
            "beatsMs": [float(b) for b in ana.beats_ms],
            "pausesMs": [[float(a), float(b)] for a, b in ana.pauses_ms],
            "accentsMs": [[float(a), float(b)] for a, b in ana.accents_ms],
            "rmsLen": int(len(ana.rms)),
            "rmsSamples": [float(ana.rms[i]) for i in range(0, len(ana.rms), 25)],
            "contrastSamples": [float(ana.contrast[i]) for i in range(0, len(ana.contrast), 25)],
            "macroContrastSamples": [float(ana.macro_contrast[i]) for i in range(0, len(ana.macro_contrast), 25)],
        },
        "wordfxStats": {
            "durationMs": float(stats.duration_ms),
            "tempoBpm": float(stats.tempo_bpm),
            "energy": float(stats.energy),
            "brightness": float(stats.brightness),
            "mode": float(stats.mode),
            "key": int(stats.key),
            "strain": float(stats.strain),
            "strainRate": float(stats.strain_rate),
            "strainLen": int(len(stats.strain_curve)) if stats.strain_curve is not None else 0,
            "strainSamples": [float(stats.strain_curve[i]) for i in range(0, len(stats.strain_curve), 15)] if stats.strain_curve is not None else [],
        },
    }


def make_wordfx_probe_lyrics(exact_lyrics):
    from marea.model.lyrics import Line, Lyrics, Syllable

    base = exact_lyrics()
    extra_texts = [
        ("No me dejes caer en el silencio", 60000),
        ("Volvi a respirar fuego y hielo", 64000),
        ("In may I remember that burning starlight", 68000),
        ("Para siempre te pierdo entre sombras", 72000),
        ("Never want to fall into winter darkness", 76000),
    ]
    lines = list(base.lines)
    for text, t0 in extra_texts:
        words = text.split()
        syls = [Syllable(w + (" " if idx < len(words) - 1 else ""), t0 + idx * 450, t0 + (idx + 1) * 420, True)
                for idx, w in enumerate(words)]
        lines.append(Line(t0, t0 + len(words) * 450, "v1", syls))
    return Lyrics(lines)


def matcher_fixture(exact_lyrics) -> dict:
    from marea.wordfx import library, rules
    from marea.wordfx.matcher import match_lyrics

    lib = library.load()
    rls = rules.load()
    lyrics = make_wordfx_probe_lyrics(exact_lyrics)
    matches = match_lyrics(lyrics, lib, rules=rls)
    out = []
    for key in sorted(matches):
        m = matches[key]
        out.append({
            "line": m.line,
            "word": m.word,
            "text": m.text,
            "lemma": m.lemma,
            "lang": m.lang,
            "categories": list(m.categories),
            "beginMs": m.begin_ms,
            "endMs": m.end_ms,
            "score": float(m.score),
            "pair": m.pair,
            "note": m.note,
            "ambiguity": float(m.ambiguity),
        })
    return {
        "categoryCount": len(lib.categories),
        "matches": out,
    }


def plan_fixture(exact_lyrics, dominant_colors, demo_cover) -> dict:
    from marea.wordfx import library, rules
    from marea.wordfx.plan import build_plan, track_key
    from marea.wordfx.profile import classify

    lib = library.load()
    rls = rules.load()
    lyrics = exact_lyrics()
    palette = dominant_colors(demo_cover())
    key = track_key(lyrics, "demo-track")
    prof = classify(lyrics, lib, track_id=key, rules=rls)
    plan = build_plan(lyrics, lib, intensity=1.0, track_id="demo-track", palette=palette, profile=prof, rules=rls)

    def dump_params(p):
        return {
            "seed": str(p.seed),
            "vector": [float(x) for x in p.vector],
            "primitives": list(p.primitives),
            "bleed": float(p.bleed),
            "bleedFrom": p.bleed_from,
            "repeatN": p.repeat_n,
            "holdS": float(p.hold_s),
            "colorFrom": list(p.color_from),
            "colorTo": list(p.color_to),
            "oscColor": list(p.osc_color),
            "glow": float(p.glow),
            "streak": float(p.streak),
            "glowGain": float(p.glow_gain),
            "particles": p.particles,
            "particleKind": p.particle_kind,
            "sparkle": p.sparkle,
            "waveform": p.waveform,
            "sigFreqHz": float(p.sig_freq_hz),
            "sigAxis": p.sig_axis,
            "sigAmpEm": float(p.sig_amp_em),
            "variant": p.variant,
            "tier": p.tier,
            "releaseS": float(p.release_s),
            "residueLevel": float(p.residue_level),
            "zeta": float(p.zeta),
            "bleedDonorS": float(p.bleed_donor_s),
            "handoffOverlapS": float(p.handoff_overlap_s),
        }

    words_out = {f"{li}:{wi}": dump_params(fw.params) for (li, wi), fw in sorted(plan.words.items())}
    ambient_keys = sorted(plan.ambient)[:8]
    ambient_out = {f"{li}:{wi}": dump_params(plan.ambient[(li, wi)].params) for li, wi in ambient_keys}
    bg_out = {f"{li}:{wi}": dump_params(fw.params) for (li, wi), fw in sorted(plan.bg_words.items())}
    interlude_cols = {str(t_ms): list(plan.interlude_color(t_ms / 1000.0)) for t_ms in (1000, 12000, 29000, 35000)}

    return {
        "trackKey": key,
        "palette": [list(c) for c in palette],
        "profile": {
            "tags": list(prof.tags),
            "intensity": float(prof.intensity),
            "arc": [{"start": float(s.start), "end": float(s.end), "mood": s.mood} for s in prof.arc],
        },
        "words": words_out,
        "ambientSample": ambient_out,
        "bgWords": bg_out,
        "interludeColors": interlude_cols,
    }


def anim_fixture(exact_lyrics, dominant_colors, demo_cover) -> dict:
    from dataclasses import asdict, replace
    from marea.wordfx import library, rules
    from marea.wordfx.anim import echoes, particles, word_letter_states
    from marea.wordfx.fxtypes import CarrierLetter
    from marea.wordfx.plan import build_plan
    from marea.wordfx.profile import classify

    lib = library.load()
    rls = rules.load()
    lyrics = make_wordfx_probe_lyrics(exact_lyrics)
    palette = dominant_colors(demo_cover())
    prof = classify(lyrics, lib, track_id="anim-track", rules=rls)
    plan = build_plan(lyrics, lib, intensity=1.0, track_id="anim-track", palette=palette, profile=prof, rules=rls)

    sample_words = [fw for _, fw in sorted(plan.words.items())[:4]]
    base_p = sample_words[0].params
    custom_cases = [
        ("dust_erode_trail", replace(
            base_p, seed=0x123456789ABCDEF0, duration_mode="held", is_hero=True, tier="strong",
            erode=0.45, trail=0.8, opacity_min=0.4, blur_em=0.12, glow=0.75, flash=0.5,
            scatter_em=0.06, glitch=0.8, shimmer=0.6, particles=14, particle_kind="dust",
            sparkle=6, sparkle_style="celestial", tint_spread="frost", fill_tint=0.55,
            drift_em=0.04, jitter_em=0.02, jitter_hz=8.0, osc_hz=1.5, osc_color=(120, 210, 255),
            strain_gain=0.8, scale_amp=0.05, scale_period_s=0.4, rotation_deg=3.5,
            bleed_donor_s=9.9, bleed_donor_end_s=10.6,
        )),
        ("ember_streak", replace(
            base_p, seed=0x0FEDCBA987654321, duration_mode="held", is_hero=True, tier="strong",
            waveform="flicker", sig_axis="x", sig_amp_em=0.025, sig_freq_hz=2.5,
            particles=12, particle_kind="ember", sparkle=8, sparkle_style="ember",
            glow=0.85, glow_gain=1.4, streak=0.7, tint_spread="ink", fill_tint=0.52,
        )),
        ("tear_buoyant", replace(
            base_p, seed=0xCAFEBABE12345678, duration_mode="normal", is_hero=True, tier="light",
            waveform="breath", sig_axis="arc", sig_amp_em=0.02, sig_freq_hz=1.2,
            particles=10, particle_kind="tear", sparkle=6, sparkle_style="buoyant",
            drift_em=-0.03,
        )),
        ("prism_bokeh", replace(
            base_p, seed=0x55AA55AA11223344, duration_mode="held", is_hero=True, tier="strong",
            waveform="heartbeat", sig_axis="scale", sig_amp_em=0.04, sig_freq_hz=1.3,
            particles=10, particle_kind="prism", sparkle=6, sparkle_style="bokeh",
        )),
        ("snow_star_flare", replace(
            base_p, seed=0x777788889999AAAA, duration_mode="held", is_hero=False, tier="strong",
            waveform="rot" if False else "pendulum", sig_axis="rot", sig_amp_em=0.02, sig_freq_hz=0.9,
            particles=12, particle_kind="snow_star", sparkle=6, sparkle_style="flare",
        )),
        ("crimson_candle", replace(
            base_p, seed=0x1020304050607080, duration_mode="normal", is_hero=True, tier="strong",
            waveform="tick", sig_axis="y", sig_amp_em=0.018, sig_freq_hz=1.5,
            particles=10, particle_kind="crimson", sparkle=4, sparkle_style="star",
        )),
    ]

    letters_x = [0.0, 0.55, 1.08, 1.62, 2.20]
    letters_w = [0.52, 0.50, 0.51, 0.55, 0.48]
    n = len(letters_x)
    begin_s = 10.0
    end_s = 11.4
    onsets = [begin_s + i * 0.22 for i in range(n)]
    c_letters = [
        CarrierLetter(
            fill_p=min(1.0, max(0.0, 1.0 - 0.18 * i)),
            onset_s=onsets[i],
            y_em=-0.03 * (i % 3),
            scale=1.02 + 0.01 * i,
            glow_a=0.35 + 0.08 * i,
            glow_r=4.0 + i,
            x_em=0.005 * i,
        )
        for i in range(n)
    ]

    def serialize_params(p):
        d = asdict(p)
        d["seed"] = str(p.seed)
        return d

    def serialize_ls(ls):
        return {
            "dx": float(ls.dx),
            "dy": float(ls.dy),
            "scale": float(ls.scale),
            "rotDeg": float(ls.rot_deg),
            "alpha": float(ls.alpha),
            "color": list(ls.color),
            "blurEm": float(ls.blur_em),
            "glow": float(ls.glow),
            "stretch": float(ls.stretch),
        }

    def serialize_pt(pt):
        return {
            "xEm": float(pt.x_em),
            "yEm": float(pt.y_em),
            "rEm": float(pt.r_em),
            "alpha": float(pt.alpha),
            "kind": pt.kind,
            "color": list(pt.color),
            "rotDeg": float(pt.rot_deg),
            "style": pt.style,
            "lifeU": float(pt.life_u),
            "vxEm": float(pt.vx_em),
            "vyEm": float(pt.vy_em),
            "coreColor": list(pt.core_color) if pt.core_color is not None else None,
        }

    cases_out = []
    for name, p in custom_cases:
        samples = []
        for t in (9.97, 10.25, 10.75, 11.35, 11.85):
            states_car = word_letter_states(
                p, n, t, begin_s, end_s, rms=0.72, reduce=False, strain=0.65,
                onsets=onsets, c_letters=c_letters, line_act=0.92, line_end_s=12.4, beat_phase=0.35,
            )
            states_plain = word_letter_states(
                p, n, t, begin_s, end_s, rms=0.72, reduce=False, strain=0.65, onsets=onsets,
            )
            states_red = word_letter_states(
                p, n, t, begin_s, end_s, rms=0.72, reduce=True, strain=0.65,
                onsets=onsets, c_letters=c_letters, line_act=0.92, line_end_s=12.4, beat_phase=0.35,
            )
            pts = particles(p, letters_x, letters_w, t, begin_s, end_s, reduce=False, onsets=onsets, fill_front_u=0.68)
            ech = echoes(p, t, reduce=False)
            samples.append({
                "t": t,
                "carrierStates": [serialize_ls(s) for s in states_car],
                "plainStates": [serialize_ls(s) for s in states_plain],
                "reducedStates": [serialize_ls(s) for s in states_red],
                "particles": [serialize_pt(q) for q in pts],
                "echoes": [[float(dx), float(dy), float(af)] for dx, dy, af in ech],
            })
        cases_out.append({
            "name": name,
            "params": serialize_params(p),
            "samples": samples,
        })

    return {
        "beginS": begin_s,
        "endS": end_s,
        "onsets": onsets,
        "lettersX": letters_x,
        "lettersW": letters_w,
        "carrierLetters": [asdict(cl) for cl in c_letters],
        "cases": cases_out,
    }


def _make_hooks_lyrics():
    from marea.model.lyrics import Line, Lyrics, Syllable

    texts = [
        ("Abrimos la noche sin mirar atras,", 1000, 3200),
        ("Y en el cielo rojo vuelve a brillar.", 3400, 5800),
        ("Marea de luz nos lleva otra vez!", 6200, 9000),
        ("Marea de luz rompiendo la piel,", 9200, 12000),
        ("Subiendo fuerte hasta amanecer", 12200, 15000),
        ("Caminos largos sin poder volver,", 15600, 18400),
        ("Marea de luz nos lleva otra vez!", 18800, 21600),
        ("Marea de luz rompiendo la piel,", 21800, 24600),
        ("Subiendo fuerte hasta amanecer.", 24800, 28000),
        ("Y al final queda solo tu voz.", 28600, 32000),
    ]
    lines = []
    for t, t0, t1 in texts:
        words = t.split()
        step = (t1 - t0) // max(1, len(words))
        syls = [
            Syllable(w + (" " if i < len(words) - 1 else ""), t0 + i * step, t0 + (i + 1) * step - 40, True)
            for i, w in enumerate(words)
        ]
        lines.append(Line(t0, t1, "v1", syls))
    return Lyrics(lines)


def hooks_fixture(exact_lyrics) -> dict:
    from marea.audio.analysis import analyze_audio
    from marea.hooks.analyze import suggest

    demo = exact_lyrics()
    fx_counts_demo = [1 if i % 3 == 0 else 0 for i in range(len(demo.lines))]
    res_demo = suggest(demo, title="Marea de luz", targets_s=(15, 30, 60), fx_counts=fx_counts_demo)

    hook_lyrics = _make_hooks_lyrics()
    stereo = make_test_stereo(48000, 34.0)
    ana = analyze_audio(stereo, 48000)
    fx_counts_hook = [2 if "Marea" in l.text else 0 for l in hook_lyrics.lines]
    res_audio = suggest(
        hook_lyrics,
        title="Marea de luz",
        targets_s=(15, 22),
        analysis=ana,
        audio_offset_ms=250.0,
        fx_counts=fx_counts_hook,
    )

    def dump_map(res):
        return {
            str(k): [
                {
                    "first": s.first,
                    "last": s.last,
                    "startMs": float(s.start_ms),
                    "endMs": float(s.end_ms),
                    "targetS": float(s.target_s),
                    "score": float(s.score),
                    "breakdown": s.breakdown,
                    "explanation": s.explanation,
                    "confidence": s.confidence,
                }
                for s in vals
            ]
            for k, vals in res.items()
        }

    return {
        "demoTitle": "Marea de luz",
        "demoFxCounts": fx_counts_demo,
        "demoSuggestions": dump_map(res_demo),
        "hookLines": [
            {
                "start": l.start,
                "end": l.end,
                "agent": l.agent,
                "text": l.text,
            }
            for l in hook_lyrics.lines
        ],
        "hookFxCounts": fx_counts_hook,
        "hookAudioSeconds": 34.0,
        "hookOffsetMs": 250.0,
        "hookAudioSuggestions": dump_map(res_audio),
    }
