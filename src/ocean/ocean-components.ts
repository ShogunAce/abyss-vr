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
  gesture: { type: Types.String, default: '' },
  handFeatures: { type: Types.String, default: '' },
  discoveries: { type: Types.Int32, default: 0 },
  pulses: { type: Types.Int32, default: 0 },
  revealState: { type: Types.String, default: 'hidden' },
  sharkState: { type: Types.String, default: 'absent' },
  schoolState: { type: Types.String, default: 'schooling' },
  encounter: { type: Types.String, default: 'none' },
  namiLine: { type: Types.String, default: '' },
  sweeps: { type: Types.Int32, default: 0 },
  scatters: { type: Types.Int32, default: 0 },
  eventLog: { type: Types.String, default: '' },
  hovered: { type: Types.String, default: '' },
  sharkMinDistance: { type: Types.Float32, default: 0 },
  markers: { type: Types.Int32, default: 0 },
  menuPage: { type: Types.String, default: 'controls' },
});

// A selectable depth-panel control; `action` uses the same vocabulary as OceanStatus.command.
export const OceanControl = createComponent('OceanControl', {
  action: { type: Types.String, default: '' },
});

// A creature the user can point at and pinch to discover; speciesId keys src/data/species.ts.
export const Inspectable = createComponent('Inspectable', {
  speciesId: { type: Types.String, default: '' },
});
