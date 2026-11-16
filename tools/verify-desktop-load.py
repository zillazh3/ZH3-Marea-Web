"""Open a .marea.json with the desktop app's own loader, to check that a file made by the web app is accepted.

    <desktop>/.venv/Scripts/python.exe -B tools/verify-desktop-load.py --desktop <desktop> file.marea.json

Exits non-zero with the desktop's message if it refuses the file. Nothing is written in the desktop tree.
"""
import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--desktop", required=True, type=Path)
    parser.add_argument("file", type=Path)
    args = parser.parse_args()
    sys.path.insert(0, str(args.desktop))
    from marea.project import ProjectError, project_from_dict

    try:
        project, editor = project_from_dict(json.loads(args.file.read_text(encoding="utf-8")))
    except ProjectError as e:
        print(f"REFUSED: {e}")
        sys.exit(1)
    print(f"OK: {project.title!r} by {project.artist!r}, {len(project.lyrics.lines)} lines, editor keys {sorted(editor)}")


if __name__ == "__main__":
    main()
