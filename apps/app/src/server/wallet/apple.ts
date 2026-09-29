import "server-only";
import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import forge from "node-forge";
import { env } from "@/lib/env";
import { ICON, ICON_2X, ICON_3X, LOGO, LOGO_2X } from "./assets";
import { rgb, type WalletTicket } from "./ticket";

export interface AppleCredentials {
  passTypeIdentifier: string;
  teamIdentifier: string;
  certPem: string;
  keyPem: string;
  passphrase?: string;
  wwdrPem: string;
}

const b64 = (v: string) => Buffer.from(v, "base64").toString("utf8");

/** Identifiants Apple lus depuis l'environnement ; null tant qu'ils ne sont pas tous fournis. */
export function appleCredentials(): AppleCredentials | null {
  const e = env();
  if (!e.APPLE_PASS_TYPE_ID || !e.APPLE_TEAM_ID || !e.APPLE_PASS_CERT_PEM || !e.APPLE_PASS_KEY_PEM || !e.APPLE_WWDR_PEM) return null;
  return { passTypeIdentifier: e.APPLE_PASS_TYPE_ID, teamIdentifier: e.APPLE_TEAM_ID, certPem: b64(e.APPLE_PASS_CERT_PEM), keyPem: b64(e.APPLE_PASS_KEY_PEM), passphrase: e.APPLE_PASS_KEY_PASSPHRASE, wwdrPem: b64(e.APPLE_WWDR_PEM) };
}

const LABELS = {
  fr: { seat: "PLACE", date: "DATE", event: "ÉVÉNEMENT", when: "QUAND", where: "OÙ", type: "TARIF", holder: "TITULAIRE", order: "Commande", code: "Code du billet", info: "À savoir", infoText: "Présentez ce QR code à l’entrée. Il n’est valable qu’une fois : ne le partagez pas." },
  en: { seat: "SEAT", date: "DATE", event: "EVENT", when: "WHEN", where: "WHERE", type: "TICKET", holder: "HOLDER", order: "Order", code: "Ticket code", info: "Good to know", infoText: "Show this QR code at the entrance. It works only once: don't share it." },
} as const;

/** Contenu du pass (format Apple « eventTicket »). */
export function passJson(t: WalletTicket, creds: Pick<AppleCredentials, "passTypeIdentifier" | "teamIdentifier">) {
  const L = LABELS[t.locale];
  return {
    formatVersion: 1,
    passTypeIdentifier: creds.passTypeIdentifier,
    teamIdentifier: creds.teamIdentifier,
    serialNumber: t.ticketId,
    organizationName: t.organizationName,
    description: `${t.title} — ${t.typeName}`,
    logoText: t.organizationName,
    backgroundColor: rgb(t.background),
    foregroundColor: rgb(t.foreground),
    labelColor: rgb(t.foreground),
    relevantDate: t.startsAt.toISOString(),
    expirationDate: new Date(t.endsAt.getTime() + 24 * 3_600_000).toISOString(),
    barcodes: [{ format: "PKBarcodeFormatQR", message: t.code, messageEncoding: "iso-8859-1", altText: t.shortCode }],
    barcode: { format: "PKBarcodeFormatQR", message: t.code, messageEncoding: "iso-8859-1", altText: t.shortCode },
    eventTicket: {
      primaryFields: [{ key: "event", label: L.event, value: t.title }],
      secondaryFields: [
        { key: "when", label: L.when, value: t.when },
        ...(t.place ? [{ key: "where", label: L.where, value: t.place }] : []),
      ],
      auxiliaryFields: [{ key: "type", label: L.type, value: t.typeName }, ...(t.seat ? [{ key: "seat", label: L.seat, value: t.seat }] : []), ...(t.holder ? [{ key: "holder", label: L.holder, value: t.holder }] : [])],
      backFields: [
        { key: "order", label: L.order, value: t.reference },
        { key: "code", label: L.code, value: t.shortCode },
        { key: "info", label: L.info, value: L.infoText },
      ],
    },
  };
}

const sha1 = (data: Uint8Array) => createHash("sha1").update(data).digest("hex");

/** Signature PKCS#7 détachée du manifeste, avec le certificat du type de pass et le certificat intermédiaire WWDR. */
function signManifest(manifest: Uint8Array, creds: AppleCredentials): Uint8Array {
  const cert = forge.pki.certificateFromPem(creds.certPem);
  const key = creds.passphrase ? forge.pki.decryptRsaPrivateKey(creds.keyPem, creds.passphrase) : forge.pki.privateKeyFromPem(creds.keyPem);
  if (!key) throw new Error("clé du certificat Apple illisible");
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(Buffer.from(manifest).toString("binary"));
  p7.addCertificate(cert);
  p7.addCertificate(forge.pki.certificateFromPem(creds.wwdrPem));
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256!,
    authenticatedAttributes: [{ type: forge.pki.oids.contentType!, value: forge.pki.oids.data! }, { type: forge.pki.oids.messageDigest! }, { type: forge.pki.oids.signingTime!, value: new Date().toISOString() }],
  });
  p7.sign({ detached: true });
  return Uint8Array.from(Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary"));
}

/** US-POST-03 : fichier .pkpass (archive signée : pass.json, images, manifest.json, signature). */
export function buildPkpass(t: WalletTicket, creds: AppleCredentials): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "pass.json": strToU8(JSON.stringify(passJson(t, creds))),
    "icon.png": new Uint8Array(ICON),
    "icon@2x.png": new Uint8Array(ICON_2X),
    "icon@3x.png": new Uint8Array(ICON_3X),
    "logo.png": new Uint8Array(LOGO),
    "logo@2x.png": new Uint8Array(LOGO_2X),
  };
  const manifest = strToU8(JSON.stringify(Object.fromEntries(Object.entries(files).map(([name, data]) => [name, sha1(data)]))));
  return zipSync({ ...files, "manifest.json": manifest, signature: signManifest(manifest, creds) }, { level: 6 });
}
