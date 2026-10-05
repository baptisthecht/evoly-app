import { z } from "zod";

/** Variables d'environnement, validées au premier accès côté serveur. */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET doit faire au moins 32 caractères"),
  BETTER_AUTH_URL: z.url().default("http://localhost:3001"),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_APPLE_ID: z.string().optional(),
  AUTH_APPLE_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET_PLATFORM: z.string().optional(),
  STRIPE_WEBHOOK_SECRET_CONNECT: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  ORDER_TOKEN_SECRET: z.string().min(32).optional(), // liens magiques des commandes ; BETTER_AUTH_SECRET à défaut
  CRON_SECRET: z.string().min(16).optional(), // tâches planifiées (libération des réservations expirées)
  EVOLY_LEGAL_NAME: z.string().default("Baptist Hecht - Evoly Solutions"), // émetteur des relevés de commissions
  R2_ACCOUNT_ID: z.string().optional(), // fichiers importés (logos, images) ; à défaut, dossier local UPLOADS_DIR
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default("evoly-uploads"),
  R2_PUBLIC_URL: z.url().optional(), // domaine public du bucket, ex. https://files.evoly.me
  UPLOADS_DIR: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(), // plan de salle d'après une photo (facultatif)
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5-5"),
  CUSTOM_DOMAIN_TARGET: z.string().optional(), // cible CNAME des domaines personnalisés ; à défaut domains.<NEXT_PUBLIC_BASE_DOMAIN>
  STRIPE_PRICE_PRO_MONTH: z.string().optional(), // abonnement Pro (compte Stripe d’Evoly) ; à défaut, prix de la base
  STRIPE_PRICE_PRO_YEAR: z.string().optional(),
  STRIPE_TAX_ENABLED: z.enum(["true", "false"]).default("false"),
  EVOLY_LEGAL_ADDRESS: z.string().default("Rue du Bilemont 376, 7700 Mouscron, Belgique"),
  EVOLY_VAT_NUMBER: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  APPLE_PASS_TYPE_ID: z.string().optional(), // US-POST-03 : Apple Wallet (pass.me.evoly.ticket)
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_PASS_CERT_PEM: z.string().optional(), // certificat du type de pass, PEM encodé en base64
  APPLE_PASS_KEY_PEM: z.string().optional(), // clé privée du certificat, PEM encodé en base64
  APPLE_PASS_KEY_PASSPHRASE: z.string().optional(),
  APPLE_WWDR_PEM: z.string().optional(), // certificat intermédiaire Apple WWDR (G4), PEM encodé en base64
  GOOGLE_WALLET_ISSUER_ID: z.string().optional(), // US-POST-03 : Google Wallet
  GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_WALLET_PRIVATE_KEY: z.string().optional(), // clé privée du compte de service, PEM encodé en base64
  SUPPORT_EMAIL: z.email().optional(), // alertes au support d’Evoly (remboursement de vendeur impossible…)
  RESEND_WEBHOOK_SECRET: z.string().optional(), // « whsec_… » : signature des événements de délivrabilité (Svix)
  EMAIL_FROM_DOMAIN: z.string().default("evoly.me"),
  EMAIL_OUTBOX_DIR: z.string().optional(), // développement : e-mails écrits sur disque au lieu d'être envoyés
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3001"),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_BASE_DOMAIN: z.string().default("evoly.me"),
  NEXT_PUBLIC_SHORT_LINK_BASE: z.url().optional(), // https://evoly.me : le proxy d’entrée envoie /e/* vers l’app
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  // une valeur laissée vide (VAR="") compte comme absente : service non configuré, jamais une erreur de format
  if (!cached) cached = schema.parse(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== "")));
  return cached;
}
