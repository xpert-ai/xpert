"""Install a pinned, checksum-verified OFL font for embedded CJK PDF text."""
import argparse
import hashlib
from pathlib import Path
import urllib.request

BASE = 'https://raw.githubusercontent.com/google/fonts/2894aab31764f10f29c421bdfd2340d3b382d384/ofl/notosanssc/'
FILES = [
    ('NotoSansSC.ttf', 'NotoSansSC%5Bwght%5D.ttf', 'a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da'),
    ('OFL.txt', 'OFL.txt', '1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9')]

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--destination', type=Path, required=True)
args = parser.parse_args()
args.destination.mkdir(parents=True, exist_ok=True)
for name, remote, digest in FILES:
    target = args.destination / name
    if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == digest:
        continue
    with urllib.request.urlopen(BASE + remote, timeout=120) as response:
        data = response.read(25 * 1024 * 1024)
    if hashlib.sha256(data).hexdigest() != digest:
        raise RuntimeError('Font download checksum mismatch: ' + name)
    temporary = target.with_suffix(target.suffix + '.download')
    temporary.write_bytes(data)
    temporary.replace(target)
print('Pinned Noto Sans SC font and OFL license ready')
