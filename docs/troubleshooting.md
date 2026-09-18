# Troubleshooting

Symptoms first, since that is what you have. Each entry gives the likely causes in the order
worth checking.

## Nothing happens at all

**The LED blinks fast, about 5 Hz.** The MPU-6050 did not answer on I2C. Check that SDA and
SCL actually reach pins 20 and 21, that AD0 is tied to GND, and that the module has 5 V.
This is by far the most common wiring fault on a RAMPS build, because those two pins are
usually not broken out. See the I2C note in [the wiring guide](wiring.md).

**No LED at all and no serial.** The Mega is not powered or the sketch did not upload.

**Serial works but the motors never move.** The robot is probably still in the waiting
state, blinking once per second, because it has not been held near upright long enough.
Hold it steady and vertical for a second. If it still will not arm, the angle estimate is
wrong, so run `IMU_TEST_MODE`.

## It shakes or buzzes instead of balancing

In order of likelihood:

1. **`c_theta` is too high.** Lower it 20 % and see if the shaking stops.
2. **`phi` is too small.** The switching term is chattering. Raise the boundary layer.
3. **The IMU is mounted rigidly.** Motor vibration is reaching the accelerometer. Move it to
   foam tape.
4. **Driver current is too high.** Hot drivers and rough motion. Lower Vref.
5. **The chassis flexes.** Harder to fix. Stiffen the motor mounts.

To tell 1 and 2 apart, look at the surface trace with `s 1`. Ringing across zero is a
boundary layer problem; a sinusoidal angle at a few Hz is the balance gain.

## It creeps slowly in one direction

The mechanical zero is wrong. This is not a gain problem and no gain will fix it.

Trim `ANGLE_OFFSET_DEG`, or send `g off 0.3` over serial, a tenth of a degree at a time
until it holds station. Positive values make it lean back.

If the creep changes direction between runs, the problem is the gyro calibration instead:
the robot was moving during the two-second calibration window. Send `c` and hold it still.

## It balances for a while, then leans further and further and falls

This is the characteristic failure of an angle estimate that is drifting.

1. **Check `COMPENSATE_ACCEL` is 1.** With it off the accelerometer cannot see a lean the
   robot is actively holding, the filter loses its reference, and exactly this happens. The
   full explanation is in [the Kalman notes](theory/kalman-filter.md), and the simulator lets
   you reproduce it in six seconds.
2. **Check the wheels are not slipping.** If the tyres slip, the firmware's idea of its own
   velocity and position is wrong, and so is the acceleration it uses for the compensation.
3. **Check `MAX_SPEED_MPS` is being reached.** If the robot saturates its wheel speed it has
   no authority left. `s 1` and watch the speed field approach its limit before the fall.

## It veers when it should drive straight

- **The motor axles are not parallel.** Check the frame on a flat surface.
- **One wheel is slipping.** Different tyre wear or an uneven floor.
- **A grub screw is loose** on one wheel, so it slips on the shaft under load.
- **Different microstepping** on the two drivers. Check both jumper sets.

## One motor does nothing, or buzzes without turning

- **Split coil pairs.** The most common cause. Two wires of the same coil must be adjacent
  in the connector. Identify the pairs by shorting two wires and feeling the shaft go stiff.
- **The driver is dead.** They fail, usually from being inserted backwards or from a motor
  unplugged while powered. Swap the two drivers between X and Y: if the fault follows the
  driver, it is the driver.
- **Vref is near zero** on that channel.

## The drivers get very hot

Vref too high. The DRV8825 is rated to 2.2 A but only with cooling this chassis does not
have. Set 1.2 A, Vref 0.6 V, for a motor rated 1.5 A. Check the heatsinks are actually
stuck down and making contact.

Warm is normal. Too hot to keep a finger on is not.

## The robot runs off at full speed the instant it arms

Stop. This is a sign error, and it will keep doing it.

Set `IMU_TEST_MODE` to 1 and confirm that tilting forward gives a positive angle **and** a
positive rate. Fix with `ACCEL_SIGN` and `GYRO_SIGN`. If the signs are right, check the motor
directions with `INVERT_DIR_L` and `INVERT_DIR_R`.

## It works on carpet but not on a hard floor

Wheel slip. The controller assumes the wheels do what they are told, and on a smooth floor
under hard acceleration they do not. Better tyres, or lower `MAX_ACCEL_MPS2` so it asks for
less than the tyres can deliver.

## The ESP-01S resets constantly or never connects

Almost always power. The module draws bursts near 300 mA and the Mega's 3.3 V pin supplies
around 50 mA. Use a separate 3.3 V regulator with a 470 uF capacitor close to the module.

Also check `CH_PD` is pulled high. The module does not start without it.

## Telemetry is garbled

Baud mismatch, 115200 on both ends. Or the level shifter on the Mega's TX is missing, in
which case you have been feeding 5 V into a 3.3 V pin and the module may now be damaged.

## It balances but behaves differently every time you power it on

The gyro calibration is picking up movement. The robot must be **completely still** for the
two seconds after power-up. If it is standing on a table that wobbles, hold it.

## Still stuck

Open an issue with the telemetry log. Send `s 1`, capture 20 seconds around the failure, and
include your `Config.h`. The angle, surface and speed traces together usually make the cause
obvious.
