/**
 * @fileoverview Public entry for the conformance runner, so a consumer can run
 * the shared specification against its own adoption if it wants to.
 * @module conformance
 */

export {
  findUncoveredRequirements,
  runCase,
  type ConformanceCase,
  type ConformanceFile,
  type Failure,
} from './runner.js';
