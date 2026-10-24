import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** True once the element has scrolled into view (stays true). */
export function useInView<T extends Element>(options: IntersectionObserverInit = { threshold: 0.2 }): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setInView(true);
        io.disconnect();
      }
    }, options);
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);
  return [ref, inView];
}

/** Tween a number towards `target` (rAF, ease-out). Jumps instantly with reduced motion. */
export function useTween(target: number, durationMs = 700): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (prefersReducedMotion() || from.current === target) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 4);
      setValue(a + (target - a) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, durationMs]);
  return value;
}

/**
 * FLIP reorder animation. Give each child a `data-flip-key`. When `deps` change, children
 * that moved animate from their old position to the new one using transform only.
 */
export function useFlip<T extends HTMLElement>(deps: unknown): React.RefObject<T | null> {
  const ref = useRef<T>(null);
  const positions = useRef(new Map<string, DOMRect>());

  // Measure before paint on every render (old positions are from the previous layout).
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-flip-key]'));
    const prev = positions.current;
    const next = new Map<string, DOMRect>();
    for (const node of nodes) next.set(node.dataset.flipKey!, node.getBoundingClientRect());
    if (!prefersReducedMotion() && prev.size > 0) {
      for (const node of nodes) {
        const key = node.dataset.flipKey!;
        const before = prev.get(key);
        const after = next.get(key)!;
        if (!before) continue;
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        node.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: 450, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        );
      }
    }
    positions.current = next;
  }, [deps]);

  return ref;
}

/** Re-render on an interval (e.g. once a minute for countdowns). */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
