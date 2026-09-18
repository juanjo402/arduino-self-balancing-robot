#include <Arduino.h>
#include <util/atomic.h>
#include <util/delay.h>

#include "StepperDrive.h"
#include "Config.h"
#include "Pins.h"

/* --- State shared with the interrupt ------------------------------------ */

static volatile uint32_t s_accL = 0, s_accR = 0;   /* phase accumulators     */
static volatile uint32_t s_rateL = 0, s_rateR = 0; /* magnitude, steps/s     */
static volatile uint8_t  s_dirBits = 0;            /* DIR bits for PORTF     */
static volatile int32_t  s_posL = 0, s_posR = 0;   /* signed step counters   */
static volatile int8_t   s_incL = 1, s_incR = 1;   /* counter direction      */

/*
 * The step interrupt.
 *
 * Order matters here. DIR is written first and the accumulator arithmetic then
 * takes a few microseconds, which comfortably satisfies the DRV8825's 650 ns
 * direction setup time before the pulse goes out. The pulse itself is held for
 * 2 us, above the 1.9 us minimum in the datasheet.
 *
 * PORTF is read-modify-written, so only the STEP and DIR bits are touched and
 * the right motor's ENABLE line on PF2 is preserved.
 */
ISR(TIMER1_COMPA_vect)
{
    uint8_t portf = (PORTF & ~(PORTF_STEP_MASK | PORTF_DIR_MASK)) | s_dirBits;
    PORTF = portf;

    uint8_t pulse = 0;

    s_accL += s_rateL;
    if (s_accL >= STEP_ISR_HZ) {
        s_accL -= STEP_ISR_HZ;
        pulse |= BIT_STEP_L;
        s_posL += s_incL;
    }

    s_accR += s_rateR;
    if (s_accR >= STEP_ISR_HZ) {
        s_accR -= STEP_ISR_HZ;
        pulse |= BIT_STEP_R;
        s_posR += s_incR;
    }

    if (pulse) {
        PORTF = portf | pulse;
        _delay_us(2);
        PORTF = portf;
    }
}

/* --- Public interface --------------------------------------------------- */

void StepperDrive::begin()
{
    pinMode(PIN_STEP_L,   OUTPUT);
    pinMode(PIN_DIR_L,    OUTPUT);
    pinMode(PIN_ENABLE_L, OUTPUT);
    pinMode(PIN_STEP_R,   OUTPUT);
    pinMode(PIN_DIR_R,    OUTPUT);
    pinMode(PIN_ENABLE_R, OUTPUT);

    enable(false);
    stop();

    /* Timer1 in CTC mode, no prescaler, interrupting at STEP_ISR_HZ.
     * At 16 MHz and 20 kHz that is a compare value of 799. */
    ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
        TCCR1A = 0;
        TCCR1B = _BV(WGM12) | _BV(CS10);
        TCNT1  = 0;
        OCR1A  = (uint16_t)((F_CPU / STEP_ISR_HZ) - 1UL);
        TIMSK1 = _BV(OCIE1A);
    }
}

void StepperDrive::enable(bool on)
{
    m_enabled = on;

    /* ENABLE is active low on the DRV8825. The right motor's line is on PORTF,
     * which the interrupt also writes, so the two must not interleave. */
    const uint8_t level = on ? LOW : HIGH;
    digitalWrite(PIN_ENABLE_L, level);
    ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
        digitalWrite(PIN_ENABLE_R, level);
    }

    if (!on) stop();
}

void StepperDrive::setStepRates(float left, float right)
{
    if (left  >  MAX_STEP_RATE) left  =  MAX_STEP_RATE;
    if (left  < -MAX_STEP_RATE) left  = -MAX_STEP_RATE;
    if (right >  MAX_STEP_RATE) right =  MAX_STEP_RATE;
    if (right < -MAX_STEP_RATE) right = -MAX_STEP_RATE;

    const bool fwdL = (left  >= 0.0f);
    const bool fwdR = (right >= 0.0f);

    uint8_t dirBits = 0;
    if (fwdL != (bool)INVERT_DIR_L) dirBits |= BIT_DIR_L;
    if (fwdR != (bool)INVERT_DIR_R) dirBits |= BIT_DIR_R;

    const uint32_t magL = (uint32_t)(fwdL ? left  : -left);
    const uint32_t magR = (uint32_t)(fwdR ? right : -right);

    /* Rate, direction and counter increment must change together, or a single
     * step could be pulsed with the old direction and counted with the new one. */
    ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
        s_dirBits = dirBits;
        s_incL = fwdL ? 1 : -1;
        s_incR = fwdR ? 1 : -1;
        s_rateL = magL;
        s_rateR = magR;
    }
}

void StepperDrive::stop()
{
    ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
        s_rateL = 0;
        s_rateR = 0;
        s_accL = 0;
        s_accR = 0;
    }
}

int32_t StepperDrive::leftSteps() const
{
    int32_t v;
    ATOMIC_BLOCK(ATOMIC_RESTORESTATE) { v = s_posL; }
    return v;
}

int32_t StepperDrive::rightSteps() const
{
    int32_t v;
    ATOMIC_BLOCK(ATOMIC_RESTORESTATE) { v = s_posR; }
    return v;
}

float StepperDrive::positionMetres() const
{
    int32_t l, r;
    ATOMIC_BLOCK(ATOMIC_RESTORESTATE) { l = s_posL; r = s_posR; }
    return (0.5f * (float)(l + r)) / STEPS_PER_METRE;
}

void StepperDrive::resetOdometry()
{
    ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
        s_posL = 0;
        s_posR = 0;
    }
}
