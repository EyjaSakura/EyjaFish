"""把 bridge.js 里的一个 #method 抽成 lib/<module>.js。

用法：
  python extract-module.py --method '#registerQueryTools' --module query-tools --fn registerQueryTools

规则：
  - this.#foo(  -> bridge.foo(   并在 delegate 里注入 foo: (...a) => self.#foo(...a)
  - this.<public> -> bridge.<public>（config/server/memoryDir 等公共字段）
  - 其余 this.#field（非调用）会报告出来，需人工处理
"""
import argparse
import io
import re

LIB = r'C:\Users\Eyjafjalla\.dsh\profiles\web\node_modules\@zfqxuz\dsh-qq-onebot-bridge\lib'
BRIDGE = LIB + r'\bridge.js'

PRIVATE_CALL = re.compile(r'(?:this|bridge)\.#([A-Za-z_]\w*)\(')
PRIVATE_FIELD = re.compile(r'(?:this|bridge)\.#([A-Za-z_]\w*)(?!\s*\()')
PUBLIC_FIELD = re.compile(r'this\.([A-Za-z_]\w*)')

COMMON_IMPORTS = """import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'
"""


def find_method(text, method):
    pat = re.compile(r'^  (?:async )?' + re.escape(method) + r'\(', re.M)
    m = pat.search(text)
    if not m: raise SystemExit('method not found: ' + method)
    start = m.start()
    tail = text[start + 2:]
    m = re.search(r'\n  (?:async )?#[A-Za-z0-9_]+\(', tail)
    end = start + 2 + m.start() + 1 if m else len(text)
    return start, end


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--method', required=True, help='例如 #registerQueryTools')
    ap.add_argument('--module', required=True, help='模块文件名，不含 .js')
    ap.add_argument('--fn', required=True, help='导出函数名')
    ap.add_argument('--params', default='agentCtx, route, key, role', help='函数参数')
    a = ap.parse_args()

    text = io.open(BRIDGE, encoding='utf-8').read()
    start, end = find_method(text, a.method)
    block = text[start:end]
    body = block.split('\n', 1)[1]
    body = body.rsplit('\n  }', 1)[0]
    body = '\n'.join(line[2:] if line.startswith('  ') else line for line in body.split('\n'))
    body = body.replace('  const bridge = this\n', '')

    methods = sorted(set(PRIVATE_CALL.findall(body)) - {'constructor'})
    fields = sorted(set(PRIVATE_FIELD.findall(body)) - set(methods))
    body = PRIVATE_CALL.sub(lambda m: 'bridge.' + m.group(1) + '(', body)
    body = PUBLIC_FIELD.sub(lambda m: 'bridge.' + m.group(1), body)

    params = [p.strip() for p in a.params.split(',') if p.strip()]
    fn_params = ', '.join(params + ['bridge', 'defineTool', 'debugLog'])

    module = '// 自动抽取自 bridge.js ' + a.method + '\n' + COMMON_IMPORTS + '\n'
    module += 'export function ' + a.fn + '({ ' + fn_params + ' }) {\n' + body + '\n}\n'
    io.open(LIB + '\\' + a.module + '.js', 'w', encoding='utf-8').write(module)

    delegate = '  ' + a.method + '(' + a.params + ') {\n    const self = this\n    ' + a.fn + '({\n      ' + ', '.join(params) + ',\n      defineTool,\n      debugLog,\n      bridge: {\n'
    for m in methods:
        delegate += '        ' + m + ': (...a) => self.#' + m + '(...a),\n'
    delegate += '      },\n    })\n  }\n\n'

    text = text[:start] + delegate + text[end:]
    io.open(BRIDGE, 'w', encoding='utf-8').write(text)

    print('module:', LIB + '\\' + a.module + '.js')
    print('methods injected:', len(methods))
    print('leftover private fields:', fields if fields else 'none')
    print('public fields mapped:', sorted(set(PUBLIC_FIELD.findall(''))))


if __name__ == '__main__':
    main()
