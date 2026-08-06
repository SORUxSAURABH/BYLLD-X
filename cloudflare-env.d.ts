interface Fetcher {
  fetch(input: Request | URL | string, init?: RequestInit): Promise<Response>;
}

interface D1Database {
  prepare(query: string): unknown;
}

declare module "cloudflare:workers" {
  export const env: { DB?: D1Database; [binding: string]: unknown };
}
