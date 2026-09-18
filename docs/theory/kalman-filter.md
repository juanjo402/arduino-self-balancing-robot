# Estimating the tilt angle with a Kalman filter

The controller needs to know which way the robot is leaning, and it needs to know within a
few milliseconds. The MPU-6050 gives two ways to find out, and neither of them works alone.

## The two bad measurements

**The accelerometer** measures the direction of gravity, so it tells you the tilt directly:

```
theta_acc = atan2(-a_y, a_z)
```

It has no drift. Averaged over time it is exactly right. But it measures *all* acceleration,
not just gravity, and a balancing robot is accelerating constantly. Every time the wheels
push, the accelerometer reports a tilt that is not there. It is also noisy, and the motors
fill the chassis with vibration that lands squarely in its passband.

**The gyroscope** measures the rate of rotation, which you can integrate:

```
theta_gyro(t) = theta_gyro(t - dt) + (omega_measured) * dt
```

It is smooth, it is immune to linear acceleration, and it responds instantly. But the
measurement has a small constant offset, and integrating a constant offset gives an angle
that ramps away without limit. On an MPU-6050 that drift is enough to take the estimate
several degrees off within a minute. Worse, the offset **changes with temperature**, and the
stepper drivers sitting next to the sensor heat the chassis for the whole time the robot is
running. A bias you calibrated at startup is not the bias you have five minutes later.

So: one signal is right in the long term and wrong in the short term, the other is right in
the short term and wrong in the long term. Fusing them is the whole problem.

## Why not a complementary filter

The usual answer is a complementary filter:

```
theta = alpha * (theta + omega * dt) + (1 - alpha) * theta_acc
```

with `alpha` around 0.98. It is one line, it costs nothing, and it works. Many balancing
robots use exactly this and stand up fine.

The Kalman filter is used here for one concrete reason: **it estimates the gyro bias as a
state and keeps correcting it**. The complementary filter suppresses the effect of drift by
leaning on the accelerometer, but it never learns what the drift actually is. The Kalman
filter tracks it, which matters on a robot whose sensor is being slowly heated by its own
electronics. It also gives an explicit, tunable statement of how much you trust each sensor,
which turns out to be much easier to reason about than picking `alpha` by feel.

If you want to compare them, the simulator can run either, and the difference shows up
clearly when you enable the simulated bias drift.

## The filter

Two states: the tilt angle and the gyro bias.

```
x = [ theta ]
    [ bias  ]
```

The gyro reading is treated as a control input rather than a measurement, and the
accelerometer angle is the measurement. The model says the angle advances at the corrected
gyro rate and the bias is constant apart from a slow random walk:

```
theta[k] = theta[k-1] + (omega_measured - bias[k-1]) * dt
bias[k]  = bias[k-1]
```

### Predict

```
rate  = omega_measured - bias
theta = theta + rate * dt

P00 += dt * (dt * P11 - P01 - P10 + Q_angle)
P01 -= dt * P11
P10 -= dt * P11
P11 += Q_bias * dt
```

`P` is the 2x2 covariance, how uncertain the filter currently is about each state and how
those uncertainties are correlated. Prediction always makes it grow: time passing without a
measurement means knowing less.

### Update

```
S  = P00 + R_measure          innovation covariance
K0 = P00 / S                  Kalman gain for the angle
K1 = P10 / S                  Kalman gain for the bias

y  = theta_acc - theta        innovation, how wrong the prediction was

theta = theta + K0 * y
bias  = bias  + K1 * y

P00 -= K0 * P00
P01 -= K0 * P01
P10 -= K1 * P00
P11 -= K1 * P01
```

The second line of the gain is where the bias learning happens. If the accelerometer keeps
insisting the angle is a little higher than the gyro integration says, the filter concludes
the gyro is reading a little low and corrects the bias accordingly.

The implementation is in
[`KalmanFilter.cpp`](../../firmware/SelfBalancingRobot/KalmanFilter.cpp), and the simulator
runs a line-for-line copy of the same maths in
[`kalman.js`](../../simulation/js/kalman.js).

## The three tuning parameters

| Parameter | Default | What it means | Symptom if too high | Symptom if too low |
|---|---|---|---|---|
| `Q_angle` | 0.001 | How much you distrust the gyro-driven prediction of the angle | Noisy estimate, follows accelerometer spikes | Sluggish, ignores real motion |
| `Q_bias` | 0.003 | How fast you believe the gyro bias can wander | Bias chases accelerometer noise, estimate wanders | Slow to adapt when the sensor heats up |
| `R_measure` | 0.03 | How much you distrust the accelerometer | Drift creeps back in, filter nearly ignores gravity | Motor vibration and acceleration leak into the estimate |

Only the ratios matter, not the absolute values. Doubling all three changes nothing.

The practical order of tuning: leave `Q_bias` alone, it is rarely the problem. Raise
`R_measure` until motor vibration stops showing up in the angle trace. Then, if the estimate
lags visibly behind reality when you tilt the robot by hand, raise `Q_angle`.

## The part everybody gets wrong

Everything above is the standard recipe, and on its own it does not work on a
balancing robot. It is worth being precise about why, because the failure is
silent and slow and looks like something else.

To hold a lean of `theta`, the robot has to accelerate its wheels at roughly
`g * tan(theta)`. That is the whole job: the wheels chase the centre of mass.
But the accelerometer measures specific force, so that acceleration shows up in
the reading as an apparent tilt, and the apparent tilt has **exactly the
opposite sign and exactly the same size** as the real one.

The two cancel. A balancing robot holding a steady lean reads **zero tilt on its
accelerometer**, no matter how far over it actually is.

So the accelerometer is blind to precisely the quantity it was put there to
measure. The filter has no absolute reference any more. The innovation stops
carrying information about the angle, the bias state quietly absorbs whatever is
left, and the estimate walks away. The robot leans a little further, drives a
little faster to hold the lean, leans further still, and some seconds later the
wheels hit their speed limit and it falls over with nothing visibly wrong.

In the simulator, with everything else held identical, this is the difference
between falling after six seconds and standing for two minutes with half a
degree of wobble.

### The fix

On a stepper robot the correction is free. The firmware sets the wheel speed, so
it knows its own acceleration exactly, with no encoder and no extra sensor.
Subtract that known component from the specific force before taking the
arctangent:

```
fy = accel_y - a_known * cos(theta_est)
fz = accel_z - a_known * sin(theta_est)

theta_acc = atan2(-fy, fz)
```

`a_known` is the axle acceleration actually applied over the last control
period, which the firmware computes as the change in its own clamped velocity
command divided by `dt`. The previous angle estimate is accurate enough to
rotate it into the body frame.

Two details matter in the implementation:

- **The accelerometer readings must be converted to m/s^2 first.** In a plain
  `atan2` the scale cancels and the raw counts are fine. Here they are not,
  because the term being subtracted is a real acceleration.
- **`a_known` must be the acceleration actually delivered, not the one
  requested.** When the velocity command is clamped, the robot does not
  accelerate, and subtracting the requested value would inject an error exactly
  when the robot is in trouble.

This is `COMPENSATE_ACCEL` in `Config.h`. It defaults to on. The switch exists
so the effect can be demonstrated, not because zero is a sensible setting. The
simulator has the same toggle, and turning it off is the quickest way to see
what the failure looks like.

## Startup

At power-up the filter needs a starting point, and the gyro bias needs an initial estimate.
The firmware does both in `IMU::calibrate()`:

1. The robot must be **held still** for about two seconds. Moving it during this window
   poisons the bias estimate and the robot will lean persistently afterwards.
2. It averages several hundred gyro samples. That average is the initial bias.
3. It averages the accelerometer angle over the same window and seeds the filter
   with it, so the filter starts at the real angle instead of converging towards
   it over the first second.

Point three is not a nicety. A single accelerometer reading carries a degree or
two of noise, and seeding the filter with that error is enough to start the whole
drift cycle described above: the robot holds the wrong angle, so it must keep
accelerating to stay there, so the wheels eventually saturate. Averaging costs
nothing, because the gyro samples are being taken anyway.

If the robot consistently drifts in one direction after a good calibration, that is a
mounting offset, not a filter problem. Fix it with `ANGLE_OFFSET_DEG` in `Config.h`.

## Getting the sign right

Signs in IMU code are the single most common source of a robot that accelerates itself into
the floor, hard, on the first run. Check them with the motors disabled before you ever let
it try to balance.

Set `IMU_TEST_MODE` to 1 in `Config.h`, upload, tilt the robot **forward**, and confirm
both of these:

- the angle reads **positive**
- the gyro rate reads **positive** while it is moving forward

If the angle sign is wrong, flip the sign in the `atan2` call in `IMU.cpp`. If the rate sign
is wrong, flip `GYRO_SIGN`. If the two disagree with each other, the filter will fight itself
and the estimate will be visibly wrong, which is a useful thing to be able to spot.

## Further reading

The two-state formulation used here is the one popularised by Kristian Lauszus's widely
copied Arduino implementation, itself based on the standard discrete Kalman filter applied to
the gyro-bias problem. Any textbook treatment of the discrete Kalman filter covers the
general algorithm; the specialisation to angle plus bias is what makes it cheap enough to run
at 200 Hz on an 8-bit microcontroller.
