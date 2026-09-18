/*
 * SlidingModeController.h
 *
 * Sliding surface:
 *     s = theta_dot + c_theta * e_theta + c_v * e_v + c_x * e_x
 *
 * Control law:
 *     u = ( -f - eta * s - K * sat(s / phi) ) / g_s
 *
 * where f collects everything in s_dot that does not depend on the input, and
 * g_s is ds_dot/du. The output u is an acceleration of the wheel axle in m/s^2.
 *
 * Full derivation, including why this is stable and how to choose each gain:
 * docs/theory/sliding-mode-control.md
 *
 * The simulator runs the same law in simulation/js/controllers.js. Keep the two
 * in step.
 */

#ifndef SLIDING_MODE_CONTROLLER_H
#define SLIDING_MODE_CONTROLLER_H

struct SmcGains {
    float cTheta;   /* balance bandwidth, rad/s per rad          */
    float cV;       /* speed holding                             */
    float cX;       /* position holding, slowest term            */
    float eta;      /* linear reaching rate                      */
    float K;        /* switching gain, the robustness margin     */
    float phi;      /* boundary layer half-width, anti-chatter   */
};

class SlidingModeController {
public:
    void begin(const SmcGains& g);
    void setGains(const SmcGains& g);
    const SmcGains& gains() const { return m_g; }

    void reset();

    /* One control step.
     *   theta     - tilt, rad, forward positive
     *   thetaDot  - tilt rate, rad/s, bias-corrected
     *   x, v      - axle position (m) and speed (m/s)
     *   xRef, vRef- references from the outer loop
     * Returns the commanded axle acceleration in m/s^2, clamped to
     * MAX_ACCEL_MPS2. */
    float update(float theta, float thetaDot, float x, float v,
                 float xRef, float vRef);

    /* Distance from the sliding surface. Watching this is the single most
     * useful diagnostic when tuning: it should fall into the boundary layer and
     * stay there, not ring across zero. */
    float surface() const { return m_s; }

    /* True if the current gains give the controller authority over the surface.
     * Fails when cV is close to m*l/J, which would make g_s vanish. */
    bool gainsValid() const { return m_gainsValid; }

private:
    SmcGains m_g = {0, 0, 0, 0, 0, 0};
    float m_s = 0.0f;
    bool  m_gainsValid = false;
};

#endif /* SLIDING_MODE_CONTROLLER_H */
