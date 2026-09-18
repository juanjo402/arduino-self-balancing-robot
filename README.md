# Arduino Self-Balancing Robot

A two-wheeled inverted-pendulum robot built on an Arduino Mega 2560 with a RAMPS 1.6
shield, NEMA 17 stepper motors and an MPU-6050 IMU. The tilt angle is estimated with a
**Kalman filter** and the robot is stabilised by a **sliding mode controller (SMC)**.

Everything you need to rebuild it is in this repository: the bill of materials, the wiring
map, the printable chassis, the firmware, and a browser-based simulator that models the
real robot so you can tune the controller before you ever switch the motors on.

> **Project status: skeleton, nothing built yet.** The parts are bought and the chassis is
> designed, but no robot has been assembled and nothing here has been tested on hardware. The
> firmware compiles and implements the full control chain; the gains in
> [`Config.h`](firmware/SelfBalancingRobot/Config.h) come from simulation, not from a robot.
> [**PROJECT-STATUS.md**](PROJECT-STATUS.md) says exactly what is verified, what is not, and
> what the plan is.

<!--
  Once the robot is built, drop a photo in media/photos/hero.jpg and uncomment this.
  It is left commented out so the front page does not show a broken image until then.

<p align="center">
  <img src="media/photos/hero.jpg" alt="The assembled self-balancing robot" width="480">
</p>
-->

---

## Try the simulator

The simulator is a digital twin: it uses the same mass, centre-of-mass height and wheel
radius as the physical robot, and runs the same Kalman filter and sliding mode control law
as the firmware. Tune there first, then copy the gains into `Config.h`.

**[Open the simulator](https://juanjo402.github.io/arduino-self-balancing-robot/)** — no
installation, runs in any browser.

It lets you:

- Compare sliding mode control against a classic cascaded PID, side by side on the same plot.
- Watch the Kalman filter fuse a noisy accelerometer with a drifting gyroscope, against the
  true angle the simulation knows but the controller does not.
- Push the robot, tilt the floor, or add a payload, and see how each controller recovers.
- Change the physical parameters to match *your* build if it differs from mine.

To run it locally instead, see [`simulation/README.md`](simulation/README.md).

---

## How it works

The robot is an inverted pendulum: left alone it falls over, so the wheels must be driven
underneath the centre of mass to keep it up. Three pieces do the work.

**Sensing.** The MPU-6050 gives a noisy accelerometer reading that is correct on average but
useless during acceleration, and a gyroscope that is smooth in the short term but drifts.
A two-state Kalman filter fuses them into a tilt angle and a live estimate of the gyro bias.

That standard recipe is not enough on its own, and the reason is the most interesting thing
in this project. To hold a lean the robot must accelerate at roughly `g*tan(theta)`, and that
acceleration appears in the accelerometer as an apparent tilt of exactly the opposite sign.
The two cancel: **a balancing robot holding a steady lean reads zero tilt on its
accelerometer.** The filter loses its only absolute reference and the estimate quietly walks
away until the robot falls over with nothing visibly wrong. The firmware subtracts its own
known acceleration before reading tilt, which on a stepper robot is free because the wheel
speed is commanded rather than measured. In simulation that one term is the difference
between falling after six seconds and standing for two minutes.
[Read the derivation](docs/theory/kalman-filter.md).

**Control.** A sliding mode controller drives the robot onto a sliding surface that mixes
tilt angle, tilt rate, wheel position and wheel speed. Once on that surface the dynamics are
stable regardless of the exact mass or friction, which is what makes SMC attractive for a
hand-built robot whose parameters are only roughly known. A boundary layer replaces the
discontinuous switching term so the motors do not chatter.
[Read the derivation](docs/theory/sliding-mode-control.md).

**Actuation.** Stepper motors are commanded as a velocity source. A Timer1 interrupt running
at 20 kHz generates the STEP pulses from a phase accumulator, so the control loop only has to
write a target step rate. Steppers avoid the backlash and dead zone of cheap DC gearmotors,
at the cost of weight and current draw.

```
MPU-6050 ──► Kalman filter ──► Sliding mode controller ──► wheel acceleration
                   ▲                                              │
                   │                                              ▼
              tilt angle                                  velocity integrator
                                                                  │
                                                                  ▼
                                                    Timer1 ISR ──► DRV8825 ──► NEMA 17
```

---

## Hardware at a glance

| Item | Choice | Why |
|---|---|---|
| Controller | Arduino Mega 2560 | Four hardware serial ports and enough pins for RAMPS |
| Shield | RAMPS 1.6 | Cheap, gives two stepper sockets and power distribution |
| Drivers | 2× DRV8825 (HW-216) | Up to 1/32 microstepping, 2.2 A peak |
| Motors | 2× NEMA 17 | Precise low-speed torque, no backlash |
| IMU | MPU-6050 | 6-axis, I2C, well documented |
| Wireless | ESP-01S | Live telemetry, remote gain tuning, driving the robot |
| Power | 3S LiPo (11.1 V) | Feeds the motors directly through RAMPS |

The full list with quantities, prices and purchase notes is in
[`docs/bill-of-materials.md`](docs/bill-of-materials.md).

---

## Build it yourself

Follow these in order.

1. **[Bill of materials](docs/bill-of-materials.md)** — what to buy, and the substitutions that work.
2. **[3D printing](docs/3d-printing.md)** — which parts to print, in what material, with what settings.
3. **[Wiring](docs/wiring.md)** — the RAMPS pin map, the power tree, and the three mistakes that kill boards.
4. **[Assembly](docs/assembly.md)** — mechanical build, step by step.
5. **[Firmware](docs/firmware.md)** — libraries, board settings, uploading, first power-up.
6. **[Tuning](docs/tuning.md)** — calibrating the IMU and finding gains that work on your robot.
7. **[Troubleshooting](docs/troubleshooting.md)** — when it shakes, drifts, or falls over anyway.

Once it balances, there is a [phone remote](android/) that drives it by tilting the handset.
It is specified but not yet written.

If something in those documents is wrong or unclear, that is a bug. Please
[open an issue](../../issues).

---

## Repository map

```
arduino-self-balancing-robot/
├── PROJECT-STATUS.md      What is verified, what is not, and the roadmap
├── docs/                  Build guide and control theory
│   └── theory/            Dynamics model, Kalman filter, sliding mode control
├── firmware/
│   └── SelfBalancingRobot/  Arduino IDE sketch, no external libraries
├── hardware/              Printable chassis, CAD sources, print profiles
│   ├── stl/               Ready-to-slice parts
│   └── cad/               Editable sources, when available
├── simulation/            Browser-based digital twin, plain HTML and JavaScript
├── android/               Tilt-controlled phone remote: specified, not built
│   └── docs/              Requirements, control mapping, protocol, interface
├── media/                 Photos and diagrams of the real robot
├── tools/
│   └── sim-check.js       Headless check that the default gains still balance
└── .github/workflows/     Firmware build, simulator deploy
```

Two pairs of files are deliberate duplicates and must stay in step: the Kalman filter and the
control law each exist once in C++ for the robot and once in JavaScript for the simulator,
and the tunable numbers exist in both `Config.h` and `simulation/js/params.js`. The moment
they disagree the simulator stops predicting what the robot does.

---

## Roadmap

Nothing has been built yet. The full plan, phase by phase, is in
[PROJECT-STATUS.md](PROJECT-STATUS.md). The short version:

| Phase | |
|---|---|
| 0 | Check the pin map, the I2C breakout and the driver assumptions against the real board |
| 1 | Electronics on the bench: sensor signs, driver current, motor directions |
| 2 | Print and assemble, then measure the robot and feed the numbers back to the simulator |
| 3 | First balance |
| 4 | Tuning, and settling on hardware whether the accelerometer compensation matters as much as the simulator says |
| 5 | ESP-01S bridge firmware, so tuning and telemetry work over WiFi |
| 6 | The Android app |
| 7 | Photos, video and a documentation pass, so somebody else can build one |

---

## Contributing

Corrections and improvements are welcome, especially from anyone who actually builds one.
See [CONTRIBUTING.md](CONTRIBUTING.md).

## Safety

A 3S LiPo can deliver enough current to start a fire, and NEMA 17 motors driven at 1.5 A get
hot enough to burn you. Read the safety notes at the top of
[`docs/wiring.md`](docs/wiring.md) before connecting a battery.

## License

[MIT](LICENSE). Use it, change it, sell it — just keep the copyright notice. The
documentation and the chassis model are covered by the same terms.
