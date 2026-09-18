/*
 * controllers.js - the sliding mode controller, and a cascaded PID to compare
 * it against.
 *
 * The sliding mode controller is a port of the firmware's
 * SlidingModeController.cpp and must stay behaviourally identical to it.
 *
 * The PID is here as a reference point, not as a straw man. It is a competent
 * cascaded design of the kind that balances plenty of real robots, tuned for
 * the same nominal parameters. The interesting comparison is not which one
 * balances on a perfect model, because both do. It is what happens when you
 * press "add payload" and the model stops being right.
 *
 * Both take the same inputs and return a commanded axle acceleration in m/s^2.
 */

(function (global) {
  'use strict';

  var G = 9.81;
  var MIN_ABS_GS = 0.5;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function saturate(z) { return clamp(z, -1, 1); }

  /* ------------------------------------------------------------------ */
  /* Sliding mode                                                       */
  /* ------------------------------------------------------------------ */

  function SmcController(gains, model, limits) {
    this.name = 'Sliding mode';
    this.setGains(gains);
    this.setModel(model);
    this.maxAccel = limits.maxAccel;
    this.reset();
  }

  /*
   * The model the controller BELIEVES, which is not necessarily the model the
   * plant uses. Keeping them separate is the whole point: leaving these at the
   * nominal values while the plant changes is how you see the robustness the
   * design is supposed to have.
   */
  SmcController.prototype.setModel = function (p) {
    this.J = p.I + p.m * p.l * p.l;
    this.mglOverJ = (p.m * G * p.l) / this.J;
    this.mlOverJ = (p.m * p.l) / this.J;
    this.bOverJ = p.b / this.J;
  };

  SmcController.prototype.setGains = function (g) {
    this.g = {
      cTheta: g.cTheta, cV: g.cV, cX: g.cX,
      eta: g.eta, K: g.K, phi: Math.max(g.phi, 1e-4)
    };
  };

  SmcController.prototype.reset = function () {
    this.s = 0;
  };

  SmcController.prototype.update = function (st, ref) {
    var g = this.g;

    var eX = st.x - ref.x;
    var eV = st.v - ref.v;

    this.s = st.omega
           + g.cTheta * st.theta
           + g.cV * eV
           + g.cX * eX;

    var sinT = Math.sin(st.theta);
    var cosT = Math.cos(st.theta);

    var f = g.cTheta * st.omega
          + g.cX * eV
          + this.mglOverJ * sinT
          - this.bOverJ * st.omega;

    var gs = g.cV - this.mlOverJ * cosT;
    if (Math.abs(gs) < MIN_ABS_GS) gs = gs < 0 ? -MIN_ABS_GS : MIN_ABS_GS;

    var reaching = g.eta * this.s + g.K * saturate(this.s / g.phi);
    var u = (-f - reaching) / gs;

    return clamp(u, -this.maxAccel, this.maxAccel);
  };

  /* ------------------------------------------------------------------ */
  /* Cascaded PID                                                       */
  /* ------------------------------------------------------------------ */
  /*
   * Outer loop: position and speed errors set a target lean angle.
   * Inner loop: a PD on the angle error produces the acceleration.
   *
   * Leaning forward makes the robot accelerate forward, so to speed up it must
   * first lean, which is why the outer loop has to be much slower than the
   * inner one. Running them at similar bandwidths is the classic way to get a
   * balancing robot that oscillates and cannot be tuned out of it.
   */

  function PidController(gains, limits) {
    this.name = 'Cascaded PID';
    this.setGains(gains);
    this.maxAccel = limits.maxAccel;
    this.maxLean = 0.20;   /* rad, about 11 degrees */
    this.reset();
  }

  PidController.prototype.setGains = function (g) {
    this.g = {
      kpAngle: g.kpAngle, kdAngle: g.kdAngle, kiAngle: g.kiAngle,
      kpSpeed: g.kpSpeed, kiSpeed: g.kiSpeed, kpPos: g.kpPos
    };
  };

  PidController.prototype.reset = function () {
    this.angleIntegral = 0;
    this.speedIntegral = 0;
    this.thetaRef = 0;
  };

  PidController.prototype.update = function (st, ref, dt) {
    var g = this.g;

    /* Outer loop. */
    var vErr = ref.v - st.v;
    var xErr = ref.x - st.x;

    this.speedIntegral += vErr * dt;
    this.speedIntegral = clamp(this.speedIntegral, -3, 3);

    this.thetaRef = clamp(
      g.kpSpeed * vErr + g.kiSpeed * this.speedIntegral + g.kpPos * xErr,
      -this.maxLean, this.maxLean);

    /* Inner loop. */
    var aErr = st.theta - this.thetaRef;
    this.angleIntegral += aErr * dt;
    this.angleIntegral = clamp(this.angleIntegral, -0.5, 0.5);

    var u = g.kpAngle * aErr
          + g.kdAngle * st.omega
          + g.kiAngle * this.angleIntegral;

    return clamp(u, -this.maxAccel, this.maxAccel);
  };

  global.SmcController = SmcController;
  global.PidController = PidController;

})(typeof window !== 'undefined' ? window : globalThis);
