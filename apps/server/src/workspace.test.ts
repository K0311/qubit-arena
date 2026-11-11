import { describe, expect, it } from 'vitest';
import { POSITIONS } from '@qa/engine';
import { parseClientMessage, PROTOCOL_VERSION } from '@qa/protocol';

describe('scaffold', () => {
  it('server resolves workspace packages', () => {
    expect(POSITIONS).toHaveLength(6);
    expect(PROTOCOL_VERSION).toBe(1);
    expect(parseClientMessage('{"type":"PING","t":1}').ok).toBe(true);
  });
});
