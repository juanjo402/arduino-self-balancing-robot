# Wiring

## Read this first

Three mistakes account for almost every dead RAMPS board:

1. **Reversed battery polarity.** There is no reverse-polarity protection on the motor
   input. Check with a multimeter every single time before you plug the battery in.
2. **Inserting a stepper driver backwards.** It will be destroyed the instant you apply
   power, and it may take the motor output stage of the board with it.
3. **Unplugging a motor while powered.** The collapsing coil field produces a voltage spike
   that kills the driver. Always power down before touching a motor connector.

Add to that: a 3S LiPo can dump over 40 A into a short. Fit the switch on the battery
positive lead, use 18 AWG silicone wire for it, and never leave a charged pack connected to
a half-finished board.

> **Verify before you build.** The pin numbers below are the standard RAMPS 1.4/1.6
> assignment, the same one Marlin uses. RAMPS clones are not always faithful. Before you
> solder anything, buzz out at least the two stepper sockets and the endstop headers against
> your own board with a multimeter in continuity mode.

---

## Power tree

The 3S LiPo feeds the RAMPS motor input. RAMPS passes that voltage on to the Arduino's VIN
pin through its onboard diode, so the Mega powers itself from the battery with no USB
connection. Everything else hangs off the Mega's 5 V regulator.

```
  3S LiPo 11.1V
       |
    [switch]             <- 10A+ rocker on the POSITIVE lead
       |
    [XT60]
       |
       v
  RAMPS "5A" input       <- the terminal pair nearer the small fuse, NOT the 11A bed input
       |
       +---> DRV8825 x2 ---> NEMA 17 x2      (motor power, 11.1 V)
       |
       +---> diode D1 ---> Arduino Mega VIN
                               |
                               +---> Mega 5 V regulator
                                         |
                                         +---> RAMPS logic
                                         +---> MPU-6050 VCC (5 V)
                                         +---> 3.3 V regulator ---> ESP-01S
```

Two things people get wrong here.

**Do not use the 11 A input.** On RAMPS that terminal feeds only the heated-bed MOSFET,
which this project never uses. The 5 A terminal is the one that feeds the stepper drivers
and the Arduino.

**Do not power the ESP-01S from the Mega's 3.3 V pin.** That pin is fed by the USB-serial
chip's small regulator and supplies around 50 mA. The ESP-01S draws bursts approaching
300 mA when the radio transmits. It will brown out and reset in a loop. Use a separate
3.3 V regulator fed from 5 V, with a 470 uF capacitor across its output close to the module.

While you are on USB and battery at the same time, the Mega is being fed from both sources.
That is normal on a genuine board but worth avoiding on clones. Unplug USB once the firmware
is loaded.

---

## Stepper motors

The left motor goes in the **X** socket, the right motor in the **Y** socket. That choice is
arbitrary but the firmware assumes it.

| Signal | RAMPS socket | Arduino pin | Firmware constant |
|---|---|---|---|
| Left STEP | X | 54 (A0) | `PIN_STEP_L` |
| Left DIR | X | 55 (A1) | `PIN_DIR_L` |
| Left ENABLE | X | 38 | `PIN_ENABLE_L` |
| Right STEP | Y | 60 (A6) | `PIN_STEP_R` |
| Right DIR | Y | 61 (A7) | `PIN_DIR_R` |
| Right ENABLE | Y | 56 (A2) | `PIN_ENABLE_R` |

ENABLE is **active low** on the DRV8825: driving it low energises the coils. The firmware
holds it high until the robot is upright, so the motors are free to turn while you place it.

### Identifying the motor coils

A NEMA 17 has four wires forming two coils, and the pairing is what matters, not the colours.
With the motor disconnected, touch two wires together and turn the shaft by hand. If it
suddenly feels notchy and resistant, those two are a pair. The other two are the second pair.

Wire each pair to adjacent pins of the RAMPS motor connector: pair A to pins 1 and 2, pair B
to pins 3 and 4. A pair split across the connector makes the motor buzz and vibrate without
turning. If a motor runs the wrong way, do not rewire it. Flip `INVERT_DIR_L` or
`INVERT_DIR_R` in [`Config.h`](../firmware/SelfBalancingRobot/Config.h) instead.

### Microstepping jumpers

Under each driver socket RAMPS has three jumper positions, MS1, MS2 and MS3, which connect
to the driver's M0, M1 and M2 inputs. **The DRV8825 table is not the same as the A4988's.**

| MS1 (M0) | MS2 (M1) | MS3 (M2) | DRV8825 mode |
|---|---|---|---|
| open | open | open | Full step |
| fitted | open | open | 1/2 |
| open | fitted | open | 1/4 |
| fitted | fitted | open | 1/8 |
| open | open | fitted | **1/16, use this** |
| fitted | open | fitted | 1/32 |

**Install the MS3 jumper only.** That gives 1/16 microstepping, so 3200 microsteps per
revolution. It is smooth and quiet while staying comfortably inside what a 16 MHz Mega can
pulse: the firmware's step interrupt runs at 20 kHz and the speed is capped at 16000
steps/s, about 5 revolutions per second.

If you change microstepping, change `MICROSTEPS` in `Config.h` to match. Otherwise every
distance and speed in the controller is wrong by that factor.

### Driver orientation and current limit

The DRV8825 module sits in the socket rotated 180 degrees relative to where an A4988 would
go. Do not trust that description though. Find the pin labelled `EN` or `ENABLE` on the
driver board's silkscreen and line it up with the `EN` label printed on the RAMPS socket. If
the labels agree, the orientation is right.

Set the current limit with the trimmer potentiometer before the first run, with the motors
connected and power on but the Mega not driving anything.

1. Find the sense resistors on the driver, the two small black parts marked `R100`. `R100`
   means 0.1 ohm, which is what the formula below assumes. Some cheap modules ship with
   `R050` or `R200` and need a different formula, so check yours.
2. Measure between the trimmer's metal top and GND with a multimeter.
3. For 0.1 ohm sense resistors, the current limit is `Vref x 2`.
4. A motor rated 1.5 A should be set to about 1.2 A, so **Vref = 0.6 V**. Running at 80 % of
   the rating keeps the driver cool enough to survive inside a closed chassis.
5. Turn the trimmer in small steps. It is multi-turn on some modules and single-turn on
   others, and going too fast is how people end up at 2 A by accident.

Fit the heatsinks. Check the driver temperature by hand after the first minute of balancing.
Uncomfortably hot to touch means turn the current down.

---

## MPU-6050

| MPU-6050 pin | Connects to | Note |
|---|---|---|
| VCC | 5 V | The GY-521 board has its own 3.3 V regulator |
| GND | GND | |
| SDA | Mega pin 20 | |
| SCL | Mega pin 21 | |
| AD0 | GND | Sets the I2C address to `0x68` |
| INT | not connected | The firmware polls, the interrupt is unused |

> **The I2C problem with RAMPS.** Pins 20 and 21 sit under the shield and most RAMPS
> revisions do not break them out. Check your board for a header labelled I2C or SDA/SCL
> before assuming anything. If there is none, the usual solutions are to solder a pair of
> wires directly to the Mega's pins 20 and 21 before seating the shield, or to fit a stacking
> header so those two pins stay reachable. Do this before the robot is assembled, because
> afterwards those pins are unreachable.

### Mounting the sensor

This matters as much as the wiring. Mount the MPU-6050 with double-sided foam tape, as close
to the wheel axle as you can, with the board flat and its axes square to the chassis.

- **Foam, not rigid screws.** Stepper motors put a lot of high-frequency vibration into the
  frame. The accelerometer picks all of it up, and vibration is the most common cause of a
  robot that shakes instead of balancing.
- **Close to the axle.** The accelerometer measures the acceleration of the point where it
  sits. Mounted high up, it sees the tangential acceleration of the robot rocking, which
  looks like a tilt that is not there.
- **Square.** Any mounting tilt shows up as a constant angle offset. It is correctable in
  software with `ANGLE_OFFSET_DEG`, but start from something close to zero.

The firmware expects the accelerometer's **Z axis pointing up** and the **Y axis pointing
along the direction of travel**, so tilt is measured about the X axis. If your mounting
differs, change the axis mapping in `IMU.cpp` rather than bending the bracket.

---

## ESP-01S, optional

The robot balances perfectly well without it. Add it when you want live telemetry, gain
tuning from a browser and remote driving.

The Mega's `Serial1` lives on pins 18 (TX1) and 19 (RX1), which on RAMPS are the **Z-min and
Z-max endstop headers**. Each of those headers gives you the signal pin plus GND and 5 V,
which makes them a convenient breakout. Confirm your board has no pull-up resistors or RC
filtering fitted on the endstop inputs before using them for serial.

| ESP-01S pin | Connects to | Note |
|---|---|---|
| VCC | 3.3 V regulator output | Never the Mega's 3.3 V pin |
| GND | Common ground | Must share ground with the Mega |
| CH_PD (EN) | 3.3 V through 10 kOhm | The module does not start without this held high |
| RST | floating, or 3.3 V through 10 kOhm | |
| TXD | Mega pin 19 (RX1) | Direct. The Mega reads 3.3 V as a valid logic high |
| RXD | Mega pin 18 (TX1) via divider | Needs level shifting, see below |
| GPIO0 | floating in use, pull low to flash | |
| GPIO2 | floating | |

The Mega's TX is 5 V and the ESP-01S is not 5 V tolerant. Either use a level shifter module,
or a resistor divider: Mega pin 18 through 1 kOhm to ESP RXD, and ESP RXD through 2 kOhm to
GND. That gives 3.3 V at the ESP.

Serial1 runs at 115200 baud. The command and telemetry protocol is documented in
[the firmware guide](firmware.md#serial-protocol).

---

## Unused RAMPS hardware

RAMPS is a 3D printer board, so most of it is idle here. Leave the heater terminals (D8, D9,
D10) empty, leave the thermistor inputs unconnected, and consider not fitting the 11 A fuse,
so that current is never available on a terminal block you will not use. The onboard LED on
pin 13 is free, and the firmware uses it as a status indicator.

---

## Pre-power checklist

Before the battery goes in for the first time:

- [ ] Battery polarity confirmed with a multimeter at the connector
- [ ] Drivers seated in the correct orientation, `EN` aligned with `EN`
- [ ] Only the MS3 jumper fitted under each driver
- [ ] Vref set to 0.6 V on both drivers
- [ ] Motor coil pairs correct, connectors fully seated
- [ ] MPU-6050 reachable on I2C, AD0 tied to GND
- [ ] Nothing connected to the heater terminals
- [ ] Robot lying on its side or held, not free to run off the bench
