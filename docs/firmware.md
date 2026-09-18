# Firmware

## What you need

- The [Arduino IDE](https://www.arduino.cc/en/software), version 1.8 or 2.x. Either works.
- No external libraries. The sketch uses only `Wire` and `EEPROM`, which ship with the IDE.
  The MPU-6050 is driven directly through its registers, in about eighty lines, so there is
  no third-party dependency to install, break, or wonder about.

## Uploading

1. Open `firmware/SelfBalancingRobot/SelfBalancingRobot.ino`.
2. Tools, Board, **Arduino Mega or Mega 2560**. Processor: **ATmega2560**.
3. Select the port. On Windows it is a COM port; on Linux usually `/dev/ttyUSB0` or
   `/dev/ttyACM0`; on macOS `/dev/cu.usbserial-*`.
4. Upload.

If the upload fails with a sync error, the usual causes are the wrong board selected, a
charge-only USB cable, or a clone board needing the old bootloader (Tools, Processor,
**ATmega2560 (Mega 2560)** versus the alternative entry).

You can upload with the battery connected or not. The Mega is powered from USB either way.

## First run

Do this with the robot **held in your hand**, not standing on a table near the edge.

1. Upload with `IMU_TEST_MODE` set to 1 and confirm the signs, as described in
   [the tuning guide](tuning.md). Do not skip this.
2. Set `IMU_TEST_MODE` back to 0 and upload again.
3. Power up. The LED on pin 13 tells you the state:

| LED | State | What it means |
|---|---|---|
| Fast blink, 5 Hz | Fault | The MPU-6050 did not answer. Check the I2C wiring. |
| Solid on | Calibrating | Hold the robot still. About two seconds. |
| Slow blink, 1 Hz | Waiting | Motors free. Stand it upright to arm it. |
| Brief flash every 2 s | Balancing | Working. |
| Medium blink, 2.5 Hz | Fallen | Past 35 degrees, motors cut. Stand it up again to re-arm. |

4. Hold it upright and steady. After about a quarter of a second within two degrees of
   vertical it arms itself, the motors engage, and it starts balancing.

If it arms while you are still moving it, raise `START_STABLE_COUNT`.

## File layout

Everything lives in one sketch folder, which is what the Arduino IDE expects. The split is
by responsibility rather than by convenience:

| File | Responsibility |
|---|---|
| `SelfBalancingRobot.ino` | State machine, control loop timing, the velocity integrator |
| `Config.h` | Every tunable number. The only file most people need to edit |
| `Pins.h` | RAMPS pin map and the PORTF bit layout the step interrupt uses |
| `IMU.h/.cpp` | MPU-6050 registers, axis conventions, accelerometer compensation |
| `KalmanFilter.h/.cpp` | Two-state angle and bias filter |
| `SlidingModeController.h/.cpp` | The control law |
| `StepperDrive.h/.cpp` | Timer1 step pulse generation and odometry |
| `Settings.h/.cpp` | Gains in EEPROM, so tuning survives a reset |
| `Telemetry.h/.cpp` | The serial protocol, on USB and on the ESP-01S |

## How the loop is put together

```
every 5 ms (200 Hz):
    read commands from USB and the ESP
    compute the acceleration actually applied last period
    read the MPU-6050, compensate it, run the Kalman filter
    run the sliding mode controller           -> commanded acceleration
    integrate and clamp                       -> wheel velocity
    convert and mix with the yaw command      -> step rates
    every 4th pass, emit a telemetry sample
```

Separately, a Timer1 interrupt runs at 20 kHz and turns those step rates into pulses. The
control loop never waits for a motor; it only writes a target rate.

**Timing** is held by advancing a deadline rather than by measuring elapsed time, so `dt` is
exactly 5 ms for the filter and the integrator. If the loop ever falls more than two periods
behind, the deadline resynchronises rather than the loop trying to catch up in a burst.

**Resource use**, from the compiler: about 22 kB of the 253 kB of flash and 1.3 kB of the
8 kB of RAM. The step interrupt costs roughly 20 % of the CPU. There is a lot of headroom
for anything you want to add.

## Serial protocol

Both ports run at 115200 baud and accept the same commands. Lines are terminated with a
newline. Anything the firmware sends that starts with `#` is a human-readable status
message.

### Commands

| Command | Effect |
|---|---|
| `?` | Print the command list |
| `g` | Print the current gains |
| `g <name> <value>` | Set a gain: `ct`, `cv`, `cx`, `eta`, `k`, `phi`, `off` |
| `d <fwd> <turn>` | Drive. Both values from -1 to 1 |
| `s <0\|1\|2>` | Telemetry: off, tagged CSV, or bare numbers for the Serial Plotter |
| `z` | Zero the odometry |
| `c` | Recalibrate the gyro. Hold the robot still |
| `w` | Save the current gains to EEPROM |
| `r` | Restore the compiled-in defaults |

Drive commands expire after 500 ms. A wireless link that drops leaves the robot balancing in
place rather than driving off at the last commanded speed.

### Telemetry

With `s 1`, at 50 Hz:

```
T,<ms>,<state>,<angle_deg>,<rate_dps>,<surface>,<accel_mps2>,<speed_mps>,<position_m>
```

`state` matches the LED table above: 0 fault, 1 calibrating, 2 waiting, 3 balancing,
4 fallen.

With `s 2` the firmware emits four bare numbers instead, which is the format the Arduino
IDE's Serial Plotter expects: angle, rate, surface, speed.

### Gain storage

Gains changed with `g` take effect immediately but live only in RAM. `w` writes them to
EEPROM with a magic number and a checksum; a blank or corrupted block falls back to the
values compiled into `Config.h`. That makes a reset a reliable way back out of a change that
made things worse.

## Changing the configuration

Everything adjustable is in `Config.h` with a comment explaining what it does. The ones
worth knowing about:

- **`COMPENSATE_ACCEL`** — leave it at 1. Setting it to 0 makes the robot fall over after a
  few seconds for reasons that are not visible from the outside. The switch is there to
  demonstrate the effect, and it is explained in [the Kalman notes](theory/kalman-filter.md).
- **`MICROSTEPS`** — must match the jumpers under the drivers, or every distance and speed
  in the controller is wrong by that factor.
- **`ENABLE_WIRELESS`** — set to 0 if you are not fitting the ESP-01S. It saves nothing
  meaningful, but it stops `Serial1` being opened on pins that may not be wired.
- **`MAX_TILT_DEG`** — the angle at which the motors are cut. Lower it while you are
  experimenting and the robot will give up earlier and travel less far across the room.

## Compiling from the command line

Useful for checking a change without opening the IDE, and it is what the CI does:

```
arduino-cli core install arduino:avr
arduino-cli compile --fqbn arduino:avr:mega firmware/SelfBalancingRobot
```

To upload:

```
arduino-cli upload -p COM5 --fqbn arduino:avr:mega firmware/SelfBalancingRobot
```
