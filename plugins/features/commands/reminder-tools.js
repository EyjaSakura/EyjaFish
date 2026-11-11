// 提醒工具：让 agent 自己取消当前聊天的提醒
export function registerReminderTools({ defineTool, agentCtx, route, key, role, bridge }) {
  agentCtx.tools.register(defineTool({
    name: 'qq_reminder_cancel',
    description: '取消当前聊天的提醒。arg 省略=最近一条；"全部"=所有；否则按内容关键词匹配。',
    parameters: {
      arg: { type: 'string', description: '关键词，或「全部」；省略则取消最近一条' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { detail: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.detail }],
    },
    async execute(args) {
      return { detail: bridge.cancelReminderByKey(key, String(args.arg ?? '')) }
    },
  }))
}