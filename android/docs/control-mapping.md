# Control mapping

How a tilted phone becomes a moving robot. This is the part that decides whether the app
feels good or feels broken, so it is specified precisely rather than left to the
implementation.

## What the user expects

| Phone | Robot |
|---|---|
| Flat and level | Stopped |
| Tilted forward, top edge down | Drives forward |
| Tilted back, top edge up | Drives backward |
| Tilted right, right edge down | Turns clockwise, seen from above |
| Tilted left, left edge down | Turns counter-clockwise, seen from above |

Tilt further, move faster. Tilt in two axes at once and the robot drives and turns at the
same time.

## Reading the tilt

Use `Sensor.TYPE_GRAVITY`, at `SENSOR_DELAY_GAME` or faster. It returns the gravity vector in
the device coordinate frame, already fused from the accelerometer and gyroscope and
low-pass filtered by the system, which saves writing a filter that would be worse.

Android's device frame, with the phone held in portrait and the screen facing the user:

```
        +Y  (towards the top edge of the phone)
         |
         |
  -X ----+---- +X   (towards the right edge)
         |
         |
        -Y

  +Z points out of the screen, towards the user
```

Lying flat on a table face up, gravity reads `(0, 0, +9.81)`.

Extract two angles:

```
pitch = atan2( gy, sqrt(gx*gx + gz*gz) )     positive when the top edge tips down
roll  = atan2( gx, sqrt(gy*gy + gz*gz) )     positive when the right edge tips down
```

Use the square-root form rather than `atan2(gy, gz)`. The two-argument version misbehaves
when the phone is held near vertical, because `gz` goes through zero, and it also couples the
two axes together so that rolling changes the reported pitch.

## Neutral capture

The requirement says "flat and level means stopped", but nobody holds a phone flat. People
hold it at 20 or 30 degrees, and that is comfortable. So "level" has to mean "however the
phone was when the user pressed capture", not "parallel to the floor".

On capture, store `pitch0` and `roll0`. From then on:

```
p = pitch - pitch0
r = roll  - roll0
```

This subtraction is an approximation. It is exact only when the two rotations commute, which
they do not in general, but the error stays small for the tilt range this app uses and it is
far simpler than composing quaternions. If the neutral is captured with the phone near
vertical the approximation breaks down; refuse to capture a neutral whose pitch is beyond
about 60 degrees from flat and tell the user why.

**Capture the neutral before allowing any drive command.** This is safety requirement S5.

## From angle to command

Three stages, in this order.

### 1. Dead zone

```
if |p| < DEADZONE:  p = 0
else:               p = sign(p) * (|p| - DEADZONE)
```

Subtracting the dead zone rather than just zeroing inside it is what stops the command
jumping when the tilt crosses the threshold. The same for `r`.

A dead zone of **3 degrees** is a reasonable start. It has to be large enough to absorb a
hand that is not perfectly steady and small enough that the control does not feel dead.

### 2. Normalise

```
p_n = clamp( p / (FULL_TILT - DEADZONE), -1, +1 )
r_n = clamp( r / (FULL_TILT - DEADZONE), -1, +1 )
```

`FULL_TILT` is the tilt that gives full speed. **30 degrees** is a good default: far enough
that fine control is possible, close enough that you can reach it without the screen becoming
hard to read.

### 3. Response curve

A linear map makes the robot feel twitchy near the centre, which is where most driving
happens. Square it while keeping the sign:

```
curve(x) = sign(x) * |x|^EXPO
```

`EXPO = 2.0` gives noticeably finer control near neutral. Make it a setting between 1.0 and
3.0 so it can be tuned by feel rather than argued about.

### Output

```
forward = curve(p_n)
turn    = -curve(r_n)
```

Note the **minus sign on turn**. Tilting right gives a positive roll, and the user wants
clockwise, which is a negative `turn` in the firmware's convention. Getting this wrong makes
the robot steer the wrong way, which is obvious the first time you try it and worth checking
early.

## Rate limiting

Also apply a slew limit to the two outputs, something like **2.5 units per second**, so that
a jolt of the wrist cannot produce a step change in the command.

This matters more than it sounds. The robot is non-minimum-phase: to drive forward it first
drives its wheels backward to lean the body forward. A step change in the velocity request
makes that backward lurch large and abrupt, and it looks alarming even when the controller
handles it.

## Sending

Send at **20 Hz**, always, not only when the tilt changes. The firmware zeroes the drive
command if it hears nothing for 500 ms, so a command stream that stops because the phone is
being held still is a robot that stutters.

Format is a single line, described in [the protocol notes](protocol.md):

```
d 0.42 -0.13\n
```

Two decimal places is plenty. The robot's own speed resolution is coarser than that.

## Defaults, collected

| Parameter | Default | Range to expose |
|---|---|---|
| `FULL_TILT` | 30 deg | 15 to 45 |
| `DEADZONE` | 3 deg | 0 to 10 |
| `EXPO` | 2.0 | 1.0 to 3.0 |
| Slew limit | 2.5 per second | 1 to 10 |
| Send rate | 20 Hz | fixed |

All five should be adjustable in a settings screen, because the right values depend on how
the person holds the phone and none of them can be picked correctly in advance.

## Verifying the directions

Before trusting any of this, hold the robot off the ground, connect, and check all four
directions one at a time.

The `turn` sign in particular depends on how the motors are wired and on the
`INVERT_DIR_L` and `INVERT_DIR_R` flags in the firmware. If turning is reversed on your
robot, fix it with a "reverse steering" setting in the app. Do **not** fix it by flipping a
motor inversion flag in `Config.h`, because that would reverse the forward direction as well
and break the balance controller.
