import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME as ENGINE } from '@qa/engine';
import { PACKAGE_NAME as PROTOCOL } from '@qa/protocol';

describe('scaffold', () => {
  it('server resolves workspace packages', () => {
    expect(ENGINE).toBe('@qa/engine');
    expect(PROTOCOL).toBe('@qa/protocol');
  });
});
