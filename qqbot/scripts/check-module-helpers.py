"""扫描 lib 下模块引用了 bridge.js 顶层 helper（function/const）却没导入的情况。"""
import io
import re

LIB = r'C:\Users\Eyjafjalla\.dsh\profiles\web\node_modules\@zfqxuz\dsh-qq-onebot-bridge\lib'
bridge = io.open(LIB + r'\bridge.js', encoding='utf-8').read()

# bridge 顶层定义（行首无缩进）
top_funcs = set(re.findall(r'^(?:export )?(?:async )?function ([A-Za-z_]\w*)\(', bridge, re.M))
top_consts = set(re.findall(r'^(?:export )?const ([A-Za-z_]\w*)\s*=', bridge, re.M))
top_helpers = top_funcs | top_consts

modules = [
    'sing-tools.js', 'memory-tools.js', 'media-tools.js', 'analyze-poller.js',
    'query-tools.js', 'owner-tools.js', 'identity-tools.js', 'self-tools.js',
    'ops-commands.js', 'engage-commands.js', 'help-command.js',
    'session-events.js', 'reply-router.js',
]

for mod in modules:
    try:
        text = io.open(LIB + '\\' + mod, encoding='utf-8').read()
    except FileNotFoundError:
        continue
    # 已声明的名字：import / function / const / let / 参数
    declared = set(re.findall(r'import\s*\{([^}]*)\}', text))
    declared = {x.strip().split(' as ')[-1] for group in declared for x in group.split(',') if x.strip()}
    declared |= set(re.findall(r'^(?:export )?(?:async )?function ([A-Za-z_]\w*)', text, re.M))
    declared |= set(re.findall(r'^(?:export )?(?:const|let|var) ([A-Za-z_]\w*)', text, re.M))
    declared |= set(re.findall(r'\{([^{}]*)\}\s*=\s*opts', text))
    declared = {x.strip().split(':')[0].strip() for x in declared if x.strip()}

    missing = []
    for name in sorted(top_helpers):
        if name in declared:
            continue
        # 作为标识符出现（不是属性访问 member）
        if re.search(r'(?<![\w.$])' + re.escape(name) + r'\s*\(', text):
            missing.append(name)
    if missing:
        print(mod, '-> missing helpers:', ', '.join(missing))
