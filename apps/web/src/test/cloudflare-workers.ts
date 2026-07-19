/**
 * Vitest runs under jsdom, where Cloudflare's runtime-only module is absent.
 * This adapter supplies only the base-class shape needed to import Worker
 * modules; production builds continue resolving the real platform module.
 */
export class DurableObject<Environment = unknown> {
  protected readonly ctx: unknown;
  protected readonly env: Environment;

  constructor(ctx: unknown, env: Environment) {
    this.ctx = ctx;
    this.env = env;
  }
}

export const env: Record<string, never> = {};
