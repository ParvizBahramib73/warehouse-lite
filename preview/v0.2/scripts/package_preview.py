from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from hashlib import sha256
root=Path(__file__).resolve().parent.parent
out=Path('/mnt/data')
artifacts={
 'anbar-man-v0.2-preview-deploy.zip': sorted(p for p in (root/'dist').rglob('*') if p.is_file()),
 'anbar-man-v0.2-preview-source.zip': sorted([*(root/'src').rglob('*.js'),*(root/'icons').rglob('*'),*(root/'tests').glob('*.test.mjs'),root/'scripts/build.mjs',root/'scripts/package_preview.py',root/'app.css',root/'index.html',root/'manifest.webmanifest',root/'sw.js',root/'package.json',root/'README_PREVIEW_FA.md',root/'PUBLISH_PREVIEW_FA.md']),
}
for name,files in artifacts.items():
 path=out/name
 with ZipFile(path,'w',compression=ZIP_DEFLATED,compresslevel=9) as z:
  for f in files:
   if f.is_file():
    arc=f.relative_to(root/'dist' if 'deploy' in name else root)
    if 'source' in name and f.name=='README_PREVIEW_FA.md':arc=Path('README.md')
    z.write(f,arc.as_posix())
 with ZipFile(path) as z:
  assert z.testzip() is None
  names=z.namelist(); assert len(names)==len(set(names)); assert 'index.html' in names
  assert (('src/app.js' in names) and ('manifest.webmanifest' in names))
 print(name, 'size=',path.stat().st_size,'files=',len(files),'SHA256=',sha256(path.read_bytes()).hexdigest())
(out/'anbar-man-v0.2-preview-publish-guide.md').write_text((root/'PUBLISH_PREVIEW_FA.md').read_text())
