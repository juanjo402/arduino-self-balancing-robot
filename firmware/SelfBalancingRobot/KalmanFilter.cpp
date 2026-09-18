#include "KalmanFilter.h"

KalmanFilter::KalmanFilter()
    : m_qAngle(0.001f), m_qBias(0.003f), m_rMeasure(0.03f),
      m_angle(0.0f), m_bias(0.0f), m_rate(0.0f)
{
    m_P[0][0] = 0.0f; m_P[0][1] = 0.0f;
    m_P[1][0] = 0.0f; m_P[1][1] = 0.0f;
}

void KalmanFilter::begin(float qAngle, float qBias, float rMeasure)
{
    m_qAngle   = qAngle;
    m_qBias    = qBias;
    m_rMeasure = rMeasure;
}

void KalmanFilter::reset(float angle, float bias)
{
    m_angle = angle;
    m_bias  = bias;
    m_rate  = 0.0f;

    /* Start certain about the angle, because it was just seeded from the
     * accelerometer, and uncertain about the bias so the filter is free to
     * adjust it quickly in the first moments. */
    m_P[0][0] = 0.0f;
    m_P[0][1] = 0.0f;
    m_P[1][0] = 0.0f;
    m_P[1][1] = 0.02f;
}

float KalmanFilter::update(float newAngle, float newRate, float dt)
{
    /* ---- Predict ------------------------------------------------------ */
    /* The angle advances at the bias-corrected gyro rate; the bias is assumed
     * constant apart from a slow random walk. */

    m_rate  = newRate - m_bias;
    m_angle += dt * m_rate;

    /* P = F P F' + Q, written out for the 2x2 case. */
    m_P[0][0] += dt * (dt * m_P[1][1] - m_P[0][1] - m_P[1][0] + m_qAngle);
    m_P[0][1] -= dt * m_P[1][1];
    m_P[1][0] -= dt * m_P[1][1];
    m_P[1][1] += m_qBias * dt;

    /* ---- Update ------------------------------------------------------- */

    const float S = m_P[0][0] + m_rMeasure;   /* innovation covariance */
    const float K0 = m_P[0][0] / S;           /* gain on the angle     */
    const float K1 = m_P[1][0] / S;           /* gain on the bias      */

    const float y = newAngle - m_angle;       /* innovation            */

    m_angle += K0 * y;
    m_bias  += K1 * y;

    const float P00 = m_P[0][0];
    const float P01 = m_P[0][1];

    m_P[0][0] -= K0 * P00;
    m_P[0][1] -= K0 * P01;
    m_P[1][0] -= K1 * P00;
    m_P[1][1] -= K1 * P01;

    return m_angle;
}
