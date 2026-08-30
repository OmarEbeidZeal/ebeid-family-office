import { useEffect, useRef, useState } from "react";

/**
 * Motion is decoration, never information. Anything that moves in this app
 * asks this hook first and renders its final state immediately when the
 * operating system says the user does not want animation.
 */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -9 * t));

/**
 * Counts a figure up the first time it arrives. Every later change snaps: a
 * number that moves because the data moved should not be replayed, or the
 * page reads as unstable.
 */
export function useCountUp(value: number, options?: { duration?: number; enabled?: boolean }) {
  const duration = options?.duration ?? 850;
  const enabled = options?.enabled ?? true;
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  const played = useRef(false);
  const frame = useRef<number | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const target = Number.isFinite(value) ? value : 0;

    // Already animated once, animation switched off, or nothing to count to.
    if (played.current || !enabled || reduced || target === 0) {
      setDisplay(target);
      return;
    }

    played.current = true;
    const start = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setDisplay(target * easeOutExpo(progress));
      if (progress < 1) frame.current = requestAnimationFrame(step);
      else frame.current = null;
    };

    frame.current = requestAnimationFrame(step);

    // A frame loop stalls in a hidden or throttled tab. A money figure must
    // never be left frozen part-way through a count, so the true value also
    // lands on a timer regardless of whether frames kept coming.
    settle.current = setTimeout(() => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      setDisplay(target);
    }, duration + 150);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      if (settle.current !== null) clearTimeout(settle.current);
      settle.current = null;
    };
  }, [value, duration, enabled, reduced]);

  return display;
}
