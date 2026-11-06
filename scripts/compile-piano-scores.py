"""Recompile local source editions with LilyPond 2.24.4 before importing them.

Usage: python scripts/compile-piano-scores.py /path/to/lilypond-2.24.4/bin
The originals stay untouched. Only temporary copies are converted.
"""
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1] / 'piano' / 'scores'
TOOLS = Path(sys.argv[1]) if len(sys.argv) > 1 else None

def tool(name):
    return str(TOOLS / name) if TOOLS else name

for item in json.loads((ROOT / 'manifest.json').read_text()):
    original = ROOT / item['sourceFile']
    with tempfile.TemporaryDirectory(prefix='piano-score-') as directory:
        work = Path(directory)
        shutil.copytree(original.parent, work, dirs_exist_ok=True)
        for source in [*work.glob('*.ly'), *work.glob('*.ily')]:
            if '\\version' in source.read_text():
                subprocess.run([tool('convert-ly'), '-e', str(source)], check=True, capture_output=True)
            text = source.read_text()
            text = text.replace('\\score {', '\\score {\n\\unfoldRepeats ')
            # Articulate deliberately shortens sounding MIDI gates. The piano
            # needs written note lengths to teach the notation accurately.
            text = text.replace('\\articulate', '')
            # Compatibility fixes for old engraving settings and a source typo.
            text = re.sub(r'^.*obsolete-between-system-space.*\n', '', text, flags=re.M)
            text = re.sub(r'^.*override-auto-beam-setting.*\n', '', text, flags=re.M)
            text = re.sub(r"(\w+-\w+-spacing)\s+#'(\w+)\s*=", r'\1.\2 =', text)
            text = text.replace('tempWholesPerMinute', 'tempoWholesPerMinute')
            source.write_text(text)
        stem = original.stem if item.get('useOriginalOutputName') else item['id']
        result = subprocess.run([tool('lilypond'), '-dno-print-pages', '-o', str(work / stem), str(work / original.name)], cwd=work, capture_output=True)
        if result.returncode:
            sys.stderr.write(result.stderr.decode())
            raise SystemExit('Could not compile ' + item['id'])
        files = list(work.glob(stem + '*.midi'))
        assert len(files) == 1, (item['id'], 'ambiguous MIDI output', files)
        shutil.copyfile(files[0], ROOT / item['midiFile'])
    print('Compiled', item['id'])
