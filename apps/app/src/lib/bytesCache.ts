/**
 * Cache en mémoire limité en octets (RG-FILE-02) : un élément relu passe en dernier, les plus anciens sortent dès que la
 * limite est dépassée, le dernier entré reste toujours. Une même clé enregistrée deux fois n'est comptée qu'une fois.
 */
export function createBytesCache(maxBytes: number) {
  const map = new Map<string, Uint8Array>();
  let total = 0;
  const stats = { hits: 0, misses: 0 };
  return {
    stats,
    get size() {
      return map.size;
    },
    get bytes() {
      return total;
    },
    get(key: string): Uint8Array | undefined {
      const hit = map.get(key);
      if (!hit) return undefined;
      map.delete(key);
      map.set(key, hit); // le plus récemment utilisé passe en dernier
      stats.hits += 1;
      return hit;
    },
    set(key: string, value: Uint8Array) {
      const previous = map.get(key);
      if (previous) {
        map.delete(key);
        total -= previous.length;
      }
      stats.misses += 1;
      map.set(key, value);
      total += value.length;
      while (total > maxBytes && map.size > 1) {
        const [oldest, old] = map.entries().next().value!;
        map.delete(oldest);
        total -= old.length;
      }
    },
  };
}
