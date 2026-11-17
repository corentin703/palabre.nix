import type { RoomKey } from '../shared/api';

// What we remember on this device. localStorage may be unavailable (private browsing):
// everything is then lost when the page closes, with no other consequence.

const ROOMS_KEY = 'visio:rooms';
const HISTORY_KEY = 'visio:history';
const NAME_KEY = 'visio:name';
const EMAILS_KEY = 'visio:emails';
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
    // See above.
  }
}

// // --- Keys of the rooms created or opened as a moderator on this device ------------------------

const memory: Record<string, RoomKey> = {};

export function findRoomKey(name: string): RoomKey | null {
  return memory[name] ?? read<Record<string, RoomKey>>(ROOMS_KEY, {})[name] ?? null;
}

export function saveRoomKey(name: string, key: RoomKey): void {
  memory[name] = key;
  write(ROOMS_KEY, { ...read<Record<string, RoomKey>>(ROOMS_KEY, {}), [name]: key });
}

// // --- History of the meetings ------------------------------------------------------------------

export interface HistoryItem {
  slug: string;
  title: string;
  /** Moderator key: the history link gets the rights back in one click. */
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

// // --- First name -------------------------------------------------------------------------------

export const loadName = (): string => read<string>(NAME_KEY, '');
export const saveName = (name: string): void => write(NAME_KEY, name);

// // --- Email addresses the links were successfully sent to --------------------------------------

const EMAILS_MAX = 5;

/** The latest addresses (newest first), at most EMAILS_MAX. */
export function loadEmails(): string[] {
  return read<unknown[]>(EMAILS_KEY, []).filter((e): e is string => typeof e === 'string' && e !== '').slice(0, EMAILS_MAX);
}

/** To call once the links were sent without error: the address goes first, without duplicate. */
export function rememberEmail(email: string): void {
  const address = email.trim();
  if (!address) return;
  const others = loadEmails().filter((e) => e.toLowerCase() !== address.toLowerCase());
  write(EMAILS_KEY, [address, ...others].slice(0, EMAILS_MAX));
}
