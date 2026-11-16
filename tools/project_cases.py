"""Desktop-made .marea.json files for the project round-trip tests.

The cover is replaced by a 1x1 PNG so the fixtures stay small; the web side keeps the cover as an opaque base64 string either way.
"""
import json
from pathlib import Path

PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="


def write(out: Path, name: str, payload: dict) -> None:
    payload = {**payload, "cover_png_b64": PIXEL_PNG}
    (out / name).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{name}: {(out / name).stat().st_size} bytes")


def export_projects(out: Path) -> None:
    from marea.model.background import BackgroundConfig
    from marea.model.lyrics import BgVocal, Line, Lyrics, Syllable
    from marea.project import demo_project, project_to_dict
    from marea.providers.spotify import Track

    out.mkdir(parents=True, exist_ok=True)
    write(out, "demo.marea.json", project_to_dict(demo_project()))

    p = demo_project()
    syl = lambda t, b, e: Syllable(t, b, e, True)
    duet = Line(7000, 9500, "v2", [syl("dúo", 7000, 9500)], role="duet", raw_agent="singerB")
    backing = Line(8000, 12000, "v1", [syl("yo", 8000, 9000)], [BgVocal(9000, 12000, [syl("eco", 9000, 12000)], role="echo", agent="v2")])
    p.lyrics = Lyrics(p.lyrics.lines + [duet, backing], "spicy_lyrics", "Spicy Lyrics · made by Ana", ["A. Autora", "B. Autor"])
    p.title, p.artist = "Año nuevo, vida nueva", "Los Ñandúes"
    p.source = Path("C:/letras/año nuevo.ttml")
    p.audio_file = Path("D:/música/canción.mp3")
    p.audio_offset_ms = -120.5
    p.track = Track("7KNmIjcmGJIBrhP2s5Vioe", "Año nuevo", ["Los Ñandúes", "Invitada"], "Álbum", 201234, "https://i.scdn.co/image/x", "spotify:track:7KNmIjcmGJIBrhP2s5Vioe")
    p.background = BackgroundConfig(dim=0.4, blur=2.5, cover_tint=0.1)
    editor = {"first": 2, "last": 6, "style": "bajamar", "audio_source": "file", "preset": "Marea",
              "params": {"align": 0.4, "motion": "rebote", "vib": False}, "fx": {"enabled": True, "overrides": {"3": ["luz"]}}}
    write(out, "rich.marea.json", project_to_dict(p, editor_state=editor))
