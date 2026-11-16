import { ProviderError } from './errors';

const REQUEST_TIMEOUT_MS = 10_000;

export interface FetcherOptions {
  /** Minimum time between two network requests. */
  minIntervalMs: number;
  fetch?: typeof fetch;
  /** Monotonic clock in ms. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface GetOptions {
  headers?: Record<string, string>;
  /** Name shown in error messages. */
  service: string;
  /** Called with every response, before it is returned (to read rate-limit headers). */
  onResponse?: (response: Response) => void;
}

/** Serialized, throttled GET requests: one in flight at a time, at least `minIntervalMs` apart, and a block when a service asks to wait. */
export class ThrottledFetcher {
  private readonly minIntervalMs: number;
  private readonly doFetch: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private last = Number.NEGATIVE_INFINITY;
  private blockedUntil = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: FetcherOptions) {
    this.minIntervalMs = options.minIntervalMs;
    this.doFetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => performance.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  get(url: string, options: GetOptions): Promise<Response> {
    const run = this.queue.then(() => this.request(url, options));
    this.queue = run.catch(() => undefined); // a failed request must not stop the next one
    return run;
  }

  /** Refuse further requests for `seconds` (the service asked us to back off). */
  blockFor(seconds: number): void {
    this.blockedUntil = this.now() + seconds * 1000;
  }

  private async request(
    url: string,
    { headers, service, onResponse }: GetOptions,
  ): Promise<Response> {
    const start = this.now();
    if (start < this.blockedUntil) {
      throw new ProviderError('wait', service, Math.ceil((this.blockedUntil - start) / 1000));
    }
    await this.sleep(Math.max(0, this.last + this.minIntervalMs - start));
    try {
      const response = await this.doFetch(url, {
        headers: headers ?? {},
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      onResponse?.(response);
      return response;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('noResponse', service);
    } finally {
      this.last = this.now();
    }
  }
}
