/*
 * params.js - the single source of truth for the simulator's defaults.
 *
 * These numbers must match firmware/SelfBalancingRobot/Config.h. When you tune
 * the real robot, change both. The simulator is only a digital twin for as long
 * as the two agree.
 *
 * Everything here attaches to the global object rather than using ES modules,
 * so that index.html works when opened straight from the filesystem with a
 * double click. Browsers block module imports over file:// and it is not worth
 * making people run a web server to look at a simulation.
 */

(function (global) {
  'use strict';

  global.DEFAULT_PARAMS = {

    /* Physical parameters of the robot. See docs/theory/dynamics.md for how to
     * measure each one on a real build. */
    robot: {
      m: 0.85,            /* body mass, excluding wheels, kg               */
      l: 0.105,           /* axle to centre of mass, m                     */
      I: 0.0035,          /* body inertia about its own CoM, kg m^2        */
      r: 0.040,           /* wheel radius, m                               */
      b: 0.001,           /* viscous friction at the axle, N m s / rad     */
      sensorHeight: 0.020 /* IMU height above the axle, m                  */
    },

    /* What the motors can actually do. */
    limits: {
      maxAccel: 8.0,      /* m/s^2, the torque limit in disguise           */
      maxSpeed: 1.26,     /* m/s, from MAX_STEP_RATE in Config.h           */
      maxTilt: 35         /* degrees, past this the robot has fallen       */
    },

    /* Sliding mode controller. */
    smc: {
      cTheta: 9.0,
      cV: 0.55,
      cX: 0.12,
      eta: 8.0,
      K: 3.0,
      phi: 0.05
    },

    /* Cascaded PID, for comparison. */
    pid: {
      kpAngle: 30.0,
      kdAngle: 2.8,
      kiAngle: 40.0,
      kpSpeed: 0.08,
      kiSpeed: 0.05,
      kpPos: 0.15
    },

    kalman: {
      qAngle: 0.001,
      qBias: 0.003,
      rMeasure: 0.03
    },

    /* Simulated MPU-6050. Defaults are in the range a real one gives once it is
     * bolted to a chassis with two stepper motors vibrating it. */
    sensors: {
      enabled: true,        /* off means the controller sees perfect state  */
      accelNoise: 0.25,     /* m/s^2, one standard deviation                */
      gyroNoise: 0.001,     /* rad/s, one standard deviation                */
      gyroBias: 0.03,       /* rad/s, initial offset (about 1.7 deg/s)      */
      gyroBiasDrift: 0.0005,/* rad/s per sqrt(second), the warm-up drift    */

      /* Subtract the robot's own acceleration from the accelerometer before
       * using it as a tilt measurement. Turn it off to watch the estimate
       * slowly walk away and the robot fall over for no visible reason. */
      compensateAccel: true
    },

    sim: {
      physicsHz: 1000,      /* integration rate                             */
      controlHz: 200        /* matches CONTROL_HZ in the firmware           */
    }
  };

  /* Deep copy, so a reset always returns genuinely fresh defaults. */
  global.cloneParams = function (p) {
    return JSON.parse(JSON.stringify(p));
  };

})(typeof window !== 'undefined' ? window : globalThis);
