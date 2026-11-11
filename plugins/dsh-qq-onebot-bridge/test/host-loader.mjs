const stubs = {
  '@deepseek-ai/dsh-llm': new URL('./stubs/dsh-llm.mjs', import.meta.url).href,
  '@deepseek-ai/dsh-session': new URL('./stubs/dsh-session.mjs', import.meta.url).href,
  '@deepseek-ai/dsh-tools': new URL('./stubs/dsh-tools.mjs', import.meta.url).href,
}

export async function resolve(specifier, context, next) {
  if (stubs[specifier]) return { url: stubs[specifier], shortCircuit: true }
  return next(specifier, context)
}
