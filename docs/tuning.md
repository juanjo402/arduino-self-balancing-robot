# Tuning

The defaults in `Config.h` came out of the simulator with the nominal parameters. Your robot
is not that robot. This page is the order that actually converges, rather than the order
that feels natural.

The short version: **get the sensor right first**. Most time lost to tuning a balancing
robot is spent adjusting control gains to compensate for an estimate that was wrong. No gain
fixes a bad angle.

## Before you touch a gain

Work through these in order. Do not skip ahead because the robot "nearly" balances.

### 1. Check the signs

Set `IMU_TEST_MODE` to 1 in `Config.h`, upload, and open the serial monitor at 115200. The
motors stay disabled. Tilt the robot **forward** and confirm:

- the Kalman angle reads **positive**
- the rate reads **positive** while it is moving

If the angle is wrong, flip `ACCEL_SIGN`. If the rate is wrong, flip `GYRO_SIGN`. Get this
right before anything else: with the sign inverted the controller drives the robot into the
floor at full speed the moment it arms.

### 2. Check the motor directions

Set `IMU_TEST_MODE` back to 0. Hold the robot off the ground, let it arm, and tilt it
forward by hand. Both wheels should try to drive forward, in the direction that would put
them back under the centre of mass. If one runs backwards, flip `INVERT_DIR_L` or
`INVERT_DIR_R`. If both do, flip both.

### 3. Find the mechanical zero

Stand the robot up and find by hand the angle at which it genuinely balances with no power.
The firmware's idea of zero has to match it. Let it balance, watch whether it creeps
persistently in one direction, and trim `ANGLE_OFFSET_DEG` a tenth of a degree at a time
until it holds station. Positive values make the robot think it is leaning further forward
than it is, so it leans back.

You can do this live over serial with `g off 0.4` rather than recompiling.

A robot that creeps is not badly tuned, it is badly zeroed. Tuning gains to fix a creep will
make everything worse.

### 4. Confirm the physical parameters

Measure the mass and the centre of mass height as described in
[the dynamics notes](theory/dynamics.md), and put them in `Config.h`. Put the same numbers
into the simulator. Then rerun the simulator and take its gains as your starting point.

## Doing it in the simulator first

This is the part worth taking seriously. The [simulator](../simulation/) runs the same
filter and the same control law with the same numbers, and it costs nothing to break. Tune
there until the robot survives a shove, holds position, and copes with a payload it was not
told about, then move those gains to the hardware.

There is also a headless version for quick checks:

```
node tools/sim-check.js
```

It runs eight scenarios against both controllers and prints a pass or fail for each. Change
a gain in `simulation/js/params.js` and rerun it to find out in a second whether you made
things better or worse.

## Tuning the filter

Do this before the control gains, and do it with the robot held in your hand rather than
balancing.

Stream telemetry with `s 1` and look at the angle trace.

**If the angle is noisy and jumps around while the motors buzz**, motor vibration is getting
through. In order of effectiveness: check the IMU is on foam and not screwed down solid,
then raise `KALMAN_R_MEASURE` until the noise stops, then lower the driver current.

**If the angle lags visibly behind the robot when you tilt it by hand**, raise
`KALMAN_Q_ANGLE`.

**If the robot balances for a minute and then slowly starts leaning and driving away**,
the estimate is drifting. Check that `COMPENSATE_ACCEL` is 1. That one switch matters more
than every filter gain combined; the reason why is in
[the Kalman notes](theory/kalman-filter.md).

Leave `KALMAN_Q_BIAS` alone unless you have a specific reason. It is rarely the problem.

## Tuning the sliding mode controller

Six gains, but they do not all matter equally, and they have a natural order.

### c_theta, the balance bandwidth

Start with everything else at zero: `c_v = 0`, `c_x = 0`, `K = 0`, and `eta` at its default.
The robot will balance but drift across the room. That is expected and it is fine: you are
only tuning the angle loop here.

Raise `c_theta` until the robot holds the angle crisply, then back off about 20 %.

| Symptom | Meaning |
|---|---|
| Slow, lazy, falls over from a small push | `c_theta` too low |
| Fast shaking, a few Hz, audible | `c_theta` too high |
| Balances but wanders off | Normal at this stage, that is what `c_v` and `c_x` are for |

The robot's own falling time constant is around 120 ms, so useful values sit between about
7 and 12. Below 8 the controller is not fast enough to catch it at all.

### eta and K, the reaching terms

`eta` is a linear pull towards the sliding surface and `K` is the switching term that makes
the design robust. Raise `eta` until disturbance recovery is brisk. Then raise `K` until the
robot shrugs off a shove without a long wobble.

`K` has to be larger than the worst modelling error you expect, measured in the units of the
surface's rate of change. Larger than necessary costs chattering, not stability, so err on
the generous side and then fix the chattering with `phi`.

### phi, the boundary layer

This is the one that decides whether the robot buzzes.

| Symptom | Fix |
|---|---|
| Motors buzz and the chassis vibrates while balancing | Raise `phi` |
| The robot sags, drifts, and feels soft | Lower `phi` |

Start at 0.05. Move it in steps of 0.01. Watch the surface trace: it should settle into the
boundary layer and stay smooth, not ring across zero.

### c_v, holding a speed

Now add the outer loop. Raise `c_v` until the robot stops drifting and settles to a stop
after you push it. Too high and it fights its own balance loop, which shows up as a slow
rocking motion.

Keep `c_v` well away from `m*l/J`, about 6.9 with the nominal parameters, because the
controller loses authority over the surface there. The firmware prints a warning at startup
if you get close.

### c_x, holding a position

Last, and smallest. This is what makes the robot return to where it started rather than
merely stopping. It is the slowest loop by a wide margin: if it approaches `c_theta` the
loops interact and the robot becomes untunable.

Typical values are a tenth of `c_v`. Too high shows up as a slow oscillation back and forth
across the target with a period of a second or more.

## Tuning over the wireless link

Recompiling for every gain change is the slowest possible way to do this. With the ESP-01S
fitted, or just a USB cable, connect a terminal at 115200 and use:

```
g                print all gains
g ct 9.5         set c_theta
g phi 0.06       set the boundary layer
g off 0.3        trim the angle offset
s 1              start streaming telemetry
w                save the current gains to EEPROM
r                restore the compiled-in defaults
```

Gains take effect immediately. They are **not** saved until you send `w`, so a reset gets you
back to the last saved set, which is a useful way out when a change makes things worse.

## When to stop

The robot is tuned well enough when it:

- stands still without creeping, for minutes rather than seconds
- recovers from a firm push without more than one overshoot
- can be driven forward and stopped without a long wobble
- does not buzz audibly while holding station

Chasing anything beyond that on a printed chassis is usually chasing mechanical slop rather
than control gains.

## Record what you found

When you have numbers that work, put them in `Config.h`, in
`simulation/js/params.js`, and write down the physical parameters you measured. A gain set
without the robot it belongs to is not much use to the next person, including you in six
months.
