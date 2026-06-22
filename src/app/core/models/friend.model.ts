export interface FriendInvite {
  token: string;
  inviter_id: string;
  created_at: string;
  expires_at: string;
  accepted_by: string | null;
}

/** Result of accept_friend_invite — mirrors the RPC's return strings. */
export type AcceptInviteOutcome =
  | 'ok'
  | 'invalid'
  | 'used'
  | 'expired'
  | 'self'
  | 'unauthenticated'
  | 'error';
