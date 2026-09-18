# Bill of Materials

Everything needed to build one robot. Prices are rough figures from common European
hobby shops and marketplaces in 2026; they move a lot, so treat them as a budget guide
rather than a quote. Expect **€90–120** in total if you buy the cheap versions of
everything and already own a 3D printer and a soldering iron.

A column marked *critical* means the part is load-bearing for the design: swapping it
changes the firmware, the wiring or the chassis.

## Electronics

| # | Part | Qty | Approx. € | Critical | Notes |
|---|---|---|---|---|---|
| 1 | Arduino Mega 2560 R3 | 1 | 12–35 | yes | A clone is fine. Genuine boards cost three times as much and give nothing extra here. |
| 2 | RAMPS 1.6 shield | 1 | 7–12 | yes | RAMPS 1.4 works identically for this project. 1.6 has better traces and a proper fuse holder. |
| 3 | DRV8825 stepper driver (HW-216 module) | 2 | 2–4 each | yes | Buy four. They die, and a spare pair costs less than a delayed build. |
| 4 | Driver heatsinks, 9×9 mm adhesive | 2–4 | 1 | no | Usually included with the drivers. Fit them. |
| 5 | NEMA 17 stepper, 42×42×40 mm, 1.5–1.8 A, 1.8°/step | 2 | 9–15 each | yes | 17HS4401 or equivalent. See the sizing note below. |
| 6 | MPU-6050 breakout (GY-521) | 1 | 2–4 | yes | Any GY-521 clone. Keep one spare, quality varies. |
| 7 | ESP-01S module | 1 | 2–3 | no | Optional. The robot balances without it. |
| 8 | 3.3 V regulator module, ≥ 500 mA (AMS1117 or buck) | 1 | 1–2 | yes if using ESP | The Mega's 3.3 V pin **cannot** power the ESP-01S. See [wiring](wiring.md). |
| 9 | Logic level shifter or 2 resistors (1 kΩ + 2 kΩ) | 1 | 1 | yes if using ESP | Drops the Mega's 5 V TX to 3.3 V for the ESP RX. |
| 10 | 3S LiPo, 11.1 V, 1300–2200 mAh, ≥ 25C | 1 | 18–30 | yes | Capacity mostly buys runtime; 1500 mAh is a good weight/runtime balance. |
| 11 | LiPo low-voltage alarm | 1 | 2 | no | Cheap insurance against over-discharging the pack. |
| 12 | XT60 connector pair | 1 | 1 | no | Match whatever your battery uses. |
| 13 | Rocker or toggle switch, ≥ 10 A | 1 | 2 | no | Put it on the battery positive lead. |
| 14 | Dupont jumper wires, female–female | 1 set | 3 | no | For the IMU and the ESP. |
| 15 | Silicone wire, 18 AWG red and black | 0.5 m | 2 | no | For the battery lead. Do not use Dupont wire for power. |

### Sizing the motors

The motor has to accelerate the whole robot fast enough to get the wheels back under the
centre of mass. A 40 mm-long NEMA 17 at 1.5 A produces roughly 0.4 N·m of holding torque,
which drives a 1 kg robot on 80 mm wheels with plenty of margin. Shorter 23 mm "pancake"
motors are tempting for weight but leave very little margin once the battery is on board.

Do not exceed **1.5 A per phase** with the DRV8825 unless you add active cooling. The chip
is rated to 2.2 A, but only with a heatsink and airflow it will not get inside this chassis.

## Mechanical

| # | Part | Qty | Approx. € | Notes |
|---|---|---|---|---|
| 16 | Printed chassis | 1 set | ~€3 of filament | See [3D printing](3d-printing.md) and [`hardware/stl/`](../hardware/stl/) |
| 17 | Wheels, 80–90 mm diameter, 5 mm bore | 2 | 6–10 pair | Rubber tyres. Grip matters more than you expect: a slipping wheel makes the controller blind. |
| 18 | M3×10 socket head screws | 8 | 2 | Motor mounting |
| 19 | M3×8 socket head screws | 8 | — | Plate assembly |
| 20 | M3 nuts or heat-set inserts | 16 | 2 | Heat-set inserts are much nicer if you have the tip for them |
| 21 | M3 nylon standoffs, 20–30 mm | 4 | 2 | Deck separation |
| 22 | Zip ties, 2.5 mm | 10 | 1 | Cable management, battery retention |
| 23 | Double-sided foam tape | — | 1 | Mounting the IMU. Foam damps motor vibration into the sensor. |

## Tools

You need a 3D printer, a soldering iron, a **multimeter** (non-negotiable for setting the
driver current), hex keys for M3, and a USB-B cable for the Mega.

## Substitutions that work

- **Arduino Due instead of Mega.** Faster, but 3.3 V logic; RAMPS is designed for 5 V and
  you would need to check every signal. Not recommended unless you enjoy that.
- **A4988 instead of DRV8825.** Works, but tops out at 1/16 microstepping and 1 A in
  practice. Motion is noticeably coarser at low speed, which is exactly where a balancing
  robot lives. Note the two drivers are **not** interchangeable in orientation or in the
  microstepping jumper pattern.
- **MPU-9250 or MPU-6500 instead of MPU-6050.** Register-compatible enough that the driver
  in this firmware works after changing the WHO_AM_I check. The magnetometer is useless for
  balancing anyway.
- **DC gearmotors with encoders instead of steppers.** A legitimate and lighter design, but
  a different project: it needs encoder handling, a different driver, and a controller that
  copes with backlash. The firmware here would not apply.

## Substitutions that do not work

- **Arduino Uno or Nano.** RAMPS is a Mega shield; the pin map does not exist on a Uno.
- **A 2S LiPo (7.4 V).** NEMA 17 motors need voltage headroom to reach useful step rates.
  At 7.4 V the motors lose torque exactly when the robot needs to catch itself.
- **Powering the motors from USB.** Not close to enough current.

## What you do not need

The RAMPS board carries heater MOSFETs, thermistor inputs and endstop headers for a 3D
printer. None of them are used here. Leave the heater terminals empty and do not install
the heater fuses if you would rather not have 11 A available on an unused terminal block.
