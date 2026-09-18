/*
 * Pins.h - RAMPS 1.4 / 1.6 pin map for the Arduino Mega 2560.
 *
 * These are the standard RAMPS assignments, the same ones Marlin uses. Clones are
 * not always faithful: verify against your own board with a multimeter before you
 * trust them. See docs/wiring.md.
 */

#ifndef PINS_H
#define PINS_H

/* --- Stepper drivers ---------------------------------------------------- */
/* Left motor in the X socket, right motor in the Y socket. */

#define PIN_STEP_L        54   /* A0, PF0 */
#define PIN_DIR_L         55   /* A1, PF1 */
#define PIN_ENABLE_L      38   /* PD7     */

#define PIN_STEP_R        60   /* A6, PF6 */
#define PIN_DIR_R         61   /* A7, PF7 */
#define PIN_ENABLE_R      56   /* A2, PF2 */

/*
 * All four STEP and DIR signals happen to land on PORTF, which lets the step
 * interrupt drive both motors with a single port write. The bit numbers below
 * MUST agree with the pin numbers above; if you remap the pins, remap these too.
 *
 *   pin 54 = PF0    pin 55 = PF1    pin 56 = PF2
 *   pin 60 = PF6    pin 61 = PF7
 */
#define BIT_STEP_L        (1 << 0)
#define BIT_DIR_L         (1 << 1)
#define BIT_ENABLE_R      (1 << 2)
#define BIT_STEP_R        (1 << 6)
#define BIT_DIR_R         (1 << 7)

/* The bits the step ISR owns. Everything else in PORTF is preserved. */
#define PORTF_STEP_MASK   (BIT_STEP_L | BIT_STEP_R)
#define PORTF_DIR_MASK    (BIT_DIR_L | BIT_DIR_R)

/* --- Status ------------------------------------------------------------- */

#define PIN_LED           13   /* the LED already on the Mega */

/*
 * --- I2C ---------------------------------------------------------------
 * SDA is pin 20 and SCL is pin 21, handled by the Wire library. On most RAMPS
 * revisions these are not broken out and sit under the shield; see the I2C note
 * in docs/wiring.md before assembling the robot, because afterwards they are
 * unreachable.
 *
 * --- Serial ------------------------------------------------------------
 * Serial  (USB)  : pins 0 and 1, used for debugging from a PC.
 * Serial1 (ESP)  : pins 18 (TX1) and 19 (RX1), which on RAMPS are the Z-min and
 *                  Z-max endstop headers.
 */

#endif /* PINS_H */
