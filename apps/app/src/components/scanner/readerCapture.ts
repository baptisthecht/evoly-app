/**
 * Lecture des codes envoyés par un lecteur en mode clavier : douchette USB ou
 * Bluetooth, terminal Zebra (DataWedge, sortie clavier), Honeywell (Wedge as
 * keys), Sunmi, Urovo… Deux façons d'envoyer : touche par touche (key), ou d'un
 * bloc par le clavier d'Android (block). Fin du code : Entrée, Tab, ou une pause.
 */
export type ReaderEnd = "enter" | "tab" | "pause";
export type ReaderHow = "keys" | "block";
export interface ReaderRead {
  code: string;
  how: ReaderHow;
  end: ReaderEnd;
  /** Durée de la lecture, du premier caractère à la fin. */
  ms: number;
}

/** Au-delà de cet écart entre deux caractères : frappe humaine, rien n'est retenu. */
export const KEY_GAP_MS = 80;
/** Sans touche de fin : le code est complet après cette pause. */
export const PAUSE_MS = 120;
export const MIN_CODE = 4;
/** Sans touche de fin, touche par touche : au moins 6 caractères, à moins de 40 ms en moyenne. */
export const MIN_PAUSE_CODE = 6;
export const FAST_AVG_MS = 40;

interface Clock {
  now?: () => number;
  setTimer?: (f: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}
const clockOf = (c: Clock) => ({
  now: c.now ?? (() => Date.now()),
  set: c.setTimer ?? ((f: () => void, ms: number) => setTimeout(f, ms)),
  clear:
    c.clearTimer ??
    ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>)),
});

/** Touche par touche (écouteur du clavier hors des champs) : renvoie true si la touche est consommée. */
export function createKeyReader(
  onRead: (r: ReaderRead) => void,
  clock: Clock = {},
) {
  const c = clockOf(clock);
  let buf = "";
  let first = 0;
  let last = 0;
  let timer: unknown = null;
  const stop = () => {
    if (timer !== null) c.clear(timer);
    timer = null;
  };
  const flush = (end: ReaderEnd): boolean => {
    const code = buf;
    const ms = last - first;
    buf = "";
    stop();
    if (end === "pause") {
      const avg = ms / Math.max(1, code.length - 1);
      if (code.length < MIN_PAUSE_CODE || avg > FAST_AVG_MS) return false;
    } else if (code.length < MIN_CODE) return false;
    onRead({ code, how: "keys", end, ms });
    return true;
  };
  return {
    key(key: string): boolean {
      const t = c.now();
      if (buf && t - last > KEY_GAP_MS) {
        buf = "";
        stop();
      }
      if (key === "Enter" || key === "Tab") {
        if (!buf) return false;
        last = t;
        return flush(key === "Enter" ? "enter" : "tab");
      }
      if (key.length !== 1) return false;
      if (!buf) first = t;
      buf += key;
      last = t;
      stop();
      timer = c.set(() => flush("pause"), PAUSE_MS);
      return false;
    },
    dispose: stop,
  };
}

/**
 * Champ de lecture du mode lecteur : reçoit le code touche par touche ou d'un
 * bloc ; Entrée ou Tab le valident aussitôt, sinon une pause.
 */
export function createFieldReader(
  onRead: (r: ReaderRead) => void,
  clear: () => void,
  clock: Clock = {},
) {
  const c = clockOf(clock);
  let value = "";
  let started = 0;
  let keys = 0;
  let timer: unknown = null;
  const stop = () => {
    if (timer !== null) c.clear(timer);
    timer = null;
  };
  const flush = (end: ReaderEnd): boolean => {
    const code = value.trim();
    const how: ReaderHow =
      keys >= Math.max(1, code.length) * 0.8 ? "keys" : "block";
    const ms = c.now() - started;
    value = "";
    keys = 0;
    stop();
    clear();
    if (code.length < MIN_CODE) return false;
    onRead({ code, how, end, ms });
    return true;
  };
  return {
    /** Touche reçue dans le champ : un caractère compte pour la façon d'envoyer ; Entrée ou Tab valident. */
    key(key: string): boolean {
      if (key === "Enter" || key === "Tab")
        return value.trim() ? flush(key === "Enter" ? "enter" : "tab") : false;
      if (key.length === 1) keys++;
      return false;
    },
    /** Nouveau contenu du champ (touche par touche ou d'un bloc). */
    input(next: string) {
      if (!value) started = c.now();
      value = next;
      stop();
      timer = c.set(() => flush("pause"), PAUSE_MS);
    },
    dispose: stop,
  };
}
