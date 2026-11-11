import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import type {
  BallPosition,
  CardKind,
  EndReason,
  ErrorCode as EngineErrorCode,
  Mode,
  Phase,
  PlayerId,
  Position,
  Side,
  Winner,
} from '@qa/engine';
import {
  ballPositionSchema,
  cardKindSchema,
  endReasonSchema,
  engineErrorCodeSchema,
  modeSchema,
  phaseSchema,
  positionSchema,
  seatSchema,
  sideSchema,
  winnerSchema,
} from '../src/index';

// Compile-time guard: these value lists are copied from @qa/engine, so typecheck fails
// (both ways) if the engine adds or removes a value and the protocol is not updated.
describe('protocol enums match the engine types exactly', () => {
  it('compiles', () => {
    expectTypeOf<z.infer<typeof modeSchema>>().toEqualTypeOf<Mode>();
    expectTypeOf<z.infer<typeof sideSchema>>().toEqualTypeOf<Side>();
    expectTypeOf<z.infer<typeof seatSchema>>().toEqualTypeOf<PlayerId>();
    expectTypeOf<z.infer<typeof cardKindSchema>>().toEqualTypeOf<CardKind>();
    expectTypeOf<z.infer<typeof positionSchema>>().toEqualTypeOf<Position>();
    expectTypeOf<z.infer<typeof ballPositionSchema>>().toEqualTypeOf<BallPosition>();
    expectTypeOf<z.infer<typeof phaseSchema>>().toEqualTypeOf<Phase>();
    expectTypeOf<z.infer<typeof endReasonSchema>>().toEqualTypeOf<EndReason>();
    expectTypeOf<z.infer<typeof winnerSchema>>().toEqualTypeOf<Winner>();
    expectTypeOf<z.infer<typeof engineErrorCodeSchema>>().toEqualTypeOf<EngineErrorCode>();
  });
});
