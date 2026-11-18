import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClosedRooms } from './closed-rooms';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'palabre-closed-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('createClosedRooms', () => {
  it('closes and reopens, in memory when there is no file', () => {
    const closed = createClosedRooms(undefined);
    closed.set('a-0123456789ab', true);
    expect(closed.has('a-0123456789ab')).toBe(true);
    closed.set('a-0123456789ab', false);
    expect(closed.has('a-0123456789ab')).toBe(false);
  });

  it('remembers across instances, and starts empty without a file yet', () => {
    const file = path.join(dir, 'closed.json');
    expect(createClosedRooms(file).has('a')).toBe(false);
    createClosedRooms(file).set('a', true);
    expect(createClosedRooms(file).has('a')).toBe(true);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it('refuses to start from a file it cannot read, rather than reopening every room', () => {
    const file = path.join(dir, 'closed.json');
    fs.writeFileSync(file, '{not json');
    expect(() => createClosedRooms(file)).toThrow();
    fs.writeFileSync(file, '{"a":1}');
    expect(() => createClosedRooms(file)).toThrow(/array/);
  });

  it('does not pretend a room is closed when the list cannot be written', () => {
    const closed = createClosedRooms(path.join(dir, 'absent', 'closed.json'));
    expect(() => closed.set('a', true)).toThrow();
    expect(closed.has('a')).toBe(false);
  });
});
