// Server event subscription with a real disposer.
export function onServerEvent({ server, event, handler }) {
  server.on(event, handler)
  return () => {
    if (typeof server.off === 'function') server.off(event, handler)
    else if (typeof server.removeListener === 'function') server.removeListener(event, handler)
  }
}
