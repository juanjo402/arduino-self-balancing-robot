/*
 * KalmanFilter.h - two-state Kalman filter fusing an accelerometer angle with a
 * gyro rate, estimating the tilt angle and the gyro bias.
 *
 * Theory and tuning advice: docs/theory/kalman-filter.md
 * The simulator runs the same maths in simulation/js/kalman.js. If you change
 * one, change the other.
 */

#ifndef KALMAN_FILTER_H
#define KALMAN_FILTER_H

class KalmanFilter {
public:
    KalmanFilter();

    /* qAngle   - process noise on the angle, how much you distrust the gyro
     * qBias    - process noise on the bias, how fast you think it wanders
     * rMeasure - measurement noise, how much you distrust the accelerometer
     * Only the ratios matter. */
    void begin(float qAngle, float qBias, float rMeasure);

    /* Discard the state and restart from a known angle, clearing the covariance
     * back to "completely uncertain about the bias, certain about the angle". */
    void reset(float angle, float bias);

    /* One predict-update step.
     *   newAngle - accelerometer angle, rad
     *   newRate  - gyro rate, rad/s
     *   dt       - time since the last call, s
     * Returns the fused angle in rad. */
    float update(float newAngle, float newRate, float dt);

    float angle() const { return m_angle; }
    float bias()  const { return m_bias;  }

    /* Gyro rate with the estimated bias removed. This is what the controller
     * should use as theta_dot, not the raw gyro reading. */
    float rate()  const { return m_rate;  }

private:
    float m_qAngle, m_qBias, m_rMeasure;
    float m_angle, m_bias, m_rate;
    float m_P[2][2];
};

#endif /* KALMAN_FILTER_H */
