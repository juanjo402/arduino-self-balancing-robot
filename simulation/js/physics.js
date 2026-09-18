/*
 * physics.js - the plant.
 *
 * Implements the model derived in docs/theory/dynamics.md:
 *
 *     (I + m l^2) theta_ddot = m g l sin(theta)
 *                            - m l a cos(theta)
 *                            - b theta_dot
 *                            + tau_disturbance
 *
 * where 'a' is the acceleration of the wheel axle, which is the control input
 * because stepper motors behave as a velocity source rather than a torque
 * source.
 *
 * Integrated with semi-implicit Euler at 1 kHz. At that step size, for a system
 * whose fastest mode is around 10 rad/s, the integration error is far below
 * everything else that is approximate about this model.
 */

(function (global) {
  'use strict';

  var G = 9.81;

  function Plant(params) {
    this.setParams(params);
    this.reset();
  }

  Plant.prototype.setParams = function (p) {
    this.m = p.m;
    this.l = p.l;
    this.I = p.I;
    this.r = p.r;
    this.b = p.b;
    this.sensorHeight = p.sensorHeight;
    this.J = this.I + this.m * this.l * this.l;
  };

  Plant.prototype.setLimits = function (limits) {
    this.maxAccel = limits.maxAccel;
    this.maxSpeed = limits.maxSpeed;
    this.maxTiltRad = limits.maxTilt * Math.PI / 180;
  };

  Plant.prototype.reset = function (theta0) {
    this.x = 0;              /* axle position, m            */
    this.v = 0;              /* axle velocity, m/s          */
    this.theta = theta0 || 0;/* tilt from vertical, rad     */
    this.omega = 0;          /* tilt rate, rad/s            */
    this.accel = 0;          /* actual axle acceleration    */
    this.alpha = 0;          /* actual angular acceleration */
    this.fallen = false;
    this.t = 0;
  };

  /*
   * One integration step.
   *
   *   aCmd  - commanded axle acceleration, m/s^2
   *   dist  - { torque, baseAccel } disturbances, both optional
   *
   * Returns nothing; read the state off the object.
   */
  Plant.prototype.step = function (dt, aCmd, dist) {
    var distTorque = (dist && dist.torque) || 0;
    var distAccel = (dist && dist.baseAccel) || 0;

    if (this.fallen) {
      /* Motors are cut once the robot is past recovery, so the wheels just
       * coast to a stop and the body swings freely. */
      aCmd = 0;
      this.v *= 0.98;
    }

    /* The motors cannot deliver more than this. Asking for more is the same as
     * asking for what they have. */
    var a = clamp(aCmd, -this.maxAccel, this.maxAccel) + distAccel;

    /* Apply the speed limit to the axle, then work out what acceleration the
     * axle ACTUALLY experienced. This matters: once the wheels are saturated
     * the body stops receiving the pseudo-force it is relying on, which is
     * exactly how a real balancing robot falls when it runs out of speed. */
    var vNew = clamp(this.v + a * dt, -this.maxSpeed, this.maxSpeed);
    var aActual = (vNew - this.v) / dt;

    var sinT = Math.sin(this.theta);
    var cosT = Math.cos(this.theta);

    this.alpha = (this.m * G * this.l * sinT
                - this.m * this.l * aActual * cosT
                - this.b * this.omega
                + distTorque) / this.J;

    this.omega += this.alpha * dt;
    this.theta += this.omega * dt;

    this.v = vNew;
    this.x += this.v * dt;
    this.accel = aActual;
    this.t += dt;

    if (Math.abs(this.theta) > this.maxTiltRad) {
      this.fallen = true;
    }

    /* Stop the body passing through the floor once it is down. */
    var floor = Math.PI / 2 - 0.05;
    if (this.theta > floor) { this.theta = floor; this.omega = Math.min(0, this.omega); }
    if (this.theta < -floor) { this.theta = -floor; this.omega = Math.max(0, this.omega); }
  };

  /* Change mass properties mid-run, which is what the payload button does. The
   * robustness of sliding mode control to exactly this is the reason it was
   * chosen for the firmware, so being able to do it live is the point. */
  Plant.prototype.addPayload = function (massKg, heightM) {
    var totalM = this.m + massKg;
    var newL = (this.m * this.l + massKg * heightM) / totalM;

    /* Parallel axis theorem for both parts about the new centre of mass. */
    var dBody = this.l - newL;
    var dLoad = heightM - newL;
    this.I = this.I + this.m * dBody * dBody + massKg * dLoad * dLoad;

    this.m = totalM;
    this.l = newL;
    this.J = this.I + this.m * this.l * this.l;
  };

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  global.Plant = Plant;
  global.clampValue = clamp;

})(typeof window !== 'undefined' ? window : globalThis);
