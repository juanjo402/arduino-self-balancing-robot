/*
 * Config.h - every tunable number in one place.
 *
 * This is the only file you should need to edit to adapt the firmware to your own
 * robot. The physical parameters must match your build; see docs/theory/dynamics.md
 * for how to measure them, and keep simulation/js/params.js in step so the
 * simulator keeps predicting what the real robot does.
 */

#ifndef CONFIG_H
#define CONFIG_H

/* ------------------------------------------------------------------------- */
/* Build options                                                             */
/* ------------------------------------------------------------------------- */

/* Set to 1 to boot into IMU test mode: the motors stay disabled and the sketch
 * streams raw and filtered sensor values over USB. Use it to verify the sign
 * conventions before you ever let the robot try to balance.
 * See docs/theory/kalman-filter.md, "Getting the sign right". */
#define IMU_TEST_MODE 0

/* Set to 0 to compile out the ESP-01S link on Serial1. */
#define ENABLE_WIRELESS 1

/* Subtract the robot's own acceleration from the accelerometer before using it
 * as a tilt measurement.
 *
 * Leave this on. It is not an optimisation: a balancing robot holding a steady
 * lean reads zero tilt on its accelerometer, because the acceleration needed to
 * hold the lean cancels the lean itself. Without this correction the filter has
 * no absolute reference, the estimate walks away, and the robot falls over
 * after a few seconds with nothing visibly wrong. The switch exists so the
 * effect can be demonstrated, not because 0 is a sensible setting.
 *
 * See the long comment in IMU::update() and docs/theory/kalman-filter.md. */
#define COMPENSATE_ACCEL 1

/* ------------------------------------------------------------------------- */
/* Timing                                                                    */
/* ------------------------------------------------------------------------- */

/* Control loop rate. The robot falls with a time constant near 120 ms, so this
 * needs to stay far above ~50 Hz. 200 Hz leaves comfortable phase margin. */
#define CONTROL_HZ        200
#define CONTROL_DT        (1.0f / (float)CONTROL_HZ)

/* Step pulse generator rate. This is the hard ceiling on step rate, and it costs
 * roughly 20 % of the CPU. Do not raise it without measuring. */
#define STEP_ISR_HZ       20000UL

/* Telemetry stream rate, Hz. Must divide CONTROL_HZ. */
#define TELEMETRY_HZ      50

/* ------------------------------------------------------------------------- */
/* Mechanics                                                                 */
/* ------------------------------------------------------------------------- */

#define STEPS_PER_REV     200      /* 1.8 deg/step NEMA 17                    */
#define MICROSTEPS        16       /* MS3 jumper only, see docs/wiring.md     */
#define WHEEL_RADIUS_M    0.040f   /* loaded radius, with the robot's weight  */
#define WHEEL_BASE_M      0.150f   /* distance between wheel centres          */

#define MICROSTEPS_PER_REV  ((float)STEPS_PER_REV * (float)MICROSTEPS)
#define STEPS_PER_METRE     (MICROSTEPS_PER_REV / (2.0f * 3.14159265f * WHEEL_RADIUS_M))

/* ------------------------------------------------------------------------- */
/* Physical parameters of the body                                           */
/* ------------------------------------------------------------------------- */
/* Nominal design values, NOT measurements. Replace them once the robot exists. */

#define BODY_MASS_KG      0.85f    /* everything except the wheels            */
#define COM_HEIGHT_M      0.105f   /* axle to centre of mass                  */
#define BODY_INERTIA      0.0035f  /* about the centre of mass, kg m^2        */
#define AXLE_DAMPING      0.001f   /* viscous friction, N m s / rad           */
#define GRAVITY           9.81f

/* ------------------------------------------------------------------------- */
/* Actuator limits                                                           */
/* ------------------------------------------------------------------------- */

/* Keep below STEP_ISR_HZ with margin: near the ISR rate the step timing
 * quantises badly and the motion becomes rough. */
#define MAX_STEP_RATE     16000.0f                         /* steps/s        */
#define MAX_SPEED_MPS     (MAX_STEP_RATE / STEPS_PER_METRE) /* ~1.26 m/s      */

/* Acceleration the controller is allowed to ask for. Above the torque the
 * motors can actually deliver the velocity-source model breaks and the robot
 * falls, so this is a real limit, not a comfort setting. */
#define MAX_ACCEL_MPS2    8.0f

/* Yaw rate at full turn command, in steps/s of differential. */
#define MAX_YAW_STEP_RATE 3000.0f

/* Top speed the remote control is allowed to ask for. Well below MAX_SPEED_MPS,
 * because the controller needs speed in reserve to catch the robot. A robot
 * already at its speed limit cannot lean any further and simply falls over. */
#define MAX_DRIVE_SPEED_MPS 0.6f

/* ------------------------------------------------------------------------- */
/* Sliding mode controller                                                   */
/* ------------------------------------------------------------------------- */
/* Starting points from simulation. See docs/theory/sliding-mode-control.md
 * and docs/tuning.md. */

#define SMC_C_THETA       9.0f     /* balance bandwidth                       */
#define SMC_C_V           0.55f    /* speed holding                           */
#define SMC_C_X           0.12f    /* position holding                        */
#define SMC_ETA           8.0f     /* linear reaching rate                    */
#define SMC_K             3.0f     /* switching gain, robustness margin       */
#define SMC_PHI           0.05f    /* boundary layer half-width               */

/* ------------------------------------------------------------------------- */
/* Kalman filter                                                             */
/* ------------------------------------------------------------------------- */

#define KALMAN_Q_ANGLE    0.001f
#define KALMAN_Q_BIAS     0.003f
#define KALMAN_R_MEASURE  0.03f

/* ------------------------------------------------------------------------- */
/* IMU orientation                                                           */
/* ------------------------------------------------------------------------- */

/* Constant offset that cancels a slightly crooked sensor mount. Positive values
 * make the robot think it is leaning further forward than it is, so it will
 * lean back. Adjust until the robot holds station instead of creeping. */
#define ANGLE_OFFSET_DEG  0.0f

/* Flip these to +1 or -1 so that tilting the robot FORWARD gives a POSITIVE
 * angle and a POSITIVE rate. Verify with IMU_TEST_MODE before the first run. */
#define ACCEL_SIGN        (+1.0f)
#define GYRO_SIGN         (+1.0f)

/* Number of samples averaged at startup to find the gyro bias. At 200 Hz, 400
 * samples is two seconds. The robot must be held still for all of it. */
#define GYRO_CALIB_SAMPLES 400

/* ------------------------------------------------------------------------- */
/* Motor direction                                                           */
/* ------------------------------------------------------------------------- */
/* If a wheel turns the wrong way, flip the matching value here rather than
 * rewiring the motor. */

#define INVERT_DIR_L      0
#define INVERT_DIR_R      1        /* the right motor faces the other way     */

/* ------------------------------------------------------------------------- */
/* Safety                                                                    */
/* ------------------------------------------------------------------------- */

/* Beyond this tilt the robot cannot recover, so the motors are cut. Without
 * this it would drive itself across the floor on its side at full speed. */
#define MAX_TILT_DEG      35.0f

/* The robot arms itself once it is held within this angle of upright. */
#define START_TILT_DEG    2.0f

/* Consecutive in-range samples required before arming, to avoid arming while
 * the robot swings through upright on its way to the floor. */
#define START_STABLE_COUNT 50

/* ------------------------------------------------------------------------- */
/* Serial                                                                    */
/* ------------------------------------------------------------------------- */

#define USB_BAUD          115200
#define WIRELESS_BAUD     115200

#endif /* CONFIG_H */
