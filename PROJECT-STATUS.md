# Project status

Last updated: 18 September 2026

## What this repository currently is

A **skeleton**. It was generated in a single session from a structured set of questions about
the hardware and the author's preferences, and it exists so that there is something concrete
to argue with rather than a blank folder.

It is a starting point to modify and build on. It is not a finished project, and nothing in
it has been validated against a physical robot.

## What the author decided

These are the inputs that shaped the repository. They were answered before anything was
written, and everything else follows from them.

| Decision | Choice |
|---|---|
| Hardware state | Components bought, nothing assembled |
| Controller | Arduino Mega 2560 with a RAMPS 1.6 shield |
| Drivers and motors | Two DRV8825, module HW-216, driving two NEMA 17 |
| Sensor | MPU-6050 |
| Wireless | ESP-01S, for telemetry, gain tuning and remote driving |
| Estimation | Kalman filter |
| Control | Sliding mode control |
| Firmware layout | Classic Arduino IDE sketch |
| Simulator | Interactive HTML and JavaScript, published on GitHub Pages |
| Simulator scope | Digital twin, controller comparison, visible Kalman filter, disturbance tests |
| Continuous integration | Compile the firmware |
| Chassis | Already designed, STL exists and is to be added |
| Media | Photos in the repository, videos hosted elsewhere |
| Licence | MIT |
| Language | English, so anyone can reproduce it |
| Android app | Tilt-controlled remote over WiFi, specified but not built |

## What the author did not provide

This is the important half, and it is why everything below should be treated as a proposal
rather than as documentation of a working robot.

- **No functional requirements.** How fast it should go, how far it should drive, what it is
  for. The behaviour in the firmware is a reasonable default, not a specification anyone
  agreed to.
- **No review of the code.** Nothing in `firmware/` or `simulation/` has been read line by
  line by the author. It compiles and it passes its own checks; that is a different claim.
- **No measured physical parameters.** The mass, centre of mass height and inertia in
  `Config.h` are estimates for a robot that has not been weighed.
- **No gains from hardware.** Every gain came out of the simulator.
- **No CAD.** The chassis STL exists but has not been added to the repository yet.
- **No hardware validation of anything at all.** No pin has been buzzed out, no motor has
  turned, no angle has been measured.

The author's role so far has been to choose the hardware and set the direction. The
engineering decisions inside that envelope were made without further input, and each of them
is open to being overruled.

## What has actually been verified

Worth separating from what merely exists.

| Claim | Evidence |
|---|---|
| The firmware compiles for the Mega 2560 | `arduino-cli compile --fqbn arduino:avr:mega --warnings all`, no warnings from project files |
| It fits comfortably | 22564 bytes of 253952 flash, 1336 bytes of 8192 RAM |
| The default gains balance the simulated robot | `node tools/sim-check.js`, eight scenarios, both controllers |
| The control law tolerates parameter error | Scenarios include a 250 g unannounced payload, a 40 % mass error and a 25 % centre of mass error |
| The simulator's scripts parse and its interface initialises | Syntax check plus a stubbed-DOM smoke test |
| Internal documentation links resolve | Automated check across all Markdown |

## What has not been verified

| Claim | Why not |
|---|---|
| The robot balances | There is no robot |
| The RAMPS pin map matches the author's board | Clones vary. This needs a multimeter |
| The simulator looks right in a browser | No browser was available in the session that wrote it |
| The step pulse timing satisfies the DRV8825 | Needs an oscilloscope, or at least a motor that turns |
| The accelerometer compensation is necessary on real hardware | It is necessary in simulation. That is strong evidence, not proof |
| Any physical parameter | Nothing has been weighed or measured |

## Known risks in the current skeleton

The places most likely to be wrong, in roughly descending order of how much trouble they
would cause.

1. **The RAMPS pin map.** Standard for RAMPS 1.4 and 1.6, taken from Marlin's assignment,
   but never checked against the board in the author's hands.
2. **The I2C pins.** Pins 20 and 21 sit under the shield and most RAMPS revisions do not
   break them out. If this is not solved before assembly, the robot has to come apart again.
3. **The IMU sign conventions.** `ACCEL_SIGN` and `GYRO_SIGN` are set to `+1` on the
   assumption that the sensor is mounted with Z up and Y forward. A wrong sign makes the
   robot drive itself into the floor at full speed on its first attempt.
4. **`INVERT_DIR_R` is set to 1** on the guess that the right motor faces the other way. It
   is a guess.
5. **`MAX_ACCEL_MPS2 = 8.0`** is an estimate of available torque, not a measurement. Too high
   and the motors stall, which breaks the assumption the whole control design rests on.
6. **The DRV8825 current formula** assumes 0.1 ohm sense resistors. Some modules ship with
   other values and the formula changes.
7. **The ESP-01S on the endstop headers** assumes those headers have no pull-up or filtering
   components fitted.
8. **All six control gains** come from a model whose parameters are estimates.

None of these is a reason not to proceed. They are the list to work through, and phase 0
below is exactly that.

---

# Roadmap

A checklist, ordered so that each phase makes the next one possible. Cheap checks that could
invalidate expensive work come first.

Tick items off in this file as they are done, or copy a phase into an issue and work there.

## Phase 0: check the assumptions

Cheap, and it protects everything after it. An afternoon with a multimeter.

- [ ] Buzz out both stepper sockets against the pin map in [`docs/wiring.md`](docs/wiring.md)
- [ ] Buzz out the Z-min and Z-max endstop headers, and check for fitted pull-ups or RC filtering
- [ ] Determine whether the RAMPS board breaks out I2C. If not, decide how pins 20 and 21 will be reached
- [ ] Read the marking on the DRV8825 sense resistors and confirm the `R100` assumption
- [ ] Confirm the NEMA 17 current rating and body length, and adjust the target Vref
- [ ] Measure the actual wheel diameter under load
- [ ] Correct [`docs/wiring.md`](docs/wiring.md) wherever reality disagrees with it

## Phase 1: electronics on the bench

Everything here happens before a single screw goes into the chassis, because everything here
is much harder afterwards.

- [ ] Upload the firmware and confirm it runs. The LED should blink
- [ ] Get the MPU-6050 answering on I2C. Solve the pin 20 and 21 problem now, permanently
- [ ] Set `IMU_TEST_MODE` to 1 and verify that tilting forward gives a positive angle and a positive rate
- [ ] Fix `ACCEL_SIGN` and `GYRO_SIGN` if needed, and record what was needed
- [ ] Fit the driver heatsinks and set Vref on both channels with a multimeter
- [ ] With the robot held in the air, confirm both motors step smoothly in both directions
- [ ] Fix `INVERT_DIR_L` and `INVERT_DIR_R` if needed
- [ ] Confirm telemetry over USB with `s 1`, and that `d 0.3 0` moves the wheels
- [ ] Confirm the gains survive a reset after `w`

## Phase 2: build the robot

- [ ] Add the chassis STL to [`hardware/stl/`](hardware/stl/)
- [ ] Add the editable CAD source to [`hardware/cad/`](hardware/cad/) if it can be found
- [ ] Print the parts and note what actually worked in [`docs/3d-printing.md`](docs/3d-printing.md)
- [ ] Assemble, following [`docs/assembly.md`](docs/assembly.md) and correcting it as you go
- [ ] Mount the IMU on foam, near the axle, square to the chassis
- [ ] Weigh the robot without its wheels
- [ ] Find the centre of mass height on a straight edge
- [ ] Estimate the inertia, by the swing test or by the uniform-plate approximation
- [ ] Put the measured values into `Config.h` **and** `simulation/js/params.js`
- [ ] Rerun `node tools/sim-check.js` with the real parameters and retune in the simulator if it fails

## Phase 3: first balance

The interesting part, and the part where things break.

- [ ] Clear a space. Carpet if possible. It will fall over
- [ ] Trim `ANGLE_OFFSET_DEG` until the robot stops creeping
- [ ] Get it to stand up at all, for any length of time
- [ ] Capture a telemetry log of the first successful balance and of a failure
- [ ] Write down what went wrong, in [`docs/troubleshooting.md`](docs/troubleshooting.md), while it is fresh

## Phase 4: make it good

- [ ] Work through [`docs/tuning.md`](docs/tuning.md) in order
- [ ] Record the final gains in `Config.h`, in `simulation/js/params.js`, and in this file
- [ ] Test whether the robot still stands after five minutes, not just five seconds
- [ ] **Settle the accelerometer compensation question on hardware.** Run with `COMPENSATE_ACCEL` at 1 and at 0 and record the difference. This is the single most interesting open question in the project, and the simulator says it is decisive
- [ ] Check the driver temperature after a few minutes of balancing
- [ ] Test on a hard floor as well as carpet, and note whether wheel slip is a problem
- [ ] Update the nominal parameters in [`docs/theory/dynamics.md`](docs/theory/dynamics.md) with measured ones

## Phase 5: wireless

- [ ] Wire the ESP-01S with its own 3.3 V regulator, the 470 uF capacitor and the level shifter
- [ ] Confirm the module boots and holds `CH_PD` high
- [ ] Write `firmware/esp01s-bridge/`, following the specification in [`android/docs/protocol.md`](android/docs/protocol.md). A transparent socket-to-serial bridge and nothing else
- [ ] Verify telemetry arrives over WiFi, using a plain TCP client on a laptop before involving a phone
- [ ] Verify that `d` commands drive the robot over WiFi
- [ ] Verify the 500 ms watchdog by cutting the connection while driving
- [ ] Verify gain tuning over WiFi, which is what makes phase 4 pleasant instead of tedious

## Phase 6: the Android app

- [ ] Settle the open decisions in [`android/docs/requirements.md`](android/docs/requirements.md)
- [ ] Create the Android Studio project in [`android/app/`](android/app/)
- [ ] Connection layer, including the Android network binding described in the protocol notes
- [ ] Tilt reading and neutral capture
- [ ] Driving screen with a dead-man control
- [ ] Verify all four directions with the robot held off the ground
- [ ] Tune the dead zone, full tilt and expo by feel, on the floor
- [ ] Telemetry display and the fallen-robot indication

## Phase 7: let other people build one

The point of the repository, and the phase most likely to be skipped.

- [ ] Photograph the build, especially the wiring, before it is all hidden
- [ ] Add `media/photos/hero.jpg` and uncomment the image in the README
- [ ] Record a video, host it externally, link it
- [ ] Reread every document against what actually happened and fix what is wrong
- [ ] Turn on GitHub Pages: Settings, Pages, source "GitHub Actions"
- [ ] Update the bill of materials with what things actually cost
- [ ] Remove the "in progress" notice from the README when it is no longer true

---

## Cross-cutting: review the generated code

Not a phase, because it runs alongside everything else. The firmware and the simulator were
written in one pass and have never been read critically by a person.

- [ ] Read `StepperDrive.cpp`, especially the interrupt and the atomic sections
- [ ] Read `IMU.cpp`, especially the axis conventions and the compensation
- [ ] Check the Kalman filter in C++ against the JavaScript, line by line
- [ ] Check the sliding mode controller in C++ against the JavaScript
- [ ] Confirm `Config.h` and `simulation/js/params.js` still agree
- [ ] Open the simulator in a real browser and check it looks the way it should

## How to record what you find

When a number is measured, change it in the code and note where it came from. When a document
is wrong, fix the document rather than working around it. The value of this repository to
anyone else is entirely in whether its documentation describes a robot that exists.
