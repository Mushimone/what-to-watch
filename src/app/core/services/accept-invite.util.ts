import { AcceptInviteOutcome } from '../models/friend.model';

const KNOWN: AcceptInviteOutcome[] = [
  'ok',
  'invalid',
  'used',
  'expired',
  'self',
  'unauthenticated',
];

/** Map the raw accept_friend_invite RPC response into a typed outcome. */
export function toAcceptOutcome(data: unknown, error: unknown): AcceptInviteOutcome {
  if (error) return 'error';
  return (KNOWN as string[]).includes(data as string) ? (data as AcceptInviteOutcome) : 'error';
}
