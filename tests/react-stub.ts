// Minimal React stub for unit tests — only what lib/queries.ts touches.
export const cache = <T extends (...args: any[]) => any>(fn: T): T => fn;
