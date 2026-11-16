"""Inputs for the lyrics parser parity fixtures, and the desktop's answer to each.

Used by export-fixtures.py. The cases are plain strings, so the TypeScript tests feed the same text to the web parsers and compare
the structure exactly. Error cases record only that the desktop refused the input: the message is localized on the web side.
"""
from pathlib import Path

TT_OPEN = ('<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" '
           'xmlns:itunes="http://music.apple.com/lyric-ttml-internal" xmlns:marea="https://zh3.marea/ns/ttml"><body><div>')
TT_CLOSE = "</div></body></tt>"


def tt(body: str) -> str:
    return TT_OPEN + body + TT_CLOSE


TIMES = ["00:06.000", "1:02.5", "6.5s", "500ms", "01:00:01.5", "0", "  3s ", "1e2s", "0.0005s", "2.5ms", "1.5ms", "abc", "", "12:", "1:2:3:4"]

TTML = {
    "formats-whitespace": tt('<p begin="1:02.5" end="6.5s" ttm:agent="person2"><span begin="1:02.500" end="1:03.000">Hel</span>'
                             '<span begin="1:03.000" end="1:04">lo </span><span begin="1:04" end="1:05"> you</span></p>'),
    "line-timing-approx": tt('<p begin="00:10.000" end="00:12.000">Un verso corto</p>'),
    "background-parens": tt('<p begin="1.0s" end="5.0s" ttm:agent="v1"><span begin="1.0s" end="2.0s">Hola </span>'
                            '<span begin="2.0s" end="3.0s">mundo</span><span ttm:role="x-bg" begin="3.0s" end="4.0s">'
                            '<span begin="3.0s" end="3.5s">(ooh </span><span begin="3.5s" end="4.0s">yeah)</span></span></p>'),
    "background-line-level": tt('<p begin="1.0s" end="3.0s"><span begin="1.0s" end="2.0s">Hola</span>'
                                '<span ttm:role="x-bg" begin="2s" end="4s">(coro  suave)</span></p>'),
    "background-only": tt('<p ttm:agent="v2"><span ttm:role="x-bg" begin="5s" end="6s"><span begin="5s" end="5.5s">ah</span>'
                          '<span begin="5.5s" end="6s">ah</span></span></p>'),
    "agent-order": tt('<p begin="1s" end="2s" ttm:agent="singerB">uno dos</p><p begin="3s" end="4s" ttm:agent="singerA">tres cuatro</p>'
                      '<p begin="5s" end="6s" ttm:agent="singerB">cinco</p><p begin="7s" end="8s" ttm:agent="v2">seis</p>'
                      '<p begin="9s" end="10s" ttm:agent="v1">siete</p><p begin="11s" end="12s">ocho</p>'),
    "marea-roles": tt('<p begin="1s" end="3s" ttm:agent="v1" marea:role="harmony"><span begin="1s" end="2s">Hi</span>'
                      '<span ttm:role="x-bg" marea:role="echo" ttm:agent="v2" begin="2s" end="3s"><span begin="2s" end="3s">hi</span></span></p>'),
    "skips-empty-and-untimed": tt('<p/><p begin="1s" end="2s"></p><p>sin tiempos</p><p begin="3s" end="4s">con tiempos</p>'),
    "sorts-lines": tt('<p begin="9s" end="10s">tarde</p><p begin="1s" end="2s">temprano</p><p begin="1s" end="3s">empate</p>'),
    "missing-span-end": tt('<p begin="1s" end="4s"><span begin="1s">a</span> <span begin="2s">b</span> <span begin="3s">c</span></p>'),
    "missing-span-end-no-line-end": tt('<p begin="1s"><span begin="1s">a</span><span begin="2s">b</span></p>'),
    "tail-whitespace": tt('<p begin="1s" end="3s"><span begin="1s" end="1.5s">a</span> <span begin="1.5s" end="2s">b</span>'
                          '<span begin="2s" end="3s">c</span></p>'),
    "nested-spans-and-translation": tt('<p begin="1s" end="3s"><span begin="1s" end="2s"><span>Ho</span>la</span> '
                                       '<span begin="2s" end="3s">mundo</span><span ttm:role="x-translation">hello world</span></p>'),
    "plain-text-with-roles": tt('<p begin="1s" end="3s">Hola <span ttm:role="x-translation">hello</span> mundo  <b>feliz</b> día</p>'),
    "unicode": tt('<p begin="1s" end="3s"><span begin="1s" end="2s">ñan</span><span begin="2s" end="3s">dú 你好</span></p>'),
    "overlapping-lines": tt('<p begin="1s" end="6s">uno</p><p begin="2s" end="3s">dos</p><p begin="9s" end="10s">tres</p>'),
    "error-not-tt": "<html/>",
    "error-not-xml": "no es xml",
    "error-bad-time": tt('<p begin="abc" end="2s"><span begin="x" end="y">a</span></p>'),
    "error-entity-bomb": '<!DOCTYPE x [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><tt xmlns="http://www.w3.org/ns/ttml">&b;</tt>',
}

LRC = {
    "spreads-by-letters": "[ar:Alguien]\n[00:10.00]ab cdef\n[00:13.00]\n[00:20.00][00:30.00]hola\n",
    "enhanced": "[00:12.00]<00:12.00>Ho<00:12.30>la <00:12.80>mundo<00:13.40>\n[00:15.00]<00:15.20>solo\n[00:18.00]plana\n",
    "enhanced-only-word-tags": "[00:01.00]<00:01.00>a <00:01.50>b <00:02.00>\n",
    "empty": "",
    "metadata-only": "[ar:x]\n[ti:y]\n",
    "unsorted": "[00:30.00]c\n[00:10.00]a\n[00:20.00]b\n",
    "long-gap": "[00:01.00]uno\n[00:30.00]dos\n",
    "long-line": "[00:01.00]" + "palabra " * 40 + "\n[00:10.00]fin\n",
    "unicode": "[00:01.00]ñandú 你好 ☺\n[00:04.00]fin\n",
    "windows-newlines": "[00:01.00]uno\r\n[00:03.00]dos\r\n[00:05.00]\r\n",
    "tags-with-decimals": "[1:02.5]medio\n[01:03.123]fin\n",
    "empty-end-marker-last": "[00:01.00]solo\n[00:02.50]\n",
}

LYRICSFILE = {
    "words": ("version: '1.0'\nlines:\n  - text: Hola mundo\n    start_ms: 1000\n    end_ms: 3000\n    words:\n"
              "      - {text: 'Hola ', start_ms: 1000, end_ms: 1800}\n      - {text: mundo, start_ms: 1900}\n"),
    "no-words": "version: 1.0\nlines:\n  - text: sin palabras aqui\n    start_ms: 2000\n    end_ms: 5000\n",
    "no-end": "version: '1.0'\nlines:\n  - {text: uno, start_ms: 1000}\n  - {text: dos, start_ms: 4000}\n  - {text: tres, start_ms: 90000}\n",
    "string-numbers": "version: '1.0'\nlines:\n  - {text: 123, start_ms: '1500', end_ms: '2500'}\n",
    "skips-blank-and-untimed": "version: '1.0'\nlines:\n  - {text: '  ', start_ms: 1000}\n  - {text: sin tiempo}\n  - 7\n  - {text: ok, start_ms: 2000, end_ms: 3000}\n",
    "unsorted": "version: '1.0'\nlines:\n  - {text: b, start_ms: 5000, end_ms: 6000}\n  - {text: a, start_ms: 1000, end_ms: 2000}\n",
    "end-before-start": "version: '1.0'\nlines:\n  - {text: a, start_ms: 5000, end_ms: 1000}\n",
    "word-after-blank": "version: '1.0'\nlines:\n  - text: a b\n    start_ms: 0\n    end_ms: 1000\n    words:\n      - {text: ' a', start_ms: 0, end_ms: 400}\n      - {text: 'b ', start_ms: 500, end_ms: 900}\n",
    "empty-lines": "version: '1.0'\nlines: []\n",
    "error-version": "version: '2.0'\nlines: []\n",
    "error-not-mapping": "- a\n- b\n",
    "error-yaml": "version: [unclosed\n",
    "error-bad-int": "version: '1.0'\nlines:\n  - {text: a, start_ms: 'x'}\n",
}


def syllable_json(s):
    return {"text": s.text, "begin": s.begin, "end": s.end, "wordEnd": s.word_end}


def lyrics_json(ly):
    """The full model, camelCase, as the TypeScript parsers return it."""
    return {
        "source": ly.source,
        "credit": ly.credit,
        "writers": list(ly.writers),
        "kind": ly.kind,
        "lines": [{
            "start": l.start, "end": l.end, "agent": l.agent, "approx": l.approx, "role": l.role, "rawAgent": l.raw_agent,
            "syllables": [syllable_json(s) for s in l.syllables],
            "bg": [{"start": b.start, "end": b.end, "role": b.role, "agent": b.agent,
                    "syllables": [syllable_json(s) for s in b.syllables]} for b in l.bg],
        } for l in ly.lines],
        "interludes": [[i.start, i.end] for i in ly.interludes],
    }


def attempt(fn, text):
    try:
        return lyrics_json(fn(text))
    except ValueError:
        return {"error": True}


def parsers_fixture(model, demo_ttml: Path):
    cases = {"demo": demo_ttml.read_text(encoding="utf-8"), **TTML}
    out = {"ttml": [], "lrc": [], "lyricsfile": [], "time": [], "spread": [], "guessEnd": []}
    for name, text in cases.items():
        out["ttml"].append({"name": name, "input": text, "expected": attempt(model.parse_ttml, text)})
    for name, text in LRC.items():
        out["lrc"].append({"name": name, "input": text, "expected": attempt(model.parse_lrc, text)})
    for name, text in LYRICSFILE.items():
        out["lyricsfile"].append({"name": name, "input": text, "expected": attempt(model.parse_lyricsfile, text)})
    for raw in TIMES:
        try:
            out["time"].append({"input": raw, "expected": model.parse_time(raw)})
        except ValueError:
            out["time"].append({"input": raw, "expected": None})
    for text, start, end in (("ab cdef", 10000, 13000), ("uno", 0, 1000), ("a bb ccc dddd", 1, 100), ("", 0, 10),
                             ("¡Hola, mundo! 123", 5, 5001), ("x " * 9, 0, 1000), ("..", 0, 100)):
        out["spread"].append({"text": text, "start": start, "end": end,
                              "expected": [syllable_json(s) for s in model.spread(text, start, end)] if text.split() else []})
    for start, text, nxt in ((0, "x", None), (0, "x" * 100, None), (1000, "hola", 2000), (1000, "hola", 90000), (0, "ñ" * 40, 99999)):
        out["guessEnd"].append({"start": start, "text": text, "next": nxt, "expected": model._guess_end(start, text, nxt)})
    return out


# ---- providers: responses are parsed by static methods, so no network is needed ----

def _syl(text, start, end, part=False):
    return {"Text": text, "StartTime": start, "EndTime": end, "IsPartOfWord": part}


SPICY = {
    "syllable-with-background": {"Body": {"Type": "Syllable", "source": "apple_music", "SongWriters": ["A. Writer", "B. Writer"], "Content": [
        {"Lead": {"StartTime": 1.0, "EndTime": 4.0, "Syllables": [_syl("Hel", 1.0, 1.5, True), _syl("lo", 1.5, 2.0), _syl("world", 2.0, 4.0)]},
         "Background": [{"StartTime": 3.0, "EndTime": 4.5, "Syllables": [_syl("ooh", 3.0, 4.5)]}]},
        {"OppositeAligned": True, "Lead": {"Syllables": [_syl("Second", 5.0, 6.0), _syl(" ", 6.0, 6.0), _syl("line", 6.0, 7.0)]}},
    ]}},
    "community-credit": {"Body": {"Type": "Syllable", "source": "spicy_lyrics",
                                   "UploadAttribution": {"Uploader": {"username": "up​loader"}, "Maker": {"username": "m" * 50}},
                                   "Content": [{"Lead": {"Syllables": [_syl("a", 0, 1)]}}]}},
    "line-type": {"Body": {"Type": "Line", "source": "spotify", "Content": [
        {"Text": "primera  linea", "StartTime": 1.0, "EndTime": 3.0},
        {"Text": "segunda", "StartTime": 3.0, "OppositeAligned": True},
        {"Text": "sin fin", "StartTime": 20.0},
        {"Text": "", "StartTime": 30.0},
        {"Text": "sin inicio"},
    ]}},
    "line-type-with-lead": {"Body": {"Type": "Line", "Content": [{"Lead": {"Syllables": [_syl("x", 2, 3)]}}]}},
    "static": {"Body": {"Type": "Static", "Content": [{"Text": "no timing"}]}},
    "malformed-items-skipped": {"Body": {"Type": "Syllable", "Content": [
        {"Lead": {"Syllables": [{"Text": "bad"}]}}, {"Lead": {"Syllables": [_syl("ok", 1, 2)]}}, "nonsense", {"Lead": None}]}},
    "empty-content": {"Body": {"Type": "Syllable", "Content": []}},
    "unsorted": {"Body": {"Type": "Line", "Content": [{"Text": "b", "StartTime": 5.0, "EndTime": 6.0}, {"Text": "a", "StartTime": 1.0, "EndTime": 2.0}]}},
    "not-a-body": {"Body": "x"},
    "bg-without-times": {"Body": {"Type": "Syllable", "Content": [{"Lead": {"StartTime": 1.0, "Syllables": [_syl("a", 1.2, 2.0)]},
                                                                  "Background": [{"Syllables": [_syl("b", 1.0, 3.0)]}]}]}},
}

LRCLIB_RESULTS = [
    {"id": 1, "duration": 200, "syncedLyrics": "[00:01.00]hola\n", "name": "A"},
    {"id": 2, "duration": 205, "syncedLyrics": "[00:01.00]hola\n"},
    {"id": 3, "duration": 201, "hasWordSync": True},
    {"id": 4, "duration": 200, "syncedLyrics": None, "plainLyrics": "x"},
    {"id": 5, "syncedLyrics": "[00:01.00]sin duracion\n"},
    {"id": 6, "duration": 199.6, "syncedLyrics": "[00:01.00]x\n"},
]

LRCLIB_RAW = {
    "instrumental": {"instrumental": True, "syncedLyrics": "[00:01.00]x\n"},
    "word-sync": {"hasWordSync": True, "lyricsfile": "version: '1.0'\nlines:\n  - {text: hola, start_ms: 1000, end_ms: 2000}\n",
                  "syncedLyrics": "[00:05.00]otro\n"},
    "broken-lyricsfile-falls-back": {"hasWordSync": True, "lyricsfile": "version: '9'\nlines: []\n", "syncedLyrics": "[00:05.00]otro\n"},
    "empty-lyricsfile-falls-back": {"hasWordSync": True, "lyricsfile": "version: '1.0'\nlines: []\n", "syncedLyrics": "[00:05.00]otro\n"},
    "synced-only": {"syncedLyrics": "[00:01.00]uno\n[00:03.00]dos\n"},
    "no-lyrics": {"syncedLyrics": ""},
    "plain-only": {"plainLyrics": "solo texto"},
}


def providers_fixture(spicy, lrclib):
    out = {"spicy": [], "lrclibBest": [], "lrclibToLyrics": []}
    for name, raw in SPICY.items():
        ly = spicy.SpicyLyricsProvider._to_lyrics(raw)
        out["spicy"].append({"name": name, "input": raw, "expected": lyrics_json(ly) if ly else None})
    for duration_ms in (None, 200000, 202000, 150000):
        class Q:  # the desktop passes a TrackQuery; only duration_ms is read by _best
            pass
        q = Q()
        q.duration_ms = duration_ms
        best = lrclib.LrclibProvider._best(LRCLIB_RESULTS, q)
        out["lrclibBest"].append({"durationMs": duration_ms, "expected": best["id"] if best else None})
    for name, raw in LRCLIB_RAW.items():
        ly = lrclib.LrclibProvider._to_lyrics(raw)
        out["lrclibToLyrics"].append({"name": name, "input": raw, "expected": lyrics_json(ly) if ly else None})
    out["lrclibResults"] = LRCLIB_RESULTS
    return out
