import { describe, it, expect } from 'vitest';
import { toAcceptOutcome } from './accept-invite.util';

describe('toAcceptOutcome', () => {
  it('passes through known status strings', () => {
    expect(toAcceptOutcome('ok', null)).toBe('ok');
    expect(toAcceptOutcome('expired', null)).toBe('expired');
    expect(toAcceptOutcome('self', null)).toBe('self');
  });

  it('returns "error" when the RPC errored', () => {
    expect(toAcceptOutcome('ok', { message: 'boom' })).toBe('error');
  });

  it('returns "error" for unrecognised data', () => {
    expect(toAcceptOutcome('weird', null)).toBe('error');
    expect(toAcceptOutcome(null, null)).toBe('error');
  });
});
