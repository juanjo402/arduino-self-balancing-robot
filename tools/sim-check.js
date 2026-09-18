#!/usr/bin/env node
/*
 * sim-check.js - headless check that the default gains actually balance.
 *
 * Runs the simulator's physics, sensors, Kalman filter and both controllers
 * without a browser, and reports whether each one survives a set of scenarios.
 * Useful for two things: confirming the numbers in Config.h are not fiction
 * before anyone builds a robot around them, and telling you quickly whether a
 * gain change made things better or worse.
 *
 * Usage:   node tools/sim-check.js
 * Exits non-zero if any scenario fails.
 */

'use strict';

const path = require('path');
const JS = path.join(__dirname, '..', 'simulation', 'js');

require(path.join(JS, 'params.js'));
require(path.join(JS, 'physics.js'));
require(path.join(JS, 'sensors.js'));
require(path.join(JS, 'kalman.js'));
require(path.join(JS, 'controllers.js'));
require(path.join(JS, 'robot.js'));

/* Deterministic pseudo-random, so a failure can be reproduced exactly. */
let seed = 12345;
Math.random = function () {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

function runScenario(kind, opts) {
  seed = 12345;   /* same noise sequence for every scenario and controller */

  const params = cloneParams(DEFAULT_PARAMS);
  /* The controller always believes the nominal robot. Scenarios that change
   * the plant are therefore genuine parameter mismatch, not a controller that
   * was quietly handed the right answer. */
  params.controllerModel = cloneParams(DEFAULT_PARAMS).robot;
  if (opts.tuneParams) opts.tuneParams(params);

  const robot = new SimRobot(params, kind, kind, '#000');
  robot.reset(opts.initialTiltDeg || 0);

  const dtPhys = 1 / params.sim.physicsHz;
  const dtCtrl = 1 / params.sim.controlHz;
  const substeps = Math.round(params.sim.physicsHz / params.sim.controlHz);
  const ticks = Math.round(opts.duration * params.sim.controlHz);

  let maxTilt = 0;
  let settleTick = -1;
  let maxAbsPos = 0;
  const lateStart = Math.round(ticks * 0.7);
  let lateTiltSum = 0, lateTiltCount = 0, latePosSum = 0;

  for (let tick = 0; tick < ticks; tick++) {
    const t = tick * dtCtrl;
    const dist = { torque: 0, baseAccel: 0 };
    const drive = { forward: 0, turn: 0 };

    if (opts.event) opts.event(t, robot, dist, drive);

    robot.controlStep(dtCtrl, drive);
    for (let i = 0; i < substeps; i++) robot.physicsStep(dtPhys, dist);

    const tiltDeg = Math.abs(robot.plant.theta) * 180 / Math.PI;
    if (tiltDeg > maxTilt) maxTilt = tiltDeg;
    if (Math.abs(robot.plant.x) > maxAbsPos) maxAbsPos = Math.abs(robot.plant.x);

    if (settleTick < 0 && tick > 20 && tiltDeg < 1.0) settleTick = tick;

    if (tick >= lateStart) {
      lateTiltSum += tiltDeg;
      latePosSum += Math.abs(robot.plant.x);
      lateTiltCount++;
    }

    if (robot.plant.fallen) {
      return { ok: false, reason: `fell at t=${t.toFixed(2)}s`, maxTilt };
    }
  }

  const meanLateTilt = lateTiltSum / lateTiltCount;
  const meanLatePos = latePosSum / lateTiltCount;

  return {
    ok: meanLateTilt < (opts.maxSteadyTiltDeg || 3.0),
    reason: meanLateTilt >= (opts.maxSteadyTiltDeg || 3.0)
      ? `still leaning ${meanLateTilt.toFixed(2)} deg at the end` : '',
    maxTilt,
    meanLateTilt,
    meanLatePos,
    maxAbsPos,
    settleS: settleTick < 0 ? null : settleTick / params.sim.controlHz
  };
}

const scenarios = [
  {
    name: 'release from 5 degrees',
    duration: 6,
    initialTiltDeg: 5
  },
  {
    name: 'release from 12 degrees',
    duration: 6,
    initialTiltDeg: 12
  },
  {
    name: 'shove at t=2s',
    duration: 8,
    initialTiltDeg: 0,
    event: (t, r, dist) => {
      if (t >= 2.0 && t < 2.08) dist.torque = 0.55;
    }
  },
  {
    name: 'drive forward from t=2s to t=5s',
    duration: 8,
    initialTiltDeg: 0,
    maxSteadyTiltDeg: 4.0,
    event: (t, r, dist, drive) => {
      if (t >= 2.0 && t < 5.0) drive.forward = 0.7;
    }
  },
  {
    name: 'slope disturbance, 6 degrees',
    duration: 8,
    initialTiltDeg: 0,
    event: (t, r, dist) => {
      if (t >= 2.0) dist.baseAccel = -9.81 * Math.sin(6 * Math.PI / 180);
    }
  },
  {
    name: '250 g payload added 18 cm up at t=3s, controller not told',
    duration: 9,
    initialTiltDeg: 0,
    event: (t, r) => {
      if (!r._loaded && t >= 3.0) { r.plant.addPayload(0.25, 0.18); r._loaded = true; }
    }
  },
  {
    name: 'centre of mass 25 % lower than the controller believes',
    duration: 6,
    initialTiltDeg: 5,
    tuneParams: (p) => { p.robot.l = 0.105 * 0.75; }
  },
  {
    name: 'body 40 % heavier than the controller believes',
    duration: 6,
    initialTiltDeg: 5,
    tuneParams: (p) => { p.robot.m = 0.85 * 1.4; }
  }
];

let failures = 0;
const kinds = ['smc', 'pid'];

console.log('');
console.log('scenario                                                    smc        pid');
console.log('--------------------------------------------------------------------------');

for (const sc of scenarios) {
  const cells = [];
  for (const kind of kinds) {
    /* tuneParams changes the PLANT but the controller is built from the same
     * params object, so for the mismatch scenarios the controller is rebuilt
     * from the nominal values afterwards. */
    const result = runScenario(kind, sc);

    if (!result.ok) failures++;
    cells.push(result.ok
      ? `ok ${result.maxTilt.toFixed(1)}deg`.padEnd(10)
      : `FAIL`.padEnd(10));
  }
  console.log(sc.name.padEnd(58) + cells.join(' '));
}

console.log('--------------------------------------------------------------------------');
console.log(failures === 0
  ? 'all scenarios balanced'
  : `${failures} scenario/controller combinations failed`);
console.log('');

process.exit(failures === 0 ? 0 : 1);
