#!/usr/bin/env python3
"""Regenerate beats/sw.js (offline app cache). Run from the repo root after adding / removing app files or bumping the version:
   python3 beats/tools/gen-sw.py 20261011ab"""
import os, re, sys, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # beats/
ver = sys.argv[1] if len(sys.argv) > 1 else re.search(r'app\.js\?v=([0-9a-z]+)', open(os.path.join(ROOT, 'app.html')).read()).group(1)
core, extra = [], []
for d, _, fs in os.walk(ROOT):
    rel = os.path.relpath(d, ROOT).replace(os.sep, '/')
    if rel.startswith('library') or rel.startswith('tools'): continue
    for f in sorted(fs):
        if re.search(r'\.(md|py|txt)$', f) or f == 'sw.js' or 'LICENSE' in f: continue
        p = (f if rel == '.' else rel + '/' + f)
        (extra if re.match(r'(samples|vendor)/', p) else core).append(p)
core = sorted(core) + ['library/manifest.json', './', 'studio/', 'check/']
shared = ['/shared/share.js', '/shared/ecosystem-nav.js', '/shared/qrcode.js', '/shared/media-store.js']
tpl = open(os.path.join(ROOT, 'tools', 'sw-template.js')).read()
out = tpl.replace('__VERSION__', ver).replace('__CORE__', json.dumps(core)).replace('__EXTRA__', json.dumps(sorted(extra))).replace('__SHARED__', json.dumps(shared))
open(os.path.join(ROOT, 'sw.js'), 'w').write(out)
print('sw.js', ver, len(core), 'core +', len(extra), 'extra +', len(shared), 'shared')
