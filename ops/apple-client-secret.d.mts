// Types du script ops/apple-client-secret.mjs (testé par apps/app/test/apple-client-secret.test.ts).
export declare const MAX_DAYS: number;
export declare function appleClientSecret(input: {
  teamId: string;
  keyId: string;
  servicesId: string;
  privateKeyPem: string;
  days?: number;
  now?: number;
}): { token: string; expiresAt: Date };
