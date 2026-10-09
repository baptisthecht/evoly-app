/** RG-BUY-10 : résolution du défi anti-robots dans le navigateur (Web Crypto), moins d'une seconde en moyenne. */
export type BotChallenge = { salt: string; difficulty: number; expires: number; signature: string };

function leadingZeroBits(bytes: Uint8Array): number {
  let n = 0;
  for (const b of bytes) {
    if (b === 0) {
      n += 8;
      continue;
    }
    n += Math.clz32(b) - 24;
    break;
  }
  return n;
}

export async function solveBotChallenge(c: BotChallenge): Promise<BotChallenge & { nonce: number }> {
  const enc = new TextEncoder();
  for (let nonce = 0; nonce < 20_000_000; nonce++) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`${c.salt}${nonce}`)));
    if (leadingZeroBits(digest) >= c.difficulty) return { ...c, nonce };
  }
  throw new Error("défi anti-robots non résolu");
}
