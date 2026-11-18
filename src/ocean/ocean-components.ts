import { createComponent, Types } from '@iwsdk/core';

// Read-only mirror of the Ocean Director for diagnostics and automated tests.
// `command` is a debug input: OceanSystem consumes and clears it
// (depth:<0..1>, release, pause, resume, reset, reduced:on|off).
export const OceanStatus = createComponent('OceanStatus', {
  depth: { type: Types.Float32, default: 0.15 },
  targetDepth: { type: Types.Float32, default: 0.15 },
  band: { type: Types.String, default: 'sunlit' },
  depthLocked: { type: Types.Boolean, default: false },
  paused: { type: Types.Boolean, default: false },
  reducedMotion: { type: Types.Boolean, default: false },
  ambientLight: { type: Types.Float32, default: 1 },
  interactionMode: { type: Types.String, default: 'world' },
  travelX: { type: Types.Float32, default: 0 },
  travelZ: { type: Types.Float32, default: 0 },
  oceanInstances: { type: Types.Int32, default: 1 },
  panelVisible: { type: Types.Boolean, default: false },
  lastEvent: { type: Types.String, default: 'None' },
  command: { type: Types.String, default: '' },
});

// A selectable depth-panel control; `action` uses the same vocabulary as OceanStatus.command.
export const OceanControl = createComponent('OceanControl', {
  action: { type: Types.String, default: '' },
});
