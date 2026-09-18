# Sliding mode control

## Why not just a PID

A cascaded PID balances this robot. Plenty of people have built one that way and it works.
So the honest answer to "why sliding mode" is partly "because it is more interesting", but
there is a real engineering argument too.

A PID is tuned for one operating point and one set of physical parameters. Change the
parameters and you retune. On a hand-built robot the parameters are not well known: the
centre of mass moves when you reposition the battery, the mass changes when you bolt
something to the top deck, friction changes as the bearings wear in, and the available torque
changes as the pack discharges from 12.6 V to 10 V.

Sliding mode control is built for exactly that. It does not try to know the plant precisely.
It defines a surface in state space on which the robot behaves the way you want, then applies
whatever control is needed to force the state onto that surface and keep it there, using a
term aggressive enough to dominate any modelling error inside a bound you choose. Within
that bound the closed-loop behaviour is **invariant** to the parameter errors.

The price is chattering, and dealing with it is most of the practical work.

## The sliding surface

Define the errors against the references the outer loop provides:

```
e_theta = theta - theta_ref
e_x     = x - x_ref
e_v     = v - v_ref
```

and the surface:

```
s = theta_dot + c_theta * e_theta + c_v * e_v + c_x * e_x
```

The coefficient on `theta_dot` is fixed at 1, which removes one redundant degree of freedom
and leaves three gains to choose.

Setting `s = 0` does not fix the state, it constrains it. What it says is that the angle
error decays at a rate set by `c_theta`, pulled around by the position and velocity errors.
Choosing the three coefficients is pole placement on the reduced-order dynamics that remain
once the robot is on the surface. In practice:

- **`c_theta` sets the balance bandwidth.** On the surface, ignoring the other terms, the
  angle obeys `theta_dot = -c_theta * e_theta`, a first-order decay with time constant
  `1 / c_theta`. The robot falls with a time constant near 120 ms, so `c_theta` has to be
  above about 8 for the controller to catch it at all. Useful values run from there to
  about 12; higher than that and the robot shakes.
- **`c_v` sets how hard the robot works to hold a speed.** Too high and it fights its own
  balance loop.
- **`c_x` sets how hard it works to hold a position.** This is the slowest term by a wide
  margin. Too high and the robot oscillates back and forth across its target, slowly, with a
  period of a second or more.

The separation of timescales is what keeps the design stable: balance is fast, velocity is
medium, position is slow. If `c_x` approaches `c_theta` the loops interact and the robot
becomes untunable.

## The control law

Differentiate `s` along the [dynamics](dynamics.md), with `J = I + m l^2`:

```
s_dot = c_theta * theta_dot + c_x * e_v + (m g l sin(theta) - b theta_dot) / J
        + u * (c_v - m l cos(theta) / J)
```

The `c_x` term picks up `e_v` rather than `v` because the position reference moves at the
commanded speed, so `d/dt(e_x) = v - v_ref = e_v`.

Split that into a part that does not depend on the input and a gain on the input:

```
f   = c_theta * theta_dot + c_x * e_v + (m g l sin(theta) - b theta_dot) / J
g_s = c_v - m l cos(theta) / J

s_dot = f + g_s * u
```

The sine and cosine are kept rather than linearised. They cost about 25 microseconds a loop
on the Mega, and keeping them means the model stays honest out to the 35 degree safety limit
instead of only near upright.

`g_s` must never be zero, or the control has no authority over the surface. With the nominal
parameters `m l / J` is about 6.9, so keep `c_v` well away from that value. The firmware
checks this when gains are set and logs a warning, and clamps `g_s` away from zero at
runtime so a bad gain cannot cause a division by zero on a robot that is standing up.

The control has two parts:

```
u = ( -f - eta * s - K * sat(s / phi) ) / g_s
```

**The equivalent control** is the `-f / g_s` part. It is the input that would hold `s`
exactly constant if the model were perfect. It does the bulk of the work and it is smooth.

**The reaching terms** are `-eta * s` and `-K * sat(s / phi)`. They drive `s` to zero and
keep it there despite everything the model got wrong. The linear term handles small errors
gracefully; the switching term is what gives the robustness.

### Why this is stable

Take `V = s^2 / 2` as a Lyapunov candidate. Outside the boundary layer, where
`sat(s/phi) = sign(s)`:

```
V_dot = s * s_dot = s * (-eta * s - K * sign(s)) = -eta * s^2 - K * |s|
```

which is strictly negative whenever `s` is nonzero. The `-K|s|` term means `s` reaches zero
in **finite time**, not just asymptotically, which is the property that makes sliding mode
different from a linear controller.

If the model is wrong by some bounded disturbance `d`, then `V_dot = -eta s^2 - K|s| + s d`,
which is still negative as long as `K > |d|`. **That inequality is the entire design rule for
`K`**: make the switching gain bigger than the worst modelling error you expect, in the units
of `s_dot`. Bigger than necessary costs you chattering, not stability.

## Chattering and the boundary layer

The ideal law uses `sign(s)`, which switches between full positive and full negative control
infinitely fast as `s` crosses zero. Real actuators cannot, and the attempt shows up as
high-frequency oscillation: audible buzzing from the motors, visible shaking, and heat in the
drivers. On a stepper robot it also drives the motors past the point where they can follow,
which breaks the velocity-source assumption the whole model rests on.

The standard fix is to replace `sign` with a saturation function over a thin boundary layer
of half-width `phi`:

```
sat(z) = z         if |z| <= 1
         sign(z)   otherwise

switching term = K * sat(s / phi)
```

Inside the layer the control is proportional rather than switching, which makes it smooth.
The cost is that the state is no longer driven exactly to `s = 0`, only into a band around
it, so a small steady-state error remains. The width of that band scales with `phi`.

Choosing `phi` is the real trade-off in this design:

| `phi` | Effect |
|---|---|
| too small | Chattering: the motors buzz, the robot vibrates, the drivers heat up |
| too large | The switching term becomes a plain proportional gain, robustness is lost, the robot sags and drifts |

Start at 0.05 and adjust. The simulator makes this visible: the plot of `s` against time
shows the state either reaching the layer and staying smooth, or ringing across it.

## From `u` to motor steps

The controller output `u` is an **acceleration of the wheel axle, in m/s^2**. The firmware
turns it into step rates in three stages:

1. **Integrate** to a wheel velocity: `v += u * dt`. This integrator is the reason the
   controller can hold a lean angle indefinitely without a separate integral term.
2. **Clamp** to `MAX_SPEED_MPS`. Asking for more speed than the motors can deliver breaks the
   velocity-source assumption, so it is better to saturate honestly and let the controller see
   the limit than to command something unreachable.
3. **Convert and mix** with the yaw command:
   ```
   steps_per_s = v * MICROSTEPS * STEPS_PER_REV / (2 * pi * r)
   left  = steps_per_s - yaw
   right = steps_per_s + yaw
   ```

Anti-windup matters on that integrator. When the velocity is clamped, the firmware stops
integrating in the direction that would push it further into the limit. Without that, a robot
held against a wall winds up a large velocity command and shoots off when released.

## Default gains

These are starting points found in the simulator with the nominal parameters, not values
validated on a physical robot. Expect to change them. The authoritative copies live in
[`Config.h`](../../firmware/SelfBalancingRobot/Config.h) and
[`params.js`](../../simulation/js/params.js), which are kept in step.

| Gain | Default | Role |
|---|---|---|
| `c_theta` | 9.0 | Balance bandwidth |
| `c_v` | 0.55 | Speed holding |
| `c_x` | 0.12 | Position holding |
| `eta` | 8.0 | Linear reaching rate |
| `K` | 3.0 | Switching gain, robustness margin |
| `phi` | 0.05 | Boundary layer half-width |

The tuning procedure, in the order that actually converges, is in
[the tuning guide](../tuning.md).

## Implementation notes

The firmware implementation is in
[`SlidingModeController.cpp`](../../firmware/SelfBalancingRobot/SlidingModeController.cpp).
Three details worth knowing:

- **All maths is in `float`.** The Mega has no FPU, so a float multiply costs a few
  microseconds. At 200 Hz with this many operations it is comfortably affordable, and fixed
  point would be a premature optimisation that makes the code much harder to follow.
- **`g_s` is computed once at startup**, not every loop, since it depends only on constants.
- **The controller is reset when the robot is picked up.** Both the integrator and the
  internal state are cleared when the tilt exceeds the safety limit, so it restarts cleanly
  rather than resuming with a stale velocity command.
