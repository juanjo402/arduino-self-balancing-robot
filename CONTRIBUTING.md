# Contributing

Corrections are welcome, and corrections from people who actually built one are the most
valuable thing this repository can receive.

## The most useful contributions

**Tell us where the documentation is wrong.** If a pin number does not match your board, if a
step in the assembly guide assumes something it should not, or if a paragraph made you do the
wrong thing, that is a bug and it is worth an issue. Documentation that sounds right and is
not is worse than no documentation.

**Tell us what gains worked on your robot**, along with the mass, centre of mass height and
wheel radius you measured. A gain set without the robot it belongs to is not much use, but
several of them together start to show a pattern.

**Post photos of your build.** Especially if you changed something.

## Reporting a problem

Include:

- what the robot did, not what you think caused it
- a telemetry capture, `s 1` over serial, covering 20 seconds around the failure
- your `Config.h`
- a photo, if it is mechanical

The angle, surface and speed traces together usually make the cause obvious.

## Changing the code

A few things to know before you send a pull request.

**The firmware and the simulator have to agree.** `KalmanFilter.cpp` and `kalman.js` are the
same algorithm, and so are `SlidingModeController.cpp` and the sliding mode part of
`controllers.js`. The same goes for the numbers in `Config.h` and `js/params.js`. If you
change one, change the other, or the simulator stops predicting what the robot does.

**Check the firmware still compiles.** CI does this on every push, but locally:

```
arduino-cli compile --fqbn arduino:avr:mega firmware/SelfBalancingRobot
```

It should build with no warnings from the project's own files.

**Check the simulator still balances.**

```
node tools/sim-check.js
```

Eight scenarios, both controllers, deterministic. If your change makes one fail, say so in
the pull request and explain why it is the right trade.

**Keep it dependency-free.** The firmware uses only `Wire` and `EEPROM`. The simulator is
plain scripts with no build step. Both choices are deliberate: they are what makes the
project still work years from now and readable without tooling. A pull request that adds a
package manager needs a strong argument.

## Style

Follow what is already there rather than any particular guide. In short: four-space indent in
C++, two in JavaScript, comments that explain *why* rather than restating the code, and
British or American spelling, whichever you are used to, as long as it is consistent within a
file.

Comments earn their place by saying something the code cannot. `/* increment the counter */`
does not.

## Documentation is in English

So that anyone can build the robot, wherever they are. Issues and pull requests in other
languages are fine, but the files in the repository stay in English.

## Licence

Contributions are accepted under the [MIT licence](LICENSE), same as the rest of the
repository. By opening a pull request you agree to that.
