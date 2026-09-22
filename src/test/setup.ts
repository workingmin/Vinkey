// React's production build omits React.act, which Testing Library requires.
// Keep test runs deterministic even when the caller exports NODE_ENV=production.
declare const process: { env: Record<string, string | undefined> }
process.env.NODE_ENV = 'test'
