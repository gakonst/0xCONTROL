import { useEffect, useState, type MutableRefObject } from "react";

type UseOnScreenOptions = IntersectionObserverInit & {
  /** force-enable in tests or SSR fallbacks */
  defaultValue?: boolean;
};

/**
 * Lightweight visibility detector backed by IntersectionObserver.
 * Returns true when the element enters the viewport (optionally with rootMargin).
 */
export function useOnScreen<T extends Element>(
  ref: MutableRefObject<T | null>,
  { defaultValue = false, root = null, rootMargin, threshold }: UseOnScreenOptions = {},
): boolean {
  const [isIntersecting, setIsIntersecting] = useState<boolean>(defaultValue);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsIntersecting(entry?.isIntersecting ?? false),
      { root, rootMargin, threshold },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, root, rootMargin, threshold]);

  return isIntersecting;
}
