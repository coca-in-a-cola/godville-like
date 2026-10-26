"""Package an already-built clean checkout; output outside the source tree.

Usage: python3 scripts/package-release.py /absolute/output-directory
This is a checksum receipt, not a reproducible-build or signed-attestation claim.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
dist = root / 'apps/web/dist'
out = Path(sys.argv[1]).resolve()
if out == root or root in out.parents:
    raise SystemExit('Release output must be outside the source checkout')
info = json.loads((dist / 'build-info.json').read_text())
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
dirty = subprocess.check_output(['git', 'status', '--porcelain'], cwd=root, text=True).strip()
if dirty or info['dirty'] or info['commit'] != head:
    raise SystemExit('Rebuild a clean checkout at the release commit before packaging')
if not (dist / 'index.html').is_file() or not (dist / '.nojekyll').is_file():
    raise SystemExit('Incomplete build output')
out.mkdir(parents=True, exist_ok=True)
name = f"godville-like-{info['version']}-dist.zip"
archive = out / name
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
    for source in sorted(dist.rglob('*')):
        if source.is_file():
            bundle.write(source, source.relative_to(dist))
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(out / f'{name}.sha256').write_text(f'{digest}  {name}\n')
print(f'{archive}\nSHA256 {digest}\nCommit {head}')
