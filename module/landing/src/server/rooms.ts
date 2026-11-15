import * as crypto from 'node:crypto';
import { ROOM_ID_RE } from '../shared/slug.js';
import type { RoomKey } from '../shared/api.js';

// Le droit de modération voyage dans un lien secret, utilisable depuis n'importe quel appareil
// et n'importe quand :
//  - à la création, le navigateur obtient une clé aléatoire (`mod`, 128 bits) ;
//  - l'identifiant du salon est « nom-empreinte », l'empreinte (12 caractères) étant un HMAC de
//    la clé avec le secret du serveur : publique, mais impossible à fabriquer ou à inverser sans
//    ce secret ;
//  - est modérateur quiconque présente une clé dont l'empreinte est celle du salon (lien de
//    modérateur `/r/<salon>?m=<clé>`), quel que soit l'ordre d'arrivée et que le salon existe
//    déjà ou non.
// Aucun état n'est stocké côté serveur : un lien reste valable des mois.

const TAG_LENGTH = 12;

export interface RoomKeys {
  /** Empreinte publique d'une clé de modérateur. */
  tagOf(mod: string): string;
  newKey(): RoomKey;
}

export function createRoomKeys(secret: string): RoomKeys {
  const tagOf = (mod: string): string =>
    crypto.createHmac('sha256', secret).update(`owner-tag|${mod}`).digest('hex').slice(0, TAG_LENGTH);

  return {
    tagOf,
    newKey() {
      const mod = crypto.randomBytes(16).toString('hex');
      return { mod, tag: tagOf(mod) };
    },
  };
}

/** Nom lisible d'un identifiant de salon (sans l'empreinte). */
export function roomLabel(roomId: string): string {
  return ROOM_ID_RE.exec(roomId)?.[1] ?? roomId;
}
