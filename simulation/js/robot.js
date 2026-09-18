/*
 * robot.js - one simulated robot: plant, sensors, filter and controller wired
 * together the same way the firmware wires them.
 *
 * The control loop here mirrors SelfBalancingRobot.ino:
 *
 *   read the IMU  ->  Kalman filter  ->  controller  ->  commanded acceleration
 *
 * with the commanded acceleration integrated into a wheel velocity that is
 * clamped to what the motors can do. In the firmware that integrator is an
 * explicit variable; here it is the plant's own axle velocity, which comes to
 * the same thing because a stepper motor turns at the rate it is pulsed.
 *
 * Two of these run side by side when comparing controllers, on identical
 * disturbances, so the only difference between the traces is the control law.
 */

(function (global) {
  'use strict';

  var G = 9.81;
  var MAX_DRIVE_SPEED = 0.6;   /* matches MAX_DRIVE_SPEED_MPS in Config.h */

  function SimRobot(params, controllerKind, label, colour) {
    this.params = params;
    this.kind = controllerKind;
    this.label = label;
    this.colour = colour;

    this.plant = new global.Plant(params.robot);
    this.plant.setLimits(params.limits);

    this.sensors = new global.Sensors(params.sensors);
    this.kalman = new global.KalmanFilter(params.kalman);

    this.buildController();
    this.reset(params.initialTiltDeg || 0);
  }

  SimRobot.prototype.buildController = function () {
    if (this.kind === 'pid') {
      this.controller = new global.PidController(this.params.pid, this.params.limits);
    } else {
      /* The model the controller believes. Normally the same as the plant's,
       * but they are kept separate so that parameter mismatch can be studied:
       * that is the property sliding mode control is supposed to have. */
      var believed = this.params.controllerModel || this.params.robot;
      this.controller = new global.SmcController(
        this.params.smc, believed, this.params.limits);
    }
  };

  SimRobot.prototype.reset = function (tiltDeg) {
    var th0 = (tiltDeg || 0) * Math.PI / 180;

    this.plant.setParams(this.params.robot);
    this.plant.setLimits(this.params.limits);
    this.plant.reset(th0);

    this.sensors.configure(this.params.sensors);
    this.sensors.reset();

    this.kalman.configure(this.params.kalman);

    /*
     * Reproduce IMU::calibrate(): the robot is held still while several hundred
     * gyro samples are averaged, and the filter is seeded with that bias and
     * with the accelerometer's idea of the angle.
     *
     * Skipping this step would make the simulator unfairly hard, because the
     * real firmware does it. It matters: an uncalibrated gyro bias of a couple
     * of degrees per second walks the estimate away fast enough that the robot
     * settles several degrees off vertical and slowly drives itself across the
     * room.
     */
    var dtCtrl = 1 / this.params.sim.controlHz;
    var biasSum = 0;
    var angleSum = 0;
    var n = 400;
    for (var i = 0; i < n; i++) {
      this.sensors.read(this.plant, dtCtrl);
      biasSum += this.sensors.gyroRate;
      angleSum += this.sensors.accelAngle;   /* at rest, so no compensation needed */
    }
    /* Average the accelerometer angle too, not just the gyro. A single reading
     * carries a couple of degrees of noise, and seeding the filter with that
     * error is enough to start the robot drifting: it holds the wrong angle,
     * so it must keep accelerating, so the wheels eventually saturate. */
    this.kalman.reset(angleSum / n, biasSum / n);

    this.controller.reset();

    this.u = 0;
    this.xRef = 0;
    this.appliedAccel = 0;   /* the axle acceleration actually delivered   */
    this.vPrev = 0;          /* previous commanded velocity, for the above */
    this.estTheta = this.kalman.angle;
    this.estOmega = 0;
    this.armed = true;
  };

  /* Push new gains into the controller without disturbing the running state. */
  SimRobot.prototype.applyGains = function () {
    if (this.kind === 'pid') {
      this.controller.setGains(this.params.pid);
    } else {
      this.controller.setGains(this.params.smc);
    }
  };

  /* Tell the controller the plant's current mass properties. Used by the
   * "controller knows about the payload" option, so you can see the difference
   * between a controller that was told and one that was not. */
  SimRobot.prototype.syncModel = function () {
    if (this.kind !== 'pid') {
      this.controller.setModel({
        m: this.plant.m, l: this.plant.l, I: this.plant.I, b: this.plant.b
      });
    }
  };

  SimRobot.prototype.controlStep = function (dt, drive) {
    if (this.plant.fallen) {
      this.u = 0;
      return;
    }

    this.sensors.read(this.plant, dt);

    /*
     * How fast the axle actually changed speed since the last control tick.
     * On the real robot this comes from the firmware's own velocity
     * integrator, after clamping, so it is known exactly and for free.
     */
    this.appliedAccel = (this.plant.v - this.vPrev) / dt;
    this.vPrev = this.plant.v;

    var measuredAngle = this.params.sensors.compensateAccel
      ? this.sensors.compensatedAngle(this.appliedAccel, this.estTheta)
      : this.sensors.accelAngle;

    this.measuredAngle = measuredAngle;
    this.estTheta = this.kalman.update(measuredAngle, this.sensors.gyroRate, dt);
    this.estOmega = this.kalman.rate;

    var vRef = (drive ? drive.forward : 0) * MAX_DRIVE_SPEED;
    this.xRef += vRef * dt;

    var state = {
      theta: this.estTheta,
      omega: this.estOmega,
      x: this.plant.x,
      v: this.plant.v
    };

    this.u = this.controller.update(state, { x: this.xRef, v: vRef }, dt);
  };

  SimRobot.prototype.physicsStep = function (dt, dist) {
    this.plant.step(dt, this.u, dist);
  };

  SimRobot.prototype.surface = function () {
    return (this.kind === 'pid') ? 0 : this.controller.s;
  };

  global.SimRobot = SimRobot;
  global.MAX_DRIVE_SPEED = MAX_DRIVE_SPEED;

})(typeof window !== 'undefined' ? window : globalThis);
