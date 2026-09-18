# 3D printing the chassis

The printable parts are in [`hardware/stl/`](../hardware/stl/). Print profiles and any
editable CAD sources live alongside them in [`hardware/`](../hardware/).

## What the chassis has to do

Worth reading even if you are designing your own, because these four requirements are what
separate a chassis that balances from one that shakes.

**Hold the motors rigidly.** Any flex between a motor and the IMU becomes a resonance
between the actuator and the sensor. That is the single most common reason a mechanically
sound robot cannot be tuned: the controller ends up chasing chassis wobble rather than body
tilt. Thick motor mounts, short load paths, and screws rather than friction fits.

**Put the centre of mass reasonably high.** Counter-intuitive, but a taller pendulum falls
more slowly and is easier to catch. `omega = sqrt(m*g*l/J)`, so raising the centre of mass
lowers the bandwidth the controller needs. A robot whose mass is all down at axle height is
brutally hard to balance. Battery high rather than low.

**Put the IMU near the axle.** The accelerometer measures the acceleration of the point
where it sits, so mounted high it sees the tangential acceleration of the robot rocking and
reports a tilt that is not there. As close to the wheel axis as the layout allows.

**Keep it symmetric front to back.** Any asymmetry becomes a constant angle offset. It is
correctable in software with `ANGLE_OFFSET_DEG`, but starting near zero saves effort.

## Print settings

| Setting | Value | Why |
|---|---|---|
| Material | PLA or PETG | PLA is fine indoors. PETG if the drivers run hot nearby |
| Layer height | 0.2 mm | Nothing here needs finer |
| Walls | 3 or more | Wall count carries the load, not infill |
| Infill | 25 % gyroid | Above 30 % you are adding mass for very little stiffness |
| Supports | See the part notes | Most parts are designed to print without |
| Brim | On the motor mounts | Tall narrow parts and a stepper's weight |

Avoid ABS unless you already print it well. Warping on a motor mount puts the axles out of
parallel, and a robot whose wheels are not parallel turns when it should drive straight.

## Orientation matters

Print motor mounts so the layer lines run **across** the direction of load, not along it.
A bracket printed in the wrong orientation splits along a layer boundary the first time the
robot falls over, and it will fall over.

## After printing

- Test fit every screw before assembling anything. Holes shrink.
- If you use heat-set inserts, do it now, while the parts are still separate and flat.
- Check that both motor faces are coplanar by laying the assembled frame on a flat surface.
  Non-parallel axles are very hard to diagnose later and show up as unexplained drift.

## Adapting a different chassis

Nothing in the firmware assumes this particular chassis. What it assumes is in `Config.h`:
wheel radius, wheel base, mass, centre of mass height and inertia. Measure yours, put the
numbers there and in the simulator, and it will work.

If you use a design from Printables or Thingiverse, keep the attribution and the licence
with it. Do not commit someone else's STL into this repository without checking their terms.
