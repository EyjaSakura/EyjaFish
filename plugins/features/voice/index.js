// 语音功能插件：朗读 / TTS / 合成 / 语音消息处理
import { handleVoiceReading } from './reading.js'
import { sendTts } from './tts.js'
import { synthVoiceFile } from './synth.js'
import { handleVoice } from './message.js'

export const hooks = { handleVoiceReading, sendTts, synthVoiceFile, handleVoice }
