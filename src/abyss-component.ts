import { createComponent, Types } from '@iwsdk/core';
export const AbyssSphere = createComponent('AbyssSphere', {
  interactions: { type: Types.Int32, default: 0 },
  lastEvent: { type: Types.String, default: 'None' },
  pulse: { type: Types.Float32, default: 0 },
  immersion: { type: Types.Float32, default: 0 },
  destination: { type: Types.String, default: 'room' },
  phase: { type: Types.String, default: 'room' },
});
