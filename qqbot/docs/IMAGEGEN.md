# 生图（多 Provider）

## 结构

```
lib/imagegen/
  index.js          统一入口：选 provider、fallback、缓存、记账
  types.js          ImageError / 尺寸 / 格式嗅探
  registry 内嵌      providers 映射
  cost.js           价格表
  cache.js          prompt 哈希缓存
  providers/
    openai.js       OpenAI 兼容（智谱 / SiliconFlow / OpenAI / 302）
    dashscope.js    百炼异步任务（Wan2.1 / Qwen-Image）
    pollinations.js 免费 GET 直出
    local-sd.js     本地 SD WebUI
```

`lib/imagegen.js` 是兼容层，老的 `generateImage(config, prompt)` 继续可用。

## 配置

`D:\DSH\qqbot\data\imagegen.json`：

```json
{
  "provider": "cogview-free",
  "fallback": ["pollinations"],
  "cache": true,
  "providers": {
    "cogview-free": { "type": "openai", "model": "cogview-3-flash", ... },
    "pollinations": { "type": "pollinations", "model": "flux", ... },
    "wanx-paid":    { "type": "dashscope", "model": "wanx2.1-t2i-turbo", ... },
    "qwen-image":   { "type": "dashscope", "model": "qwen-image-3.0", ... },
    "local-sd":     { "type": "local", "baseUrl": "http://127.0.0.1:7860" }
  }
}
```

切换付费只需把 `"provider"` 改成 `"wanx-paid"`，业务代码不动。

## 当前默认

| 项 | 值 |
|---|---|
| 主 provider | `cogview-free`（智谱 CogView-3-Flash，免费，带「AI生成」水印） |
| fallback | `pollinations`（免费，带水印） |
| 付费备选 | `wanx-paid`（Wan2.1-turbo，约 ¥0.15/张，无水印） |
| 参考图/编辑 | `qwen-image`（Qwen-Image-3.0，未实跑） |
| 本地 | `local-sd`（需要 SD WebUI，未启动） |

## 入口

| 入口 | 说明 |
|---|---|
| `/画 描述` | 命令，所有人可用（受权限/冷却/日限） |
| `qq_draw(prompt, size?, caption?)` | 工具，主人 + 倩倩姐（QQ 2930661826）；画完直接发当前会话 |

## 水印策略

- 免费档保留水印，不自动裁剪
- 结果里带 `watermark` 字段，工具会告知「带水印」
- 需要无水印就切 `wanx-paid`

## 记账

每次生成写 `D:\DSH\qqbot\data\image-usage.jsonl`：

```json
{"provider":"cogview-free","model":"cogview-3-flash","cost":0,"ok":true,"watermark":true}
```

## 自测记录（2026-11-08）

| 项 | 结果 |
|---|---|
| cogview-free | ✅ jpeg，约 8 秒，免费，有水印 |
| pollinations | ✅ jpeg，约 6 秒，免费，有水印 |
| wanx-paid | ✅ png，约 10 秒，¥0.15，无水印 |
| fallback | ✅ 指定不存在的 provider，落到 pollinations |
| 缓存 | ✅ 同 prompt 第二次命中，字节一致 |
| `/画` | ✅ 先回「正在努力作画」，再发图 |
| `qq_draw` | ✅ 工具调用成功，发图 + 反馈 |

## 已知限制

- `qwen-image`、`local-sd` 只做了适配，未真实跑过
- 免费档有水印，不建议裁剪外发
- 发图用 base64 内联（NapCat 拉文件路径会超时）
