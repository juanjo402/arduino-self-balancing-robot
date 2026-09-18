/*
 * SelfBalancingRobot
 *
 * Two-wheeled inverted pendulum on an Arduino Mega 2560 with a RAMPS 1.6 shield,
 * two DRV8825 drivers, NEMA 17 steppers and an MPU-6050.
 *
 * Tilt is estimated with a two-state Kalman filter and the robot is stabilised
 * by a sliding mode controller. The whole design, including how to tune it, is
 * documented in the repository:
 *
 *   docs/theory/dynamics.md              the model everything rests on
 *   docs/theory/kalman-filter.md         how the angle is estimated
 *   docs/theory/sliding-mode-control.md  how the wheels are commanded
 *   docs/tuning.md                       what to change, and in what order
 *
 * Before the first run set IMU_TEST_MODE to 1 in Config.h and confirm the sign
 * conventions. A sign error here makes the robot accelerate itself into the
 * floor at full speed on the first attempt.
 *
 * MIT licensed. See LICENSE.
 */

#include "Config.h"
#include "Pins.h"
#include "IMU.h"
#include "StepperDrive.h"
#include "SlidingModeController.h"
#include "Settings.h"
#include "Telemetry.h"

/* --- State machine ------------------------------------------------------ */

enum RobotState : uint8_t {
    STATE_FAULT      = 0,   /* the IMU did not answer; nothing else can run   */
    STATE_CALIBRATING = 1,  /* averaging the gyro bias, hold the robot still  */
    STATE_WAITING    = 2,   /* motors free, waiting to be stood upright       */
    STATE_BALANCING  = 3,   /* the interesting one                            */
    STATE_FALLEN     = 4    /* past the recoverable tilt, motors cut          */
};

static IMU                   imu;
static StepperDrive          drive;
static SlidingModeController smc;
static Telemetry             telem;
static RobotSettings         settings;

static RobotState s_state = STATE_CALIBRATING;

/* The velocity integrator. This is the controller's only internal memory of
 * where it has been, and clamping it is what keeps it from winding up. */
static float s_vCmd = 0.0f;

/* Position reference, advanced by the drive command so the robot holds station
 * when nobody is driving it. */
static float s_xRef = 0.0f;

static float s_lastAccel = 0.0f;

/* The axle acceleration actually delivered over the previous control period.
 * The IMU needs it to cancel the robot's own motion out of the accelerometer,
 * which is what stops the angle estimate drifting; see IMU::update(). */
static float s_appliedAccel = 0.0f;
static float s_vCmdPrev = 0.0f;
static uint16_t s_stableCount = 0;
static uint32_t s_nextLoopUs = 0;
static uint8_t  s_telemetryDivider = 0;

static const uint32_t LOOP_PERIOD_US = 1000000UL / CONTROL_HZ;

/* ----------------------------------------------------------------------- */

static void applySettings()
{
    smc.setGains(settings.gains);
    imu.setAngleOffsetDeg(settings.angleOffsetDeg);

    if (!smc.gainsValid()) {
        telem.log("warning: cv is close to m*l/J, the controller has little "
                  "authority over the sliding surface");
    }
}

static void enterWaiting()
{
    drive.enable(false);
    drive.stop();
    smc.reset();
    s_vCmd = 0.0f;
    s_vCmdPrev = 0.0f;
    s_appliedAccel = 0.0f;
    s_stableCount = 0;
    s_state = STATE_WAITING;
}

static void arm()
{
    drive.resetOdometry();
    drive.enable(true);
    smc.reset();
    s_vCmd = 0.0f;
    s_vCmdPrev = 0.0f;
    s_appliedAccel = 0.0f;
    s_xRef = 0.0f;
    s_state = STATE_BALANCING;
    telem.log("balancing");
}

static void updateLed()
{
    const uint32_t t = millis();

    switch (s_state) {
    case STATE_FAULT:
        digitalWrite(PIN_LED, (t % 200) < 100);          /* fast panic blink */
        break;
    case STATE_CALIBRATING:
        digitalWrite(PIN_LED, HIGH);                     /* solid            */
        break;
    case STATE_WAITING:
        digitalWrite(PIN_LED, (t % 1000) < 500);         /* slow blink       */
        break;
    case STATE_BALANCING:
        digitalWrite(PIN_LED, (t % 2000) < 60);          /* brief heartbeat  */
        break;
    case STATE_FALLEN:
        digitalWrite(PIN_LED, (t % 400) < 200);          /* medium blink     */
        break;
    }
}

#if IMU_TEST_MODE
/*
 * Sign check. The motors never move in this mode.
 *
 * Tilt the robot FORWARD and confirm that both the angle and the rate read
 * POSITIVE. If the angle is wrong, flip ACCEL_SIGN; if the rate is wrong, flip
 * GYRO_SIGN. See docs/theory/kalman-filter.md.
 */
static void runImuTest()
{
    Serial.println(F("# IMU test mode, motors disabled"));
    Serial.println(F("# tilt FORWARD: angle and rate must both go POSITIVE"));
    Serial.println(F("# ax ay az gx | accel_deg kalman_deg rate_dps bias_dps"));

    for (;;) {
        imu.update(CONTROL_DT, 0.0f);   /* the wheels are not moving */

        Serial.print(imu.rawAx()); Serial.print(' ');
        Serial.print(imu.rawAy()); Serial.print(' ');
        Serial.print(imu.rawAz()); Serial.print(' ');
        Serial.print(imu.rawGx()); Serial.print(F(" | "));
        Serial.print(imu.accelAngle() * 57.2957795f, 2); Serial.print(' ');
        Serial.print(imu.angleDeg(), 2);                 Serial.print(' ');
        Serial.print(imu.rate() * 57.2957795f, 2);       Serial.print(' ');
        Serial.println(imu.gyroBias() * 57.2957795f, 3);

        delay(50);
        updateLed();
    }
}
#endif

/* ----------------------------------------------------------------------- */

void setup()
{
    pinMode(PIN_LED, OUTPUT);

    telem.begin();
    delay(200);
    telem.log("self-balancing robot starting");

    /* Bring the motors up disabled, before anything that might block. */
    drive.begin();
    drive.enable(false);

    settingsLoad(settings);          /* falls back to Config.h defaults */
    smc.begin(settings.gains);

    if (!imu.begin()) {
        telem.log("error: no response from the MPU-6050, check I2C wiring "
                  "and that AD0 is tied to GND");
        s_state = STATE_FAULT;
        return;
    }
    applySettings();

#if IMU_TEST_MODE
    runImuTest();                    /* never returns */
#endif

    s_state = STATE_CALIBRATING;
    telem.log("calibrating gyro, hold the robot still");
    if (!imu.calibrate()) {
        telem.log("error: I2C failed during calibration");
        s_state = STATE_FAULT;
        return;
    }
    telem.log("calibrated, stand the robot upright to arm it");

    enterWaiting();
    s_nextLoopUs = micros();
}

void loop()
{
    /* --- Fixed-rate gate ------------------------------------------------ */
    /* Cadence is held by advancing a deadline rather than by measuring the
     * elapsed time, so dt stays exactly CONTROL_DT and the filter and the
     * integrator see a constant step. If the loop ever falls more than two
     * periods behind, the deadline is resynchronised instead of the loop
     * trying to catch up in a burst. */

    const uint32_t now = micros();
    if ((int32_t)(now - s_nextLoopUs) < 0) return;

    s_nextLoopUs += LOOP_PERIOD_US;
    if ((int32_t)(now - s_nextLoopUs) > (int32_t)(2 * LOOP_PERIOD_US)) {
        s_nextLoopUs = now + LOOP_PERIOD_US;
    }

    updateLed();

    /* --- Commands ------------------------------------------------------- */

    bool settingsChanged = false;
    telem.poll(settings, settingsChanged);
    if (settingsChanged) applySettings();

    if (s_state == STATE_FAULT) return;

    if (telem.takeZeroRequest()) {
        drive.resetOdometry();
        s_xRef = 0.0f;
        telem.log("odometry zeroed");
    }

    if (telem.takeRecalibrateRequest()) {
        enterWaiting();
        s_state = STATE_CALIBRATING;
        telem.log("recalibrating, hold the robot still");
        if (!imu.calibrate()) {
            telem.log("error: I2C failed during calibration");
            s_state = STATE_FAULT;
            return;
        }
        enterWaiting();
        s_nextLoopUs = micros() + LOOP_PERIOD_US;
        return;
    }

    /* --- Sense ---------------------------------------------------------- */

    /* How much the axle actually changed speed over the last control period.
     * The clamped integrator makes this exact, and the IMU uses it to remove
     * the robot's own acceleration from the accelerometer reading. */
    s_appliedAccel = (s_vCmd - s_vCmdPrev) / CONTROL_DT;
    s_vCmdPrev = s_vCmd;

    imu.update(CONTROL_DT, s_appliedAccel);

    const float theta    = imu.angle();
    const float thetaDot = imu.rate();
    const float tiltDeg  = imu.angleDeg();

    /* --- Act ------------------------------------------------------------ */

    switch (s_state) {

    case STATE_WAITING:
    case STATE_FALLEN:
        /* Motors are free. Arm only after the robot has been held near upright
         * for a while, so that swinging through vertical on the way to the
         * floor does not trigger it. */
        if (fabs(tiltDeg) < START_TILT_DEG) {
            if (++s_stableCount >= START_STABLE_COUNT) {
                arm();
            }
        } else {
            s_stableCount = 0;
        }
        s_lastAccel = 0.0f;
        break;

    case STATE_BALANCING: {
        if (fabs(tiltDeg) > MAX_TILT_DEG) {
            telem.log("fallen, motors cut");
            drive.enable(false);
            drive.stop();
            smc.reset();
            s_vCmd = 0.0f;
            s_vCmdPrev = 0.0f;
            s_appliedAccel = 0.0f;
            s_stableCount = 0;
            s_state = STATE_FALLEN;
            break;
        }

        const DriveCommand dc = telem.drive();
        const float vRef = dc.forward * MAX_DRIVE_SPEED_MPS;

        /* Advance the position reference at the requested speed, so that with no
         * drive command the reference stands still and the robot holds station
         * instead of drifting. */
        s_xRef += vRef * CONTROL_DT;

        const float x = drive.positionMetres();

        /* The commanded velocity is used as the measured velocity. With stepper
         * motors that is not an approximation: the wheels turn at the rate they
         * are pulsed, provided the motors are not being asked for more torque
         * than they have. */
        const float u = smc.update(theta, thetaDot, x, s_vCmd, s_xRef, vRef);
        s_lastAccel = u;

        /* Integrate to a velocity. Clamping the integrator here is the whole of
         * the anti-windup: held against a wall the robot cannot accumulate a
         * velocity command it would release all at once. */
        s_vCmd += u * CONTROL_DT;
        if (s_vCmd >  MAX_SPEED_MPS) s_vCmd =  MAX_SPEED_MPS;
        if (s_vCmd < -MAX_SPEED_MPS) s_vCmd = -MAX_SPEED_MPS;

        const float stepRate = s_vCmd * STEPS_PER_METRE;
        const float yaw      = dc.turn * MAX_YAW_STEP_RATE;

        drive.setStepRates(stepRate - yaw, stepRate + yaw);
        break;
    }

    default:
        break;
    }

    /* --- Report --------------------------------------------------------- */

    if (++s_telemetryDivider >= (CONTROL_HZ / TELEMETRY_HZ)) {
        s_telemetryDivider = 0;

        TelemetrySample sample;
        sample.ms       = millis();
        sample.state    = (uint8_t)s_state;
        sample.angleDeg = tiltDeg;
        sample.rateDps  = thetaDot * 57.2957795f;
        sample.surface  = smc.surface();
        sample.accel    = s_lastAccel;
        sample.speed    = s_vCmd;
        sample.position = drive.positionMetres();

        telem.send(sample);
    }
}
