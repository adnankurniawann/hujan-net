"""Unduh berkas mentah dengan pemeriksaan MD5.

Setiap berkas mentah punya checksum yang diumumkan penerbitnya. Kalau checksum
tidak cocok, berkasnya dibuang dan prosesnya gagal keras: angka hasil latih yang
berasal dari berkas rusak lebih berbahaya daripada tidak ada angka sama sekali.
"""

import hashlib
import urllib.request
from pathlib import Path

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"


def md5sum(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def fetch(url: str, dest: Path, md5: str | None) -> Path:
    """Unduh `url` ke `dest` kecuali sudah ada dan checksumnya cocok."""
    if dest.exists() and (md5 is None or md5sum(dest) == md5):
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"mengunduh {url}")
    urllib.request.urlretrieve(url, tmp)
    if md5 is not None and (got := md5sum(tmp)) != md5:
        tmp.unlink()
        raise RuntimeError(f"MD5 {dest.name} {got}, seharusnya {md5}")
    tmp.rename(dest)
    return dest
