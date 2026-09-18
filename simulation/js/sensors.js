/*
 * sensors.js - a simulated MPU-6050.
 *
 * The point of this file is to make the controller's life realistically hard.
 * Feeding a controller the exact state is the most common way a simulation
 * lies: it will happily stabilise gains that fall over on the bench, because
 * the real robot never sees the true angle, only what the sensors report.
 *
 * Two effects matter and both are modelled properly here.
 *
 * The accelerometer does not measure tilt. It measures specific force, which is
 * gravity plus whatever the robot is doing. Accelerating the wheels produces a
 * reading that looks exactly like a tilt, and mounting the sensor above the
 * axle adds the tangential acceleration of the body swinging. That is why the
 * accelerometer alone is useless here and why the Kalman filter exists.
 *
 * The gyroscope has a bias that drifts. Integrating a biased rate gives an
 * angle that walks away, and on a real robot the bias moves as the stepper
 * drivers warm the chassis up.
 */

(function (global) {
  'use strict';

  var G = 9.81;

  function Sensors(cfg) {
    this.configure(cfg);
    this.reset();
  }

  Sensors.prototype.configure = function (cfg) {
    this.enabled = cfg.enabled;
    this.accelNoise = cfg.accelNoise;
    this.gyroNoise = cfg.gyroNoise;
    this.initialBias = cfg.gyroBias;
    this.biasDrift = cfg.gyroBiasDrift;
  };

  Sensors.prototype.reset = function () {
    this.bias = this.initialBias;
    this.accelAngle = 0;
    this.gyroRate = 0;
  };

  /*
   * Produce one reading from the true state of the plant.
   *
   * sensorHeight is the distance from the axle up to the IMU, which sets how
   * much of the body's angular acceleration leaks into the accelerometer.
   */
  Sensors.prototype.read = function (plant, dt) {
    var th = plant.theta;
    var sinT = Math.sin(th);
    var cosT = Math.cos(th);

    if (!this.enabled) {
      this.accelAngle = th;
      this.gyroRate = plant.omega;
      this.fBodyY = -9.81 * sinT;
      this.fBodyZ = 9.81 * cosT;
      return;
    }

    /*
     * Specific force at the sensor, in world coordinates.
     * Body "up" is (0, sin th, cos th) with Y forward and Z up, so the sensor
     * sits at d * that vector from the axle. Differentiating twice gives the
     * tangential and centripetal terms.
     */
    var d = plant.sensorHeight;
    var ay = plant.accel + d * (plant.alpha * cosT - plant.omega * plant.omega * sinT);
    var az = G + d * (-plant.alpha * sinT - plant.omega * plant.omega * cosT);

    /* Rotate into the body frame. */
    var fBodyY = ay * cosT - az * sinT;
    var fBodyZ = ay * sinT + az * cosT;

    fBodyY += gaussian() * this.accelNoise;
    fBodyZ += gaussian() * this.accelNoise;

    /* The two body-frame components are kept, not just the angle, because the
     * compensation in IMU::update needs them before the arctangent. */
    this.fBodyY = fBodyY;
    this.fBodyZ = fBodyZ;

    /* Exactly the expression the firmware uses in IMU.cpp. */
    this.accelAngle = Math.atan2(-fBodyY, fBodyZ);

    /* Gyro: true rate, plus a bias that random-walks, plus white noise. */
    this.bias += gaussian() * this.biasDrift * Math.sqrt(dt);
    this.gyroRate = plant.omega + this.bias + gaussian() * this.gyroNoise;
  };

  /*
   * Remove the robot's own linear acceleration from the reading.
   *
   * This matters more than it looks. When the robot holds a lean of theta it
   * must accelerate at roughly g*tan(theta) to stay there, and that
   * acceleration appears in the accelerometer as a tilt of exactly the opposite
   * sign. The two cancel: a balancing robot holding a steady lean reads ZERO
   * tilt on its accelerometer, whatever the lean actually is.
   *
   * That makes the accelerometer blind to precisely the thing it is there to
   * measure, the filter loses its only absolute reference, and the estimate
   * quietly walks away until the robot falls over minutes later for no visible
   * reason.
   *
   * The fix is available for free on a stepper robot: the firmware commands the
   * wheel speed, so it knows its own acceleration exactly. Subtracting that
   * known component before taking the arctangent restores the gravity vector,
   * and with it the filter's reference.
   *
   *   aKnown   - the axle acceleration actually applied, m/s^2
   *   thetaEst - the current angle estimate, used to rotate aKnown into the
   *              body frame. A rough value is enough.
   */
  Sensors.prototype.compensatedAngle = function (aKnown, thetaEst) {
    var fy = this.fBodyY - aKnown * Math.cos(thetaEst);
    var fz = this.fBodyZ - aKnown * Math.sin(thetaEst);
    return Math.atan2(-fy, fz);
  };

  /* Box-Muller. Math.random is uniform and summing twelve of them would be the
   * lazy version; this one is exact and costs nothing at 200 Hz. */
  function gaussian() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  global.Sensors = Sensors;

})(typeof window !== 'undefined' ? window : globalThis);
