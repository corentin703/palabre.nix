import type { RoomKey } from '../shared/api';

// Ce que l'on retient sur cet appareil. localStorage peut être indisponible (navigation privée) :
// tout est alors perdu à la fermeture de la page, sans autre conséquence.

const ROOMS_KEY = 'visio:rooms';
const HISTORY_KEY = 'visio:history';
const NAME_KEY = 'visio:name';
const HISTORY_SIZE = 10;

function read<T>(key: string, fallback: T): T {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return value && typeof value === typeof fallback ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Voir plus haut.
  }
}

// --- Clés des salons créés ou ouverts en modérateur sur cet appareil ---------------------------

const memory: Record<string, RoomKey> = {};

export function findRoomKey(name: string): RoomKey | null {
  return memory[name] ?? read<Record<string, RoomKey>>(ROOMS_KEY, {})[name] ?? null;
}

export function saveRoomKey(name: string, key: RoomKey): void {
  memory[name] = key;
  write(ROOMS_KEY, { ...read<Record<string, RoomKey>>(ROOMS_KEY, {}), [name]: key });
}

// --- Historique des réunions --------------------------------------------------------------------

export interface HistoryItem {
  slug: string;
  title: string;
  /** Clé de modérateur : le lien de l'historique redonne ses droits d'un clic. */
  mod: string;
  at: number;
}

export function loadHistory(): HistoryItem[] {
  return read<HistoryItem[]>(HISTORY_KEY, []).filter((item) => item?.slug);
}

export function rememberMeeting(item: HistoryItem): void {
  const others = loadHistory().filter((i) => i.slug !== item.slug);
  write(HISTORY_KEY, [item, ...others].slice(0, HISTORY_SIZE));
}

export function clearHistory(): void {
  write(HISTORY_KEY, []);
}

// --- Prénom -------------------------------------------------------------------------------------

export const loadName = (): string => read<string>(NAME_KEY, '');
export const saveName = (name: string): void => write(NAME_KEY, name);
