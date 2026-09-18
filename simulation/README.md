# Simulator

A digital twin of the robot, in the browser. Same physical parameters, same Kalman filter,
same sliding mode control law as the firmware.

**[Open it online](https://juanjo402.github.io/arduino-self-balancing-robot/)**, or clone the
repository and open `simulation/index.html` by double-clicking it. There is no build step, no
package manager and no server: plain scripts and a canvas, deliberately, so that it still
works in five years and so that anyone can read the code without tooling.

## What it is for

Tuning a balancing robot on the bench is slow and the robot falls over a lot. Tuning it here
costs nothing, and because the model uses your robot's real mass and centre of mass height,
the gains you find transfer.

It is also the fastest way to understand why the design is what it is. Two things are much
easier to see than to explain:

**Turn off accelerometer compensation.** The robot balances happily for a few seconds, then
leans further and further and falls, with nothing visibly wrong. That is the single most
important design detail in the firmware, and the simulator reproduces the failure in six
seconds. The explanation is in [the Kalman notes](../docs/theory/kalman-filter.md).

**Press "Add payload" in compare mode.** Both controllers were tuned for a robot that no
longer exists. Watch which one minds.

## Controls

| | |
|---|---|
| `space` | run or pause |
| `r` | reset |
| `p` | shove the robot |
| arrow keys | drive |

Everything else is on the right-hand panel: controller choice, gains, sensor noise, physical
parameters and disturbances.

When you have gains you like, press **Copy for Config.h** and paste them into the firmware.

## Matching it to your robot

The defaults describe the robot in this repository. Change the mass, centre of mass height
and wheel radius sliders to match yours, or edit the values in
[`js/params.js`](js/params.js) so they persist.

Keep `js/params.js` and [`Config.h`](../firmware/SelfBalancingRobot/Config.h) in step. The
moment they disagree the simulator stops predicting what the robot does, which is worse than
not having one.

## How it is put together

| File | What it does |
|---|---|
| `js/params.js` | All defaults. The single source of truth |
| `js/physics.js` | The plant, from `docs/theory/dynamics.md` |
| `js/sensors.js` | Simulated MPU-6050: noise, gyro bias drift, acceleration coupling |
| `js/kalman.js` | Port of `KalmanFilter.cpp` |
| `js/controllers.js` | Port of `SlidingModeController.cpp`, plus a cascaded PID |
| `js/robot.js` | Wires them together the way the firmware's loop does |
| `js/plot.js` | Scrolling time-series canvas plots |
| `js/render.js` | Side view of the robot |
| `js/main.js` | The application: loop, controls, export |

Physics runs at 1 kHz and the controller at 200 Hz, both decoupled from the browser's frame
rate. Stepping the physics by however long the last frame took would make the result depend
on the machine it is running on, which for a tuning tool is worse than useless.

The sensor model deserves a mention. It is easy to write a simulation that feeds the
controller the exact state, and such a simulation will happily validate gains that fall over
on the bench. This one makes the controller work from a noisy accelerometer that is
corrupted by the robot's own motion and a gyroscope whose bias drifts, which is what the real
one has to do.

## Checking gains without a browser

```
node tools/sim-check.js
```

Runs eight scenarios against both controllers, headless and deterministic, and prints a pass
or fail table. Useful for telling in one second whether a gain change helped.

## Licence

MIT, same as the rest of the repository.
