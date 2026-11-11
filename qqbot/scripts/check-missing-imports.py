"""扫描模块里使用了 Node 内置函数但没 import 的情况（防止 appendFileSync 这类再犯）。"""
import io
import os
import re

ROOTS = [
    r'D:\DSH\plugins\dsh-qq-onebot-bridge\lib',
    r'D:\DSH\plugins\features',
]

BUILTINS = [
    'appendFileSync', 'readFileSync', 'writeFileSync', 'existsSync', 'mkdirSync',
    'readdirSync', 'copyFileSync', 'unlinkSync', 'statSync', 'rmSync', 'renameSync',
    'join', 'basename', 'dirname', 'extname', 'resolve', 'sep',
    'execFileSync', 'spawn', 'execFile', 'createHash', 'pathToFileURL',
]

for root in ROOTS:
    for dirpath, _dirs, files in os.walk(root):
        if 'node_modules' in dirpath:
            continue
        for fn in files:
            if not fn.endswith('.js'):
                continue
            p = os.path.join(dirpath, fn)
            text = io.open(p, encoding='utf-8', errors='replace').read()
            imports = '\n'.join(re.findall(r'^import .*$', text, re.M))
            missing = []
            for name in BUILTINS:
                if re.search(r'(?<![\w.#])' + re.escape(name) + r'\s*\(', text):
                    if not re.search(r'\b' + re.escape(name) + r'\b', imports):
                        missing.append(name)
            if missing:
                print(os.path.relpath(p, r'D:\DSH\plugins'), '->', ', '.join(missing))
