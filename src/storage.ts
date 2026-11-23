// Tiny wrapper around localStorage. Storage can be unavailable (private mode,
// blocked cookies), so every read/write is guarded and the app works without it.
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`inside-exchange:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(`inside-exchange:${key}`, JSON.stringify(value));
  } catch {
    /* progress just isn't remembered */
  }
}
