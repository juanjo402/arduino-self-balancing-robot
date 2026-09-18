#include <Arduino.h>
#include <Wire.h>
#include <math.h>

#include "IMU.h"
#include "Config.h"

/* --- MPU-6050 registers ------------------------------------------------- */

static const uint8_t MPU_ADDR        = 0x68;  /* AD0 tied low */
static const uint8_t REG_SMPLRT_DIV  = 0x19;
static const uint8_t REG_CONFIG      = 0x1A;
static const uint8_t REG_GYRO_CONFIG = 0x1B;
static const uint8_t REG_ACCEL_CONFIG= 0x1C;
static const uint8_t REG_ACCEL_XOUT  = 0x3B;
static const uint8_t REG_PWR_MGMT_1  = 0x6B;
static const uint8_t REG_WHO_AM_I    = 0x75;

/* Full scale choices. Both are set wider than strictly necessary so that a hard
 * fall or a vibration spike does not clip the reading, which would make the
 * filter briefly blind exactly when it matters. */
static const float GYRO_LSB_PER_DPS  = 65.5f;    /* +/- 500 deg/s */
static const float ACCEL_LSB_PER_G   = 8192.0f;  /* +/- 4 g       */
static const float ACCEL_MS2_PER_LSB = 9.81f / ACCEL_LSB_PER_G;

static const float DEG_TO_RAD_F = 0.017453292f;
static const float RAD_TO_DEG_F = 57.29577951f;

bool IMU::writeReg(uint8_t reg, uint8_t value)
{
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(reg);
    Wire.write(value);
    return Wire.endTransmission() == 0;
}

bool IMU::begin()
{
    Wire.begin();
    Wire.setClock(400000);

    /* Is anything there? */
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(REG_WHO_AM_I);
    if (Wire.endTransmission(false) != 0) return false;
    if (Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)1) != 1) return false;
    const uint8_t who = Wire.read();
    /* 0x68 for the MPU-6050, 0x70 for the MPU-6500, 0x71 for the MPU-9250.
     * The register map used here is common to all of them. */
    if (who != 0x68 && who != 0x70 && who != 0x71) return false;

    if (!writeReg(REG_PWR_MGMT_1, 0x01)) return false;  /* wake, clock from gyro X */
    delay(10);

    /* Digital low-pass at roughly 44 Hz. This is the first line of defence
     * against stepper vibration reaching the accelerometer. */
    if (!writeReg(REG_CONFIG, 0x03)) return false;

    /* Sample rate = 1 kHz / (1 + div). div = 4 gives 200 Hz, matching the
     * control loop, so every loop gets a fresh sample and none is wasted. */
    if (!writeReg(REG_SMPLRT_DIV, 0x04)) return false;

    if (!writeReg(REG_GYRO_CONFIG,  0x08)) return false;  /* +/- 500 deg/s */
    if (!writeReg(REG_ACCEL_CONFIG, 0x08)) return false;  /* +/- 4 g       */

    delay(50);

    m_kalman.begin(KALMAN_Q_ANGLE, KALMAN_Q_BIAS, KALMAN_R_MEASURE);
    m_angleOffsetRad = ANGLE_OFFSET_DEG * DEG_TO_RAD_F;
    return true;
}

void IMU::setAngleOffsetDeg(float deg)
{
    m_angleOffsetRad = deg * DEG_TO_RAD_F;
}

float IMU::angleOffsetDeg() const
{
    return m_angleOffsetRad * RAD_TO_DEG_F;
}

bool IMU::readRaw()
{
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(REG_ACCEL_XOUT);
    if (Wire.endTransmission(false) != 0) return false;
    if (Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)14) != 14) return false;

    /* Read into a buffer first. Writing this as (Wire.read() << 8) | Wire.read()
     * would be a bug: C++ does not specify which side of the | is evaluated
     * first, so the two bytes could come out swapped depending on the compiler. */
    uint8_t buf[14];
    for (uint8_t i = 0; i < 14; ++i) {
        buf[i] = Wire.read();
    }

    m_ax = (int16_t)(((uint16_t)buf[0]  << 8) | buf[1]);
    m_ay = (int16_t)(((uint16_t)buf[2]  << 8) | buf[3]);
    m_az = (int16_t)(((uint16_t)buf[4]  << 8) | buf[5]);
    /* buf[6..7] is the temperature, unused here. */
    m_gx = (int16_t)(((uint16_t)buf[8]  << 8) | buf[9]);
    m_gy = (int16_t)(((uint16_t)buf[10] << 8) | buf[11]);
    m_gz = (int16_t)(((uint16_t)buf[12] << 8) | buf[13]);

    return true;
}

bool IMU::calibrate()
{
    /*
     * The robot must be held still for the whole of this call.
     *
     * Both averages are taken over the same window in one pass, so it takes
     * about two seconds rather than four.
     *
     * The angle is averaged rather than taken from a single reading. One sample
     * carries a degree or two of noise, and seeding the filter with that error
     * is enough to start the robot drifting: it would hold the wrong angle, so
     * it would have to keep accelerating to stay there, so the wheels would
     * eventually saturate and it would fall over.
     */
    float gyroSum = 0.0f;
    float angleSum = 0.0f;

    for (int i = 0; i < GYRO_CALIB_SAMPLES; ++i) {
        if (!readRaw()) return false;
        gyroSum += (float)m_gx;
        angleSum += atan2f(-ACCEL_SIGN * (float)m_ay, (float)m_az);
        delay(1000 / CONTROL_HZ);
    }

    m_gyroBiasCounts = gyroSum / (float)GYRO_CALIB_SAMPLES;

    const float seed = angleSum / (float)GYRO_CALIB_SAMPLES - m_angleOffsetRad;

    /* The startup bias is already subtracted from the gyro reading in update(),
     * so the filter's own bias state starts at zero and tracks only the drift
     * from here on. */
    m_kalman.reset(seed, 0.0f);
    m_angle = seed;
    m_rate = 0.0f;
    m_accelAngle = seed;
    m_rawAccelAngle = seed;

    return true;
}

void IMU::update(float dt, float knownAccel)
{
    if (!readRaw()) return;   /* keep the last estimate on a dropped read */

    /*
     * Body-frame specific force in real units. The conversion matters here,
     * unlike in a plain atan2 where the scale cancels, because the term
     * subtracted below is an acceleration in m/s^2.
     *
     * ACCEL_SIGN is applied to the forward axis rather than to the final angle,
     * so a mirrored sensor mounting stays consistent with the compensation term
     * as well as with gravity.
     */
    float fy = ACCEL_SIGN * (float)m_ay * ACCEL_MS2_PER_LSB;
    float fz = (float)m_az * ACCEL_MS2_PER_LSB;

    m_rawAccelAngle = atan2f(-fy, fz) - m_angleOffsetRad;

    /*
     * Subtract the robot's own linear acceleration.
     *
     * This is not a refinement. It is what makes the estimate work at all.
     *
     * To hold a lean of theta the robot must accelerate at about g*tan(theta),
     * and that acceleration appears in the accelerometer as an apparent tilt of
     * exactly the opposite sign. The two cancel, so a balancing robot holding a
     * steady lean reads ZERO tilt on its accelerometer no matter how far over it
     * actually is.
     *
     * The accelerometer is therefore blind to precisely the thing it is there to
     * measure. The filter loses its only absolute reference, the gyro bias state
     * quietly absorbs the error, and the robot falls over some seconds later for
     * no visible reason. In simulation, with everything else identical, this one
     * term is the difference between falling after six seconds and standing
     * indefinitely.
     *
     * On a stepper robot the correction is free: the firmware sets the wheel
     * speed, so it knows its own acceleration exactly. The previous angle
     * estimate is accurate enough to rotate that acceleration into the body
     * frame.
     */
#if COMPENSATE_ACCEL
    fy -= knownAccel * cosf(m_angle);
    fz -= knownAccel * sinf(m_angle);
#else
    (void)knownAccel;
#endif

    m_accelAngle = atan2f(-fy, fz) - m_angleOffsetRad;

    /* Gyro rate about X, with the startup bias removed. The Kalman filter
     * refines that bias continuously from here on. */
    const float gyroDps = GYRO_SIGN * ((float)m_gx - m_gyroBiasCounts) / GYRO_LSB_PER_DPS;
    const float gyroRad = gyroDps * DEG_TO_RAD_F;

    m_angle = m_kalman.update(m_accelAngle, gyroRad, dt);
    m_rate  = m_kalman.rate();
}

float IMU::angleDeg() const
{
    return m_angle * RAD_TO_DEG_F;
}
