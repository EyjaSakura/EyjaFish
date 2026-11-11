// 启动维护：对账 → 占位 → 工作区回填 → watchdog 告警。
// 单步失败只记日志，不阻断其它步骤。

/** @param {any} args */
export async function runSessionMaintenance({ steps, debugLog = () => {} }) {
  for (const step of steps) {
    try {
      await step.run()
    } catch (error) {
      debugLog(`${step.label} failed: ${error.message}`)
    }
  }
}
