# User interface

Three screens. The driving screen is the one that matters; the other two exist so the driving
screen can stay uncluttered.

## Driving screen

This is what the app opens to, and where it spends all its time. The person using it is
looking at a robot on the floor several metres away, not at the phone. Everything on this
screen has to be readable from the edge of vision.

```
+------------------------------------------+
|  ● connected            robot: balancing |   <- status strip, always visible
+------------------------------------------+
|                                          |
|              tilt indicator              |   <- where the phone is pointing,
|                  ( + )                   |      relative to the captured neutral
|                                          |
|                                          |
|                                          |
|        HOLD ANYWHERE TO DRIVE            |   <- the whole area is the dead-man control
|                                          |
|                                          |
|                                          |
+------------------------------------------+
|   angle 0.4°    speed 0.21 m/s           |   <- telemetry, small
+------------------------------------------+
|  [ capture level ]            [ STOP ]   |
+------------------------------------------+
```

### The driving area

The large central region is the dead-man control. Touch and hold anywhere in it and the robot
responds to tilt. Lift the finger and the robot stops immediately.

Making it large is the point. It has to be usable without looking at the phone, and a small
button cannot be.

While held, it should be obviously active: a colour change across the whole area, not a
subtle outline.

### The tilt indicator

A dot on a circle showing the current tilt relative to neutral, with a ring marking full
travel and a shaded circle marking the dead zone. It answers the two questions the user
actually has: how far am I from neutral, and how much further can I go.

The dot moves right as the phone rolls right and up as the phone tilts forward. Forward maps
to up, because that is where the robot is going.

### The status strip

Two things, always:

- **Connection.** Connected, connecting, or disconnected, with colour as well as words.
- **Robot state.** Straight from the telemetry `state` field. When it reads `fallen`, this
  strip should be impossible to miss, because from across the room a fallen robot and a
  balancing one that has stopped moving look similar.

### Telemetry line

Tilt angle and speed. Small, unobtrusive, and enough to tell whether the robot is working
hard or coasting. Everything else the robot reports is diagnostic and does not belong here.

### Capture level

The button that defines neutral. Pressed with the phone held the way the user intends to hold
it while driving.

Until it has been pressed at least once, the driving area is **disabled** and says so. That
is safety requirement S5, and it stops the first command reflecting whatever angle the phone
happened to be lying at.

Worth showing a brief confirmation when captured, because otherwise there is no feedback that
anything happened.

### Stop

An always-available control that sends a zero drive command and releases the dead-man state.
It is redundant with lifting a finger, which is the point: when something goes wrong, people
press things.

## Connection screen

Shown when disconnected, and reachable from the status strip.

- Address and port, remembered between runs, defaulting to `192.168.4.1` and `3333`.
- A connect button.
- Plain instructions for joining the robot's access point, including the warning that Android
  will ask whether to stay on a network with no internet and that the answer is yes. See
  [the protocol notes](protocol.md#the-android-routing-trap).
- The last error, in words. "Connection timed out" is more useful than a spinner that never
  stops.

## Settings screen

The five numbers from [the control mapping](control-mapping.md), each with a sensible range
and a one-line explanation:

| Setting | What it changes |
|---|---|
| Full tilt | How far you tilt for full speed |
| Dead zone | How far you can tilt before anything happens |
| Expo | How much finer the control is near the centre |
| Slew limit | How quickly the command can change |
| Reverse steering | Flips the turn direction, for a robot wired the other way |

Changes apply immediately, so they can be adjusted by feel while the robot is on the floor.

## States the interface has to handle

Not exceptions, states. Each needs a defined appearance.

| State | What the user sees |
|---|---|
| Disconnected | Connection screen, driving disabled |
| Connecting | Clear progress, and a timeout that gives up and says why |
| Connected, neutral not captured | Driving area disabled, prompt to capture level |
| Connected, ready | Normal driving screen |
| Driving | Driving area visibly active |
| Robot fallen | Prominent, drive commands still sent as zero |
| Robot calibrating | Driving disabled, "hold the robot still" |
| Connection lost while driving | Immediate stop, prominent notice, automatic reconnection attempt |
| App backgrounded | Stop, release the dead-man state, do not reacquire it on return without a new touch |

That last one matters. Returning to the app must not resume driving just because a finger
happens to be on the screen.

## Things to leave out

- Gain tuning. It is in scope for the firmware protocol and out of scope for this app.
- Graphs of telemetry over time. Interesting, and not while driving.
- A camera view. Different project.
- Anything that requires reading the screen carefully while the robot is moving.
