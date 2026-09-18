# Android remote control app

A phone app that drives the robot over WiFi by tilting the handset. Hold the phone level and
the robot stands still. Tilt it forward and the robot drives forward. Tilt it left or right
and the robot turns.

## Status: specified, not built

**There is no code here yet.** This folder holds the specification for an app that has not
been written. The documents describe what it has to do and the constraints it has to respect,
so that whoever writes it, including a future version of the author, does not have to
rediscover them.

Nothing here has been implemented, compiled or tested.

## Read in this order

1. **[Requirements](docs/requirements.md)** — what the app must do, what it must never do,
   and the decisions that are still open.
2. **[Control mapping](docs/control-mapping.md)** — the maths from phone tilt to robot
   command, including the neutral capture, the dead zone and the response curve.
3. **[Protocol](docs/protocol.md)** — how the phone reaches the robot, and the exact message
   contract with the firmware.
4. **[User interface](docs/ui.md)** — the screens, the states, and what has to be visible
   while driving.

## What it depends on

The app cannot work on its own. It needs two things that do not exist yet:

**Firmware for the ESP-01S.** The module has to bridge a WiFi socket to the Mega's `Serial1`.
That firmware is not written. It is a small job, perhaps a hundred lines, and it is the next
thing to build after the robot balances. It will live in `firmware/esp01s-bridge/`.

**A robot that balances.** Until then there is nothing to drive. The order matters: a remote
control for a robot that falls over is not testable.

## Where the app project will go

Android Studio project goes in [`app/`](app/), so that the specification and the
implementation stay side by side but do not get tangled up in each other.

## Why an app rather than a web page

The robot already speaks a text protocol, and a web page served from the ESP-01S would avoid
installing anything. That would be the right answer for tuning gains from a laptop.

It is the wrong answer here, for one reason: a browser cannot reliably read the phone's
orientation sensors. `DeviceOrientationEvent` needs a secure context, which the robot's own
access point cannot provide without a certificate, and on iOS it needs an explicit permission
gesture. A native app reads the sensors directly and has none of that difficulty.
