/*
 * StepperDrive.h - step pulse generation for the two DRV8825 drivers.
 *
 * A Timer1 interrupt runs at STEP_ISR_HZ and drives both motors from phase
 * accumulators: each tick adds the requested step rate to an accumulator, and
 * every time an accumulator passes the ISR rate it emits one step pulse. That
 * gives an average step rate equal to what was asked for, with jitter of at most
 * one ISR period, and it costs the control loop nothing but a variable write.
 *
 * The consequence is that the motors behave as a velocity source: the firmware
 * commands a speed and the wheels turn at that speed. That is the assumption the
 * whole control design rests on. It holds as long as the motors are not asked
 * for more torque than they have, which is what MAX_ACCEL_MPS2 is protecting.
 */

#ifndef STEPPER_DRIVE_H
#define STEPPER_DRIVE_H

#include <stdint.h>

class StepperDrive {
public:
    /* Configures the pins and starts the timer. The drivers come up disabled. */
    void begin();

    /* DRV8825 ENABLE is active low. Disabled means the coils are de-energised
     * and the wheels turn freely, which is what you want while placing the
     * robot or after it has fallen. */
    void enable(bool on);
    bool enabled() const { return m_enabled; }

    /* Signed step rates in steps per second. Positive is forward. Values beyond
     * MAX_STEP_RATE are clamped. */
    void setStepRates(float left, float right);

    /* Immediately stops pulsing, without changing the enable state. */
    void stop();

    /* Cumulative signed step counts, read atomically. */
    int32_t leftSteps() const;
    int32_t rightSteps() const;

    /* Travel of the axle since the last reset, in metres. */
    float positionMetres() const;

    void resetOdometry();

private:
    bool m_enabled = false;
};

#endif /* STEPPER_DRIVE_H */
