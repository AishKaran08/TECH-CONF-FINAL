import type { ServerEvent } from '@runway/shared';

type Listener = (e: ServerEvent) => void;

/** In-process pub/sub that feeds the SSE endpoint. */
export class EventHub {
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(e: ServerEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(e);
      } catch (err) {
        console.warn('[events] listener failed', (err as Error).message);
      }
    }
  }

  get size(): number {
    return this.listeners.size;
  }
}
