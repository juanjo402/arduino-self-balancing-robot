#include <math.h>

#include "SlidingModeController.h"
#include "Config.h"

/* Inertia of the body about the wheel axle, J = I + m l^2. Constant, so it is
 * folded into a few compile-time expressions rather than recomputed. */
static const float J_AXLE   = BODY_INERTIA + BODY_MASS_KG * COM_HEIGHT_M * COM_HEIGHT_M;
static const float MGL_OVER_J = (BODY_MASS_KG * GRAVITY * COM_HEIGHT_M) / J_AXLE;
static const float ML_OVER_J  = (BODY_MASS_KG * COM_HEIGHT_M) / J_AXLE;
static const float B_OVER_J   = AXLE_DAMPING / J_AXLE;

/* Below this the control has too little authority over the surface for the law
 * to be meaningful. See docs/theory/sliding-mode-control.md. */
static const float MIN_ABS_GS = 0.5f;

static inline float saturate(float z)
{
    if (z >  1.0f) return  1.0f;
    if (z < -1.0f) return -1.0f;
    return z;
}

void SlidingModeController::begin(const SmcGains& g)
{
    setGains(g);
    reset();
}

void SlidingModeController::setGains(const SmcGains& g)
{
    m_g = g;

    if (m_g.phi < 1.0e-4f) m_g.phi = 1.0e-4f;   /* never divide by zero */

    /* g_s = c_v - (m l cos theta) / J, worst case at theta = 0 where the cosine
     * term is largest. If c_v sits near m*l/J the controller loses authority. */
    const float gsUpright = m_g.cV - ML_OVER_J;
    m_gainsValid = (fabsf(gsUpright) > MIN_ABS_GS);
}

void SlidingModeController::reset()
{
    m_s = 0.0f;
}

float SlidingModeController::update(float theta, float thetaDot,
                                    float x, float v,
                                    float xRef, float vRef)
{
    const float eTheta = theta;          /* the balance reference is upright */
    const float eX     = x - xRef;
    const float eV     = v - vRef;

    /* The sliding surface. */
    m_s = thetaDot
        + m_g.cTheta * eTheta
        + m_g.cV     * eV
        + m_g.cX     * eX;

    const float sinT = sinf(theta);
    const float cosT = cosf(theta);

    /* Split s_dot = f + g_s * u.
     *
     * The nonlinear sin/cos form is kept rather than the small-angle version:
     * the two cost about 25 us together at 200 Hz, and keeping them means the
     * model stays honest out to the 35 degree safety limit instead of only near
     * upright. */
    const float f = m_g.cTheta * thetaDot
                  + m_g.cX     * eV
                  + MGL_OVER_J * sinT
                  - B_OVER_J   * thetaDot;

    float gs = m_g.cV - ML_OVER_J * cosT;

    /* Should be impossible given the check in setGains, but the robot is
     * standing on two wheels and a divide by zero here is not recoverable. */
    if (fabsf(gs) < MIN_ABS_GS) {
        gs = (gs < 0.0f) ? -MIN_ABS_GS : MIN_ABS_GS;
    }

    /* Equivalent control plus the two reaching terms. */
    const float reaching = m_g.eta * m_s + m_g.K * saturate(m_s / m_g.phi);
    float u = (-f - reaching) / gs;

    if (u >  MAX_ACCEL_MPS2) u =  MAX_ACCEL_MPS2;
    if (u < -MAX_ACCEL_MPS2) u = -MAX_ACCEL_MPS2;

    return u;
}
