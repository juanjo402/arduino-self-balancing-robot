# Assembly

Order matters here. Two steps in particular are very hard to undo once the robot is
together, and they are flagged where they come up.

Read [the wiring notes](wiring.md) before you start. Have a multimeter to hand.

## 1. Prepare the electronics first

Do all of this on the bench, before anything is bolted to the chassis.

**Set the driver current.** Fit the heatsinks, seat the drivers with `EN` aligned to `EN`,
fit only the MS3 jumper under each, and set Vref to 0.6 V with a multimeter. Doing this
later, with the drivers buried under a deck, is miserable.

**Solve the I2C problem.** Pins 20 and 21 sit under the RAMPS shield and most revisions do
not break them out. Check your board. If there is no I2C header, solder wires to the Mega's
pins 20 and 21, or fit a stacking header, **now**. Once the shield is seated and the robot is
assembled those pins are unreachable and the only way back is to take everything apart.

**Confirm the MPU-6050 answers.** Put the sketch on the Mega with `IMU_TEST_MODE` set to 1
and check you get readings before the sensor is glued to anything.

## 2. Motors into the chassis

Bolt both motors into their mounts with M3 x 10 screws. Do not fully tighten yet.

Lay the assembled frame on a flat surface and check both motor faces sit flat. The two
shafts must be parallel and coaxial. Non-parallel axles make the robot veer when it should
drive straight, and it is a very confusing symptom to chase later. Tighten once you are
happy.

Fit the wheels. Push them fully onto the shafts and tighten the grub screws onto the flat of
each shaft, not onto the round part.

## 3. Route the motor cables

Bring both motor cables up through the chassis before you fit any deck. Leave slack. A cable
that is under tension when the robot leans will eventually pull a connector loose, and
unplugging a motor while powered destroys the driver.

## 4. Mount the electronics

Seat the RAMPS shield on the Mega and mount the pair to the chassis with standoffs. Check
that nothing metal can touch the underside of the Mega.

Plug the motors in: **left motor to X, right motor to Y**. Confirm the coil pairs are
adjacent in the connector, as described in the wiring notes. A split pair makes the motor
buzz and vibrate instead of turning.

## 5. Mount the IMU

This step decides how well the robot works, so take the time.

Mount the MPU-6050 with **double-sided foam tape**, not screws. Stepper motors put a lot of
high-frequency vibration into the frame and the foam is what keeps it out of the
accelerometer.

Place it:

- as close to the wheel axle as the layout allows
- flat, with its axes square to the chassis
- with the **Z axis up** and the **Y axis along the direction of travel**

A millimetre of mounting tilt is a constant angle offset, correctable in software. A
degree of rotation about the vertical axis is not, because it mixes the tilt into the wrong
gyro channel. Line it up properly.

## 6. Battery and switch

Fit the battery **high** in the chassis, not low. A higher centre of mass makes the robot
fall more slowly and easier to balance. Hold it with a strap or zip ties, not tape, and make
sure it cannot shift: a battery that slides changes the centre of mass mid-run and the robot
will lean in whichever direction it moved.

Wire the switch into the battery **positive** lead with 18 AWG silicone wire. Do not use
Dupont jumper wire for battery current.

Leave the battery unplugged until the pre-power checklist is done.

## 7. ESP-01S, if you are fitting one

Mount the 3.3 V regulator and the module together, with the 470 uF capacitor close to the
module's supply pins. Keep the two serial wires short.

Remember the level shifter or the resistor divider on the Mega's TX. The ESP-01S is not 5 V
tolerant.

Skip this whole step if you want. The robot balances without it, and adding it later is
easy.

## 8. Before the first power-up

Run the [pre-power checklist](wiring.md#pre-power-checklist). Then measure the battery
polarity at the connector one more time. RAMPS has no reverse polarity protection.

For the first run, hold the robot in your hand or work over a carpeted floor. It will fall
over. That is what it is meant to do at 35 degrees, and the motors cut, but it still falls
from whatever height it is at.

## 9. Then what

Go to [the tuning guide](tuning.md) and work through it in order, starting with the sign
checks. Do not skip to adjusting gains.

## Take photos as you go

Not for us, for you. Cable routing, the IMU orientation, which motor went into which socket:
you will want all of it in three months when something stops working. Put them in
[`media/photos/`](../media/photos/).
