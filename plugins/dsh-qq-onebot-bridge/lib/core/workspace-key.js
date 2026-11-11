// 工作区路径 -> DSH 会话目录名（与宿主 projectKey 保持一致）。
export function workspaceProjectKey(cwd) {
  let readable = ''
  let separatorRun = false
  for (let i = 0; i < cwd.length; i++) {
    const code = cwd.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += `~${code.toString(16).toUpperCase().padStart(4, '0')}`
      separatorRun = false
    }
  }
  return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`
}

/**
 * 「需要带参数」的命令词（v0.5.9 真机抓到）。
 *
 * 用途只有一个：识别"命令和参数粘在一起"的写法（`/设管理123456`、`/加群方式3`）——
 * 这类文本匹配不上命令（红线是**空白分隔**），会一路走到模型。模型可能真去调工具，
 * 用户则以为"命令失败了"。有了这张表就能回一句明确的用法提示并结束这一轮。
 *
 * 必须与 `#handleOpsCommand` 里的命令正则保持同步；`test/static-unit.mjs` 有一条
 * 静态守卫盯着这件事（每个词都得真的出现在命令正则的候选里）。
 */
