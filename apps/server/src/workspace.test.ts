import { describe, expect, it } from 'vitest';
import { POSITIONS } from '@qa/engine';
import { PACKAGE_NAME as PROTOCOL } from '@qa/protocol';

describe('scaffold', () => {
  it('server resolves workspace packages', () => {
    expect(POSITIONS).toHaveLength(6);
    expect(PROTOCOL).toBe('@qa/protocol');
  });
});
