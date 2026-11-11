// Per-session extras that run after the core session-install service:
// feature isolation, usage rule, registerFeature plugins, and reminder/usage hooks.
export async function installSessionExtras({
  agentCtx,
  route,
  key,
  opts,
  defineTool,
  debugLog,
  features,
  featureMeta,
  featureTools,
  roleOf,
  featureApi,
  bridgeApi,
  cancelReminderByKey,
  sendImageTo,
  sendImageBuffer,
  generateImage,
  drawAllowed,
  ownerQQ,
}) {
  if (featureMeta.disabled.length > 0) {
    try {
      agentCtx.systemPrompt.section({
        name: 'qq-feature-isolation',
        order: 1187,
        text: '【功能隔离】以下功能已停用：' + featureMeta.disabled.join('、') + '。禁止通过 read / pwsh / 文件工具读取或写入这些路径：' + featureMeta.dataPaths.join('；') + '。若用户要求相关操作，直接说明该功能已停用。',
      })
    } catch { /* ignore */ }
  }
  try {
    agentCtx.systemPrompt.section({
      name: 'qq-usage-rule',
      order: 1188,
      text: '用户问用量/花费/多少钱/token 时，必须先调用 qq_usage_report 取实时数据；禁止凭记忆报旧数字，也禁止自己写脚本算。拿到结果后把它那一整行原样发出，不要改写、不要拆行、不要补充解释。',
    })
  } catch { /* ignore */ }

  try {
    for (const [featureName, mod] of (features.modules ?? new Map())) {
      const fn = mod?.hooks?.registerFeature
      if (typeof fn !== 'function') continue
      try {
        await fn({
          defineTool: (def) => { try { featureTools.add(String(def.name)) } catch { } return defineTool(def) },
          agentCtx, route, key,
          role: (opts && opts.role) || roleOf(route),
          bridge: featureApi(),
          debugLog,
        })
      } catch (error) { debugLog('[feature] registerFeature ' + featureName + ' failed: ' + error.message) }
    }
  } catch (error) { debugLog('[feature] registerFeature loop failed: ' + error.message) }

  for (const hookName of ['registerReminderTools', 'registerWorklogTools', 'registerUsageTools']) {
    const fn = features.get(hookName)
    if (!fn) continue
    try {
      fn({
        defineTool,
        agentCtx,
        route,
        key,
        role: (opts && opts.role) || roleOf(route),
        bridge: bridgeApi({
          cancelReminderByKey: (...a) => cancelReminderByKey(...a),
          sendImageTo: (...a) => sendImageTo(...a),
          sendImageBuffer: (...a) => sendImageBuffer(...a),
          generateImage: (prompt, options) => generateImage(prompt, options),
          drawAllowed: (subject) => drawAllowed(subject),
          ownerQQ: () => ownerQQ(),
        }),
      })
    } catch (e) { debugLog('[feature] ' + hookName + ' failed: ' + e.message) }
  }
}
