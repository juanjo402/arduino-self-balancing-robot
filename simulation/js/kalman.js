/*
 * kalman.js - a line-for-line port of the firmware's KalmanFilter.cpp.
 *
 * Two states, the tilt angle and the gyro bias. The gyro rate is treated as an
 * input and the accelerometer angle as the measurement.
 *
 * This file and firmware/SelfBalancingRobot/KalmanFilter.cpp must stay
 * identical in behaviour. If you change one, change the other, or the simulator
 * stops predicting what the robot does.
 *
 * Derivation and tuning guidance: docs/theory/kalman-filter.md
 */

(function (global) {
  'use strict';

  function KalmanFilter(cfg) {
    this.configure(cfg || { qAngle: 0.001, qBias: 0.003, rMeasure: 0.03 });
    this.reset(0, 0);
  }

  KalmanFilter.prototype.configure = function (cfg) {
    this.qAngle = cfg.qAngle;
    this.qBias = cfg.qBias;
    this.rMeasure = cfg.rMeasure;
  };

  KalmanFilter.prototype.reset = function (angle, bias) {
    this.angle = angle || 0;
    this.bias = bias || 0;
    this.rate = 0;

    /* Certain about the angle because it was just seeded from the
     * accelerometer, uncertain about the bias so it can move quickly at first. */
    this.P = [[0, 0], [0, 0.02]];
  };

  KalmanFilter.prototype.update = function (newAngle, newRate, dt) {
    var P = this.P;

    /* ---- Predict ---- */
    this.rate = newRate - this.bias;
    this.angle += dt * this.rate;

    P[0][0] += dt * (dt * P[1][1] - P[0][1] - P[1][0] + this.qAngle);
    P[0][1] -= dt * P[1][1];
    P[1][0] -= dt * P[1][1];
    P[1][1] += this.qBias * dt;

    /* ---- Update ---- */
    var S = P[0][0] + this.rMeasure;
    var K0 = P[0][0] / S;
    var K1 = P[1][0] / S;

    var y = newAngle - this.angle;

    this.angle += K0 * y;
    this.bias += K1 * y;

    var P00 = P[0][0];
    var P01 = P[0][1];

    P[0][0] -= K0 * P00;
    P[0][1] -= K0 * P01;
    P[1][0] -= K1 * P00;
    P[1][1] -= K1 * P01;

    return this.angle;
  };

  global.KalmanFilter = KalmanFilter;

})(typeof window !== 'undefined' ? window : globalThis);
