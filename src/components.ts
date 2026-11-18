import { defineComponents } from '@iwsdk/core';
import { AbyssSphere } from './abyss-component.js';
import { Inspectable, OceanControl, OceanStatus } from './ocean/ocean-components.js';
export default defineComponents([AbyssSphere, OceanStatus, OceanControl, Inspectable]);
