export function createUserMessage(...args) {
  return { role: 'user', content: args }
}
