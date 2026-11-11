# -*- coding: utf-8 -*-
"""生成《大肥鱼全量工程规范书》Markdown + DOCX。"""
from __future__ import annotations

import json
import re
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(r"D:\DSH\qqbot")
DOCS = ROOT / "docs"
STANDARD = DOCS / "ENGINEERING-STANDARD.md"
STATUS = Path(r"D:\DSH\plugins\features\status.json")
OUT_MD = DOCS / "大肥鱼全量工程规范书-v1.3.md"
OUT_DOCX = DOCS / "大肥鱼全量工程规范书-v1.3.docx"

VERSION = "1.3"
DATE = "2026-11-11"
TITLE = "大肥鱼全量工程规范书"


def read_status() -> list[tuple[str, list[str]]]:
    try:
        data = json.loads(STATUS.read_text(encoding="utf-8"))
        return [(f.get("name", ""), list(f.get("hooks", []))) for f in data.get("features", [])]
    except Exception:
        return []


FEATURES = read_status()
HOOK_TOTAL = sum(len(h) for _, h in FEATURES)

FRONT = f"""# {TITLE}

> **版本** {VERSION}　|　**日期** {DATE}　|　**状态** 生效
>
> **适用范围**：`D:\\DSH\\plugins` 下的桥接内核、全部 feature 插件、测试、脚本、文档，以及它们的部署与回滚。
>
> **效力**：本规范书是工程标准的唯一权威入口。`docs/ENGINEERING.md` 只是快速索引；历史文档（ARCHITECTURE / STATUS / HANDOFF）不代表现状。

## 文档控制

| 项目 | 内容 |
|---|---|
| 文档名称 | 大肥鱼全量工程规范书 |
| 版本 | {VERSION} |
| 生效日期 | {DATE} |
| 适用对象 | 大肥鱼、维护者、新功能作者、代码审查者 |
| 事实源 | 本规范书正文；易变数字以 JSON / CI 输出为准 |
| 解释顺序 | 本规范书 > 快速索引 > 操作细节 > 历史资料 |

## 阅读指南

- **新增 feature**：读第 4、9、13、14 章，照着模板做。
- **修改 bridge**：读第 5、6、9 章，先跑调用图，再动公开 API。
- **部署/回滚**：读第 10 章，使用脚本，不手工猜。
- **代码审查**：直接用第 14 章检查清单。
- **排障**：读第 7、10 章与附录 F 的事故复盘。

## 目录

### 第一部分　规范正文

- 0. 唯一权威与阅读顺序
- 1. 工程范围与事实源
- 2. 分层与依赖规则
- 3. 目录与命名标准
- 4. Feature 插件标准
- 5. Bridge 内核标准
- 6. 双向调用合同
- 7. 数据、安全与观测
- 8. 测试与质量门禁
- 9. 变更流程
- 10. 部署、回滚与健康
- 11. 文档标准
- 12. 现有例外与债务
- 13. 快速模板
- 14. 最终检查清单

### 第二部分　附录

- A. 当前工程基线
- B. Feature 与 Hook 清单
- C. 命令速查
- D. 新 Feature 实操模板
- E. 代码审查清单
- F. 事故复盘与防线
- G. 术语表
- H. 修订记录

## 规范不是建议

本规范里的“必须”是硬约束；“建议”是默认做法，偏离要在变更说明里写原因。

违反硬约束的改动，即使“能跑”，也不合并。

## 角色与职责

| 角色 | 职责 |
|---|---|
| 主人 / 产品负责人 | 决定功能优先级、是否接受例外、是否回滚 |
| 大肥鱼（实现者） | 按本规范实现、自测、记录自检、提交变更说明 |
| 审查者 | 检查分层、接口合同、数据安全、测试与回滚 |
| 运维者 | 部署、健康检查、观察日志、执行回滚 |

同一个人可以兼任多个角色，但**不能省掉对应检查**。

## 开发流程总览

```text
需求 / 问题
  → 判断是否真的需要新能力
  → 设计（数据、接口、权限、失败路径）
  → 实现（feature 优先，bridge 只接线）
  → 单测 / 合同测试 / 手工链路
  → CI + health
  → 快照
  → 重启 / 部署
  → 观察 + 自检记录
  → 必要时回滚
```

### 变更分级

| 级别 | 例子 | 最低要求 |
|---|---|---|
| L1 小修 | 文案、注释、单文件小 bug | 语法检查 + 相关测试 |
| L2 功能 | 新工具、新命令、新 feature | 单测 + audit + test:new + CI + 重启 |
| L3 内核 | bridge 公开 API、启动、权限、部署 | 调用图 + 合同测试 + 全量 CI + 快照 + 回滚演练 |

---

"""

# 去掉标准文件的一级标题和开头说明，保留从“## 0”开始的正文
std_lines = STANDARD.read_text(encoding="utf-8").splitlines()
start = next((i for i, line in enumerate(std_lines) if line.startswith("## 0.")), 0)
BODY = "\n".join(std_lines[start:])

APPENDIX = f"""

---

# 第二部分　附录

## A. 当前工程基线（{DATE}）

| 项目 | 当前值 | 说明 |
|---|---:|---|
| bridge.js | 997 非空行 | 预算 997；49 个薄包装在 bridge-facade |
| feature | {len(FEATURES)} 个 | 全部有 dataPaths |
| hook | {HOOK_TOTAL} 个 | 全局唯一 |
| 工具 | 80 个 | audit 统计 |
| typecheck | 0 / 0 / 0 | core / bridge / features |
| test:new | 175 项 | 快速套件 |
| CI 测试 | 189 项 | 全量套件（含 bridge core 14 项） |
| 覆盖率 | 84.73 / 75.32 / 72.34 | all-lib（排除 bridge） |\n| bridge 覆盖率 | 58.04 / 83.72 / 10.56 | bridge.js 核心基线 |
| 13080 | listen + established | DSH Web |
| 6700 | listen + established | QQ 反向 WS |

> 数字会变化；以 `bridge-size-budget.json`、`typecheck-*.json`、CI 输出为准。

## B. Feature 与 Hook 清单

| Feature | Hooks |
|---|---|
"""

for name, hooks in FEATURES:
    APPENDIX += f"| `{name}` | {', '.join(f'`{h}`' for h in hooks)} |\n"

APPENDIX += """

> 新 hook 必须同时更新 `features/README.md` 与本表；以 `status.json` / `audit-plugins.mjs` 为准。

## C. 命令速查

| 目的 | 命令 |
|---|---|
| 全量 CI | `powershell -NoProfile -ExecutionPolicy Bypass -File D:\\DSH\\qqbot\\scripts\\ci.ps1` |
| 快速单测 | `npm run test:new --prefix D:\\DSH\\plugins\\dsh-qq-onebot-bridge` |
| 全量单测 | `npm run test:all --prefix D:\\DSH\\plugins\\dsh-qq-onebot-bridge` |
| 插件审计 | `node D:\\DSH\\qqbot\\scripts\\audit-plugins.mjs` |
| 类型检查 | `powershell -File D:\\DSH\\qqbot\\scripts\\typecheck.ps1` |
| 健康检查 | `powershell -File D:\\DSH\\qqbot\\scripts\\health.ps1` |
| 部署 | `powershell -File D:\\DSH\\qqbot\\scripts\\deploy.ps1 -Action deploy` |
| 只打包不重启 | `powershell -File D:\\DSH\\qqbot\\scripts\\deploy.ps1 -Action deploy -NoRestart` |
| 回滚 | `powershell -File D:\\DSH\\qqbot\\scripts\\deploy.ps1 -Action rollback` |
| 插件状态 | `powershell -File D:\\DSH\\qqbot\\scripts\\features.ps1 status` |

## D. 新 Feature 实操模板

### D.1 目录

```text
features/example/
  package.json
  index.js
  example-tools.js
  README.md          # 推荐
```

### D.2 package.json

```json
{
  "name": "@fish/feature-example",
  "version": "1.0.0",
  "description": "示例功能",
  "type": "module",
  "main": "index.js",
  "dshFeature": {
    "hooks": ["registerExampleTools"],
    "dataPaths": ["D:\\\\DSH\\\\qqbot\\\\data\\\\example.json"]
  }
}
```

### D.3 index.js

```js
import { registerExampleTools } from './example-tools.js'

export const hooks = {
  registerExampleTools,
}
```

### D.4 工具实现

```js
import { existsSync, readFileSync } from 'node:fs'

export function registerExampleTools({ defineTool, agentCtx, route, key, bridge }) {
  agentCtx.tools.register(defineTool({
    name: 'qq_example',
    description: '示例工具',
    parameters: {},
    async execute() {
      const deny = bridge.writeGate(route, 'qq.write.send')
      if (deny) return { ok: false, detail: deny }
      return { ok: true, detail: 'done' }
    },
  }))
}
```

### D.5 最小测试

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { registerExampleTools } from '../../features/example/example-tools.js'

test('注册示例工具', () => {
  const tools = []
  registerExampleTools({
    defineTool: (def) => def,
    agentCtx: { tools: { register: (t) => tools.push(t) } },
    route: {},
    key: 'u:1',
    bridge: {},
  })
  assert.equal(tools.length, 1)
})
```

### D.6 完成检查

```text
[ ] package/index 一致
[ ] 只 import SDK
[ ] dataPaths 声明
[ ] 工具名唯一
[ ] 写操作过 gate
[ ] 有测试
[ ] audit issues=0
[ ] test:new 通过
[ ] CI OK
[ ] [feature] loaded
[ ] 手测真实链路
```

## E. 代码审查清单

### E.1 分层与接口

- [ ] feature 没有 import 内核内部文件
- [ ] feature 没有 import 另一个 feature
- [ ] 新能力通过 SDK 或注入的 bridge 获得
- [ ] bridge 只增加接线，没有领域分支
- [ ] 公开 API 没有无兼容的删除/改名

### E.2 数据与安全

- [ ] `dataPaths` 覆盖所有持久化路径
- [ ] 写文件是原子的
- [ ] 路径没有 `..` 逃逸
- [ ] 外部输入限长/限类型
- [ ] 日志没有 token / cookie / 密码
- [ ] 删除可恢复

### E.3 错误与文案

- [ ] 用户看到的是可读原因，不是堆栈
- [ ] 关闭分支有真实原因
- [ ] 异常有 `debugLog` / trace
- [ ] 异步有超时
- [ ] 失败不会卡死主流程

### E.4 测试与运维

- [ ] 新增逻辑有单测
- [ ] 契约测试过
- [ ] `test:new` 过
- [ ] `ci.ps1` 过
- [ ] 重启后 13080 / 6700 健康
- [ ] 快照 / 回滚可用
- [ ] 自检记已更新

## F. 事故复盘与防线

### F.1 `rememberText is not a function`

- 现象：每条入站消息都回“处理失败”
- 根因：`createRecentRuntime` 内部定义了 `rememberText`，return 对象漏掉
- 修复：补 return + 回归测试
- 防线：工厂返回对象必须有公开方法测试

### F.2 `bridge.engageOn is not a function`

- 现象：互动命令在 QQ 里失败
- 根因：为了压行删掉了仍被 feature 调用的公开方法
- 修复：恢复方法 + `bridge-api-contract` 测试
- 防线：删除公开 API 前必须跑下游调用图

### F.3 行数口径不一致

- 现象：测试说 1119，CI 说 1480
- 根因：一个统计非空行，一个统计总行
- 修复：统一非空行
- 防线：脚本与测试共用同一口径

### F.4 不可达基线

- 现象：CI 永远红
- 根因：基线写成 0 / 70，但实际是 48 / 67
- 修复：先建真实基线，再只降不升，最后清零
- 防线：基线必须是当前真实值，不能写愿望

## G. 术语表

| 术语 | 含义 |
|---|---|
| feature | `features/<name>/` 下的功能插件 |
| hook | feature 暴露给 bridge 的命名入口 |
| SDK | `lib/sdk/index.js`，feature 唯一允许 import 的内核内容 |
| bridge API | 注入给 feature 的公开能力，`bridge.*` |
| gate | 出站写操作闸门，负责权限/干跑/限流 |
| dry-run | 只记录不真正发 QQ |
| inject / replay | 注入/回放回合，不写 QQ |
| dataPaths | feature 声明使用的持久化路径 |
| trace | 结构化决策记录，排障用 |
| contract test | 检查下游调用是否仍有对应公开成员 |

## H. 修订记录

| 版本 | 日期 | 说明 |
|---|---|---|
| 1.0 | 2026-11-10 | 初版全量工程标准 |
| 1.1 | 2026-11-10 | 14 feature / 27 hooks 全量 typecheck 清零；dataPaths 补齐；ops.js 拆分；覆盖率恢复 70；补充规范书与附录 |
| 1.2 | 2026-11-11 | 公开 API 冻结 + 调用图门禁；botOnline 健康检查与 2 分钟看门狗；提案统一进 docs/proposals；附件 bug 修复 |
| 1.3 | 2026-11-11 | bridge 997 行 + façade 100%；bridge 核心覆盖率基线；外部心跳；真实 agent e2e 入口；CI 175+bridge3 |

---

> **规范的目的不是让流程变慢，而是让“删一行代码”不会变成“线上少一个功能”。**
"""

MD = FRONT + "# 第一部分　规范正文\n\n" + BODY + APPENDIX


def set_cell_shading(cell, color: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), color)
    tc_pr.append(shd)


def set_cell_text(cell, text: str, bold: bool = False, size: float = 9.0) -> None:
    cell.text = ""
    p = cell.paragraphs[0]
    # 表格里的行内代码只保留内容，不显示反引号
    text = text.replace("`", "")
    run = p.add_run(text)
    run.bold = bold
    run.font.size = Pt(size)
    run.font.name = "Microsoft YaHei"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")


def add_page_number(paragraph) -> None:
    run = paragraph.add_run()
    fld_char1 = OxmlElement("w:fldChar")
    fld_char1.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = "PAGE"
    fld_char2 = OxmlElement("w:fldChar")
    fld_char2.set(qn("w:fldCharType"), "end")
    run._r.append(fld_char1)
    run._r.append(instr)
    run._r.append(fld_char2)


def add_inline(paragraph, text: str, size: float = 10.5, color: RGBColor | None = None) -> None:
    parts = re.split(r"(\*\*.*?\*\*|`.*?`)", text)
    for part in parts:
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            run = paragraph.add_run(part[2:-2])
            run.bold = True
        elif part.startswith("`") and part.endswith("`"):
            run = paragraph.add_run(part[1:-1])
            run.font.name = "Consolas"
            run._element.rPr.rFonts.set(qn("w:eastAsia"), "Consolas")
            run.font.size = Pt(size - 0.5)
            run.font.color.rgb = RGBColor(0x1F, 0x4E, 0x79)
        else:
            run = paragraph.add_run(part)
        run.font.size = Pt(size)
        run.font.name = "Microsoft YaHei"
        run._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
        if color is not None and not part.startswith("`"):
            run.font.color.rgb = color


def add_code_block(doc: Document, code: str) -> None:
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    set_cell_shading(cell, "F3F4F6")
    cell.text = ""
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    for i, line in enumerate(code.rstrip("\n").splitlines()):
        if i:
            p.add_run().add_break()
        run = p.add_run(line if line else " ")
        run.font.name = "Consolas"
        run._element.rPr.rFonts.set(qn("w:eastAsia"), "Consolas")
        run.font.size = Pt(8.5)
        run.font.color.rgb = RGBColor(0x11, 0x18, 0x27)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)


def add_table(doc: Document, rows: list[list[str]]) -> None:
    if not rows:
        return
    cols = max(len(row) for row in rows)
    table = doc.add_table(rows=len(rows), cols=cols)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    for i, row in enumerate(rows):
        for j in range(cols):
            value = row[j] if j < len(row) else ""
            cell = table.cell(i, j)
            set_cell_text(cell, value, bold=(i == 0), size=8.5)
            if i == 0:
                set_cell_shading(cell, "1F4E79")
                for run in cell.paragraphs[0].runs:
                    run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)


def build_docx(md: str) -> None:
    doc = Document()
    section = doc.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(1.8)
    section.left_margin = Cm(2.0)
    section.right_margin = Cm(2.0)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Microsoft YaHei"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    normal.font.size = Pt(10.5)
    normal.paragraph_format.line_spacing = 1.5
    normal.paragraph_format.space_after = Pt(4)

    for name, size, color in [("Heading 1", 18, "1F4E79"), ("Heading 2", 14, "2E74B5"), ("Heading 3", 11.5, "404040")]:
        style = styles[name]
        style.font.name = "Microsoft YaHei"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.space_before = Pt(10)
        style.paragraph_format.space_after = Pt(4)
        style.paragraph_format.keep_with_next = True

    # 封面
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(90)
    run = p.add_run("大肥鱼")
    run.bold = True
    run.font.size = Pt(26)
    run.font.name = "Microsoft YaHei"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    run.font.color.rgb = RGBColor(0x1F, 0x4E, 0x79)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("全量工程规范书")
    run.bold = True
    run.font.size = Pt(30)
    run.font.name = "Microsoft YaHei"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    run.font.color.rgb = RGBColor(0x11, 0x18, 0x27)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(f"版本 {VERSION}　|　{DATE}　|　生效")
    run.font.size = Pt(11)
    run.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(24)
    run = p.add_run("唯一权威规范　·　新功能先读这份　·　删除接口先跑调用图")
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor(0x9C, 0xA3, 0xAF)

    doc.add_page_break()

    # 页眉页脚
    header = section.header.paragraphs[0]
    header.text = f"{TITLE} v{VERSION}"
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    for r in header.runs:
        r.font.size = Pt(8)
        r.font.color.rgb = RGBColor(0x9C, 0xA3, 0xAF)

    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = footer.add_run("第 ")
    r.font.size = Pt(8)
    add_page_number(footer)
    r = footer.add_run(" 页")
    r.font.size = Pt(8)

    lines = md.splitlines()
    i = 0
    in_code = False
    code_lines: list[str] = []
    table_rows: list[list[str]] = []
    first_h1 = True

    def flush_table():
        nonlocal table_rows
        if table_rows:
            add_table(doc, table_rows)
            table_rows = []

    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            if in_code:
                add_code_block(doc, "\n".join(code_lines))
                code_lines = []
                in_code = False
            else:
                flush_table()
                in_code = True
            i += 1
            continue
        if in_code:
            code_lines.append(line)
            i += 1
            continue

        if line.strip().startswith("|") and i + 1 < len(lines) and re.match(r"^\s*\|?[\s:|-]+\|", lines[i + 1]):
            flush_table()
            block = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                block.append(lines[i].strip())
                i += 1
            # 去掉分隔行
            block = [b for b in block if not re.match(r"^\|?[\s:|-]+\|?$", b)]
            rows = []
            for raw in block:
                cells = [c.strip() for c in raw.strip("|").split("|")]
                rows.append(cells)
            table_rows = rows
            continue

        if line.startswith("# "):
            if first_h1:
                first_h1 = False
            else:
                doc.add_page_break()
                doc.add_heading(line[2:].strip(), level=1)
            i += 1
            continue
        if line.startswith("## "):
            flush_table()
            doc.add_heading(line[3:].strip(), level=1)
            i += 1
            continue
        if line.startswith("### "):
            flush_table()
            doc.add_heading(line[4:].strip(), level=2)
            i += 1
            continue
        if line.startswith("#### "):
            flush_table()
            doc.add_heading(line[5:].strip(), level=3)
            i += 1
            continue

        if line.strip() in ("---", "***"):
            flush_table()
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            pPr = p._p.get_or_add_pPr()
            pbdr = OxmlElement("w:pBdr")
            bottom = OxmlElement("w:bottom")
            bottom.set(qn("w:val"), "single")
            bottom.set(qn("w:sz"), "6")
            bottom.set(qn("w:space"), "1")
            bottom.set(qn("w:color"), "D1D5DB")
            pbdr.append(bottom)
            pPr.append(pbdr)
            i += 1
            continue

        if line.startswith(">"):
            flush_table()
            text = line[1:].strip()
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.5)
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            add_inline(p, text, size=9.5, color=RGBColor(0x4B, 0x55, 0x63))
            i += 1
            continue

        if re.match(r"^\s*[-*] \[[ xX]\] ", line):
            flush_table()
            text = re.sub(r"^\s*[-*] \[[ xX]\] ", "", line)
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.45)
            p.paragraph_format.space_after = Pt(2)
            add_inline(p, "☐ " + text)
            i += 1
            continue
        if re.match(r"^\s*[-*] ", line):
            flush_table()
            indent = len(line) - len(line.lstrip())
            text = re.sub(r"^\s*[-*] ", "", line)
            style = "List Bullet 2" if indent >= 2 else "List Bullet"
            p = doc.add_paragraph(style=style)
            add_inline(p, text)
            i += 1
            continue
        if re.match(r"^\s*\d+\. ", line):
            flush_table()
            # 保留原文编号，避免 Word 列表跨章节连续编号（45. / 46.）
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.45)
            p.paragraph_format.space_after = Pt(2)
            add_inline(p, line.strip())
            i += 1
            continue

        if line.strip() == "":
            flush_table()
            i += 1
            continue

        flush_table()
        p = doc.add_paragraph()
        add_inline(p, line.strip())
        i += 1

    flush_table()
    doc.save(OUT_DOCX)


OUT_MD.write_text(MD, encoding="utf-8")
build_docx(MD)
print("md", OUT_MD)
print("docx", OUT_DOCX)
print("chars", len(MD))
