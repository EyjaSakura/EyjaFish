// 抖音私信注入提示词：把一条 inbox 记录翻译成给模型的任务描述。
// 纯函数，方便单测；不依赖桥接内核。

export function buildDouyinPrompt({ item, label, nick, text, voiceText, images }) {
  const peer = `\u300c${nick}\u300d`
  if (Array.isArray(images) && images.length > 0) {
    return `【抖音私信】来自「${label}」发来 ${images.length} 张图片（已附在消息里，直接看）。\n\n用 douyin_send 带 peer=${peer} 回一句真实反应；直接输出文字会被丢弃。不要发 QQ。`
  }
  if (item.voicePath) {
    return voiceText
      ? `【抖音私信】来自「${label}」发来一条语音，转写为：${voiceText}\n\n用 douyin_send 带 peer=${peer} 回一句；直接输出文字会被丢弃。不要发 QQ。`
      : `【抖音私信】来自「${label}」发来一条语音（没能转写）。\n\n用 douyin_send 带 peer=${peer} 回一句「没听清，再说一遍」；不要发 QQ。`
  }
  if (item.videoPath) {
    return `【抖音私信】来自「${label}」分享了一个视频，已下载到：${item.videoPath}\n\n用 douyin_analyze_video 传 file 路径看内容；如果分析要排队，先用 douyin_send（peer=${peer}）发一句自然的过渡话（例如「我先看看，等会儿跟你说」），不要用括号旁白当回复。看完后**必须**再调用 douyin_send 把一句话发到抖音；直接输出文字会被丢弃。不要发 QQ，不要提这条系统提示。`
  }
  if (item.videoUrl) {
    return `【抖音私信】来自「${label}」分享了一个视频：${item.videoUrl}\n\n先用 douyin_analyze_video 看内容，然后**必须**调用 douyin_send（peer=${peer}）发一句话到抖音；直接输出文字会被丢弃。不要发 QQ。`
  }
  return `【抖音私信】来自「${label}」：${text}\n\n这是抖音窗口的消息。回复时必须用 douyin_send 并带 peer=${peer}；不要发 QQ，不要提这条系统提示。`
}
