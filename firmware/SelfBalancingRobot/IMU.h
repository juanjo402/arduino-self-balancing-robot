/*
 * IMU.h - minimal MPU-6050 driver plus the Kalman filter that turns its output
 * into a usable tilt angle.
 *
 * Deliberately written against the registers directly rather than using one of
 * the large MPU-6050 libraries. It is about eighty lines, it has no external
 * dependency beyond Wire, and it means nothing in the control path is hidden
 * behind someone else's abstraction.
 *
 * Axis convention: Z points up, Y points in the direction of travel, so tilt is
 * rotation about X. See docs/wiring.md for mounting, and
 * docs/theory/kalman-filter.md for the sign checks.
 */

#ifndef IMU_H
#define IMU_H

#include <stdint.h>
#include "KalmanFilter.h"

class IMU {
public:
    /* Brings up I2C and configures the sensor. Returns false if the MPU-6050
     * does not answer, which almost always means wiring. */
    bool begin();

    /* Averages gyro samples to find the startup bias, and seeds the filter from
     * the accelerometer. The robot MUST be held still for the whole call, which
     * takes about two seconds. Returns false on an I2C failure. */
    bool calibrate();

    /* Read the sensor and run one filter step. Call at CONTROL_HZ.
     *
     * knownAccel is the axle acceleration the firmware actually applied over
     * the last control period, in m/s^2. Passing it is what keeps the estimate
     * from slowly walking away; see the comment on compensation in IMU.cpp.
     * Pass 0 if the wheels are not being driven. */
    void update(float dt, float knownAccel);

    float angle() const { return m_angle; }        /* rad, forward positive */
    float rate()  const { return m_rate;  }        /* rad/s, bias removed   */
    float angleDeg() const;
    float accelAngle() const { return m_accelAngle; } /* unfiltered, rad    */
    float rawAccelAngle() const { return m_rawAccelAngle; } /* uncompensated */
    float gyroBias() const { return m_kalman.bias(); }

    /* Constant trim that cancels a crooked sensor mount, in degrees. Settable at
     * runtime so it can be tuned over the serial link instead of by recompiling. */
    void setAngleOffsetDeg(float deg);
    float angleOffsetDeg() const;

    /* Raw counts, for IMU_TEST_MODE. */
    int16_t rawAx() const { return m_ax; }
    int16_t rawAy() const { return m_ay; }
    int16_t rawAz() const { return m_az; }
    int16_t rawGx() const { return m_gx; }

    KalmanFilter& filter() { return m_kalman; }

private:
    bool readRaw();
    bool writeReg(uint8_t reg, uint8_t value);

    KalmanFilter m_kalman;

    int16_t m_ax = 0, m_ay = 0, m_az = 0;
    int16_t m_gx = 0, m_gy = 0, m_gz = 0;

    float m_angle = 0.0f;
    float m_rate = 0.0f;
    float m_accelAngle = 0.0f;
    float m_rawAccelAngle = 0.0f;
    float m_gyroBiasCounts = 0.0f;
    float m_angleOffsetRad = 0.0f;
};

#endif /* IMU_H */
