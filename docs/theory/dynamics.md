# Dynamics of the robot

This page derives the model that the controller and the simulator both use. You do not need
it to build the robot, but you do need it to understand why the gains are what they are, and
to change them intelligently instead of by trial and error.

## The physical picture

The robot is a body that can rotate freely about the wheel axle, with wheels that can be
driven along the ground. Left alone the body falls: the only way to hold it up is to move
the axle so it stays underneath the centre of mass.

```
            CoM
             o  <- body mass m, inertia I about the CoM
            /|
           / |  l = distance from axle to CoM
          /  |
     theta   |
        \    |
         \   |
  ========o========  <- wheel axle
      (  )   (  )    <- wheels, radius r
  ------------------  ground
             |
             x  = axle position along the ground
```

Symbols used throughout:

| Symbol | Meaning | Unit |
|---|---|---|
| `theta` | tilt of the body from vertical, positive forward | rad |
| `x` | position of the wheel axle along the ground | m |
| `m` | mass of the body, excluding the wheels | kg |
| `l` | distance from the axle to the body centre of mass | m |
| `I` | moment of inertia of the body about its own centre of mass | kg m^2 |
| `r` | wheel radius | m |
| `b` | viscous friction at the axle | N m s / rad |
| `g` | 9.81 | m/s^2 |

## Why the input is acceleration, not torque

Most textbook treatments of the inverted pendulum take the motor torque as the input. That
is right for DC motors. It is the wrong model here.

A stepper driver does not apply a commanded torque. It commands a position, and as long as
the load stays under the available torque it *arrives* there. Practically, the firmware sets
a step rate, so the wheel velocity is what we command directly. The control input is
therefore the **acceleration of the axle**, and the model becomes much simpler than the
usual coupled cart-pendulum equations.

This is exact rather than an approximation, as long as the motors do not stall. Once they
stall the assumption collapses and the robot falls over, which is why the current limit and
the acceleration cap in `Config.h` matter.

## Equation of motion

Work in the accelerating frame of the axle. In that frame a pseudo-force `-m a` acts
horizontally at the centre of mass, where `a` is the axle's acceleration. Taking moments
about the axle:

```
(I + m l^2) * theta_ddot  =  m g l sin(theta)  -  m l a cos(theta)  -  b theta_dot
```

The three terms on the right are gravity pulling the body over, the pseudo-force from
driving the wheels, and friction. Write `J = I + m l^2` for the inertia about the axle.

Near upright, `sin(theta) = theta` and `cos(theta) = 1`:

```
J theta_ddot = m g l theta - m l a - b theta_dot
```

Note the sign on the input: **to tilt the robot backwards you accelerate forwards**. This is
the source of the non-minimum-phase behaviour every balancing robot shows. To drive forward
the controller must first drive the wheels *backwards* to make the body lean forward, then
chase it. If you have ever watched one of these robots start moving and seen it twitch the
wrong way first, that is the model, not a bug.

## State-space form

With the state `[x, x_dot, theta, theta_dot]` and input `u = a`:

```
d/dt [ x         ]   [ 0   0        0        0 ] [ x         ]   [   0        ]
     [ x_dot     ] = [ 0   0        0        0 ] [ x_dot     ] + [   1        ] u
     [ theta     ]   [ 0   0        0        1 ] [ theta     ]   [   0        ]
     [ theta_dot ]   [ 0   0    mgl/J     -b/J ] [ theta_dot ]   [ -m l / J   ]
```

with the first row also contributing `x_dot` to `x_dot`'s position, i.e. `A[0][1] = 1`.

The interesting number is the unstable pole:

```
omega = sqrt(m g l / J)
```

That is how fast the robot falls. For the nominal parameters below it works out at about
8.3 rad/s, so the falling motion has a time constant of roughly 120 ms. A control loop needs
to be at least an order of magnitude faster than the dynamics it is stabilising, which is why
the firmware runs its loop at **200 Hz**, around 25 times faster. Running it at 50 Hz would
leave almost no phase margin, and it shows up as a robot that oscillates and cannot be tuned
out of it.

## Nominal parameters

These are the design values used as defaults in the firmware and the simulator. They are
estimates for the chassis in [`hardware/`](../../hardware/), **not measurements**. Replace
them with real numbers once your robot exists.

| Parameter | Value | Where it is used |
|---|---|---|
| `m` | 0.85 kg | `Config.h`, `simulation/js/params.js` |
| `l` | 0.105 m | as above |
| `I` | 0.0035 kg m^2 | simulator only |
| `r` | 0.040 m | both, converts steps to metres |
| `b` | 0.001 N m s/rad | simulator only |

Derived: `J = 0.0129 kg m^2`, `omega = 8.3 rad/s`.

## Measuring your own parameters

Worth doing. A model with the right numbers turns the simulator from a toy into a tool that
predicts what the real robot does.

**Mass `m`.** Kitchen scale, robot fully assembled with the battery in, minus the wheels.

**CoM height `l`.** Lay the robot horizontally across a thin straight edge, a ruler on its
side works, and slide it until it balances. The balance point is the centre of mass. Measure
from there to the wheel axle.

**Inertia `I`.** Hang the robot from a pivot well above the centre of mass, let it swing with
small amplitude, and time 20 oscillations. For a compound pendulum of mass `m` with the pivot
a distance `d` from the centre of mass, the period is

```
T = 2 pi sqrt( (I + m d^2) / (m g d) )
```

Rearrange for `I`. If that is more effort than you want, approximating the body as a uniform
plate of height `h` gives `I = m h^2 / 12`, which is usually within 30 %. The controller is
not sensitive enough to that number for the difference to matter much, which is exactly the
kind of parameter uncertainty sliding mode control is good at absorbing.

**Wheel radius `r`.** Measure the loaded diameter, with the robot's weight on the tyre, not
the free diameter. Rubber tyres compress by a millimetre or two and it biases every speed
calculation.

## What the model leaves out

Honest list, because these are the things that will surprise you on the real robot:

- **Wheel slip.** The model assumes the wheels never slip. On a smooth floor under hard
  acceleration they do, and the controller loses its authority exactly when it needs it most.
- **Wheel inertia.** Accelerating the wheels themselves takes torque. It is folded into the
  acceleration limit rather than modelled.
- **Motor torque falling with speed.** A stepper's available torque drops as step rate rises.
  Near the speed limit the acceleration the controller asks for is not the acceleration it
  gets.
- **Yaw.** Turning is handled as a differential offset added to the two wheel speeds after
  the balance controller runs. The two axes are treated as independent, which is fine at the
  speeds this robot reaches.
- **Chassis flex.** A printed frame is not rigid. Flex puts a resonance between the motors
  and the IMU, and it is why the sensor is mounted on foam.

## Where to go next

- [Kalman filter](kalman-filter.md), how `theta` and `theta_dot` are estimated from a noisy
  IMU.
- [Sliding mode control](sliding-mode-control.md), how the input `a` is computed.
