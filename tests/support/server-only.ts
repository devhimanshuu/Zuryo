// Test shim for the `server-only` package, whose real entry point throws outside a React Server
// Components build. Vitest runs server modules directly, so the guard is replaced with a no-op here.
export {};
