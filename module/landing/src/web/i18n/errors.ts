import { ApiFailure } from '../api';
import type { Messages } from './fr';

/** Message of an API error, in the visitor's language. */
export function errorMessage(t: Messages, error: unknown): string {
  if (!(error instanceof ApiFailure)) return t.errors.network;
  if (error.code === 'network') return t.errors.network;
  const message = t.errors[error.code];
  return error.code === 'plugnmeet_failed' && error.detail ? `${message} : ${error.detail}` : message;
}
