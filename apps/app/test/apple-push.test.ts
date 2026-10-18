import { beforeEach, describe, expect, it, vi } from "vitest";

const h2 = vi.hoisted(() => ({
  connected: [] as Array<{ url: string; opts: Record<string, unknown> }>,
  requests: [] as Array<Record<string, string>>,
  closed: 0,
  status: (_token: string): number | "error" => 200,
}));
vi.mock("node:http2", () => ({
  connect: (url: string, opts: Record<string, unknown>) => {
    h2.connected.push({ url, opts });
    return {
      on: () => undefined,
      close: () => void h2.closed++,
      request: (headers: Record<string, string>) => {
        h2.requests.push(headers);
        const on: Record<string, (x?: unknown) => void> = {};
        const token = headers[":path"]!.split("/").pop()!;
        return {
          on: (event: string, fn: (x?: unknown) => void) => void (on[event] = fn),
          resume: () => undefined,
          end: () =>
            queueMicrotask(() => {
              const s = h2.status(token);
              if (s === "error") on.error?.(new Error("connexion coupée"));
              else {
                on.response?.({ ":status": s });
                on.close?.();
              }
            }),
        };
      },
    };
  },
}));
const { sendApplePushes } = await import("@/server/wallet/push");

const creds = { passTypeIdentifier: "pass.me.evoly.ticket", teamIdentifier: "TEAM", certPem: "CERT", keyPem: "KEY", wwdrPem: "WWDR" };
beforeEach(() => {
  h2.connected = [];
  h2.requests = [];
  h2.closed = 0;
  h2.status = () => 200;
});

describe("notifications Apple Wallet (RG-POST-04)", () => {
  it("aucun jeton : aucune connexion", async () => {
    expect(await sendApplePushes([], creds)).toEqual([]);
    expect(h2.connected).toEqual([]);
  });

  it("chaque téléphone prévenu avec le bon sujet ; les jetons déclarés périmés (410) sont rendus", async () => {
    h2.status = (t) => (t === "perime" ? 410 : 200);
    expect(await sendApplePushes(["actif", "perime"], creds)).toEqual(["perime"]);
    expect(h2.connected[0]!.url).toBe("https://api.push.apple.com");
    expect(h2.requests.map((r) => [r[":method"], r[":path"], r["apns-topic"]])).toEqual([
      ["POST", "/3/device/actif", "pass.me.evoly.ticket"],
      ["POST", "/3/device/perime", "pass.me.evoly.ticket"],
    ]);
    expect(h2.closed).toBe(1);
  });

  it("une erreur sur un appareil ne bloque pas les autres", async () => {
    h2.status = (t) => (t === "casse" ? "error" : t === "perime" ? 410 : 200);
    expect(await sendApplePushes(["casse", "perime", "actif"], creds)).toEqual(["perime"]);
    expect(h2.closed).toBe(1);
  });

  it("phrase secrète du certificat transmise seulement si elle existe", async () => {
    await sendApplePushes(["a"], { ...creds, passphrase: "secret" });
    await sendApplePushes(["a"], creds);
    expect(h2.connected[0]!.opts).toMatchObject({ cert: "CERT", key: "KEY", passphrase: "secret" });
    expect("passphrase" in h2.connected[1]!.opts).toBe(false);
  });
});
