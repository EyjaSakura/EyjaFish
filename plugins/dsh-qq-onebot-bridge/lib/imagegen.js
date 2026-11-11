// 兼容层：老代码从 './imagegen.js' 导入 generateImage；
// 实际实现已拆分到 ./imagegen/ 目录（多 provider）。
export { generateImage, listProviders, loadConfig } from './services/imagegen/index.js'
export { buildRequest as buildOpenaiImageRequest, parseResponse as parseOpenaiImageResponse } from './services/imagegen/providers/openai.js'
export { buildRequest as buildLocalTxt2ImgRequest } from './services/imagegen/providers/local-sd.js'
