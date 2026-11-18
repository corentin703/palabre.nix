import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Rooms closed to new guests from the /admin panel. Moderators (and the administrator) can
 * still join them.
 *
 * Kept in memory, and in a small JSON file when one is given so that a restart does not open
 * the rooms again. An unreadable file is an error rather than an empty list: starting
 * without it would silently reopen every closed room.
 */
export interface ClosedRooms {
  has(roomId: string): boolean;
  /** Closes (true) or reopens (false) a room. */
  set(roomId: string, closed: boolean): void;
}

export function createClosedRooms(file: string | undefined): ClosedRooms {
  const closed = new Set<string>();
  if (file) {
    let raw: string | undefined;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    if (raw !== undefined) {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) {
        throw new Error(`${file}: expected a JSON array of room identifiers`);
      }
      for (const id of parsed as string[]) closed.add(id);
    }
  }

  function save(): void {
    if (!file) return;
    // Written aside then renamed: a crash never leaves a half-written list.
    const temporary = path.join(path.dirname(file), `.${path.basename(file)}.tmp`);
    fs.writeFileSync(temporary, JSON.stringify([...closed].sort()), { mode: 0o600 });
    fs.renameSync(temporary, file);
  }

  return {
    has: (roomId) => closed.has(roomId),
    set(roomId, value) {
      const before = closed.has(roomId);
      if (value) closed.add(roomId);
      else closed.delete(roomId);
      // Nothing is changed in memory if it cannot be written: the caller gets the error.
      try {
        save();
      } catch (err) {
        if (before) closed.add(roomId);
        else closed.delete(roomId);
        throw err;
      }
    },
  };
}
