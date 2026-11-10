import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('scaffold', () => {
  it('protocol package loads', () => {
    expect(PACKAGE_NAME).toBe('@qa/protocol');
  });
});
