/**
 * Champs d'un billet importé d'un réseau, dans l'ordre de l'écran de
 * confirmation des colonnes (partagé par le serveur et l'écran, sans la
 * lecture des fichiers).
 */
export const IMPORT_FIELDS = [
  "code",
  "reservation",
  "firstName",
  "lastName",
  "fullName",
  "email",
  "phone",
  "tarif",
  "price",
  "row",
  "seat",
  "quantity",
  "consent",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
