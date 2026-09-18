/*
 * Telemetry.h - the serial link, over USB and over the ESP-01S.
 *
 * Both ports speak the same line-based text protocol, and commands are accepted
 * from either. Text rather than a binary packet format because the whole point
 * is to be able to open a terminal, type a gain, and watch what happens.
 *
 * The protocol is documented in firmware/SelfBalancingRobot/README.md.
 */

#ifndef TELEMETRY_H
#define TELEMETRY_H

#include <Arduino.h>
#include <stdint.h>

#include "Config.h"
#include "Settings.h"

enum StreamMode : uint8_t {
    STREAM_OFF = 0,
    STREAM_CSV = 1,   /* tagged CSV, for logging and the web UI */
    STREAM_PLOT = 2   /* bare numbers, for the Arduino Serial Plotter */
};

struct TelemetrySample {
    uint32_t ms;
    uint8_t  state;
    float    angleDeg;
    float    rateDps;
    float    surface;
    float    accel;
    float    speed;
    float    position;
};

struct DriveCommand {
    float forward;   /* -1 .. +1 */
    float turn;      /* -1 .. +1 */
};

class Telemetry {
public:
    void begin();

    /* Reads any waiting characters from both ports and executes complete lines.
     * Sets 'settingsChanged' when a command modified the settings, so the caller
     * can push them into the controller. */
    void poll(RobotSettings& settings, bool& settingsChanged);

    /* Emits one sample if streaming is enabled. */
    void send(const TelemetrySample& s);

    /* The most recent drive command. Returns zero if nothing has arrived for
     * DRIVE_TIMEOUT_MS, so a dropped wireless link stops the robot instead of
     * leaving it driving at the last commanded speed. */
    DriveCommand drive();

    /* One-shot request flags, cleared by reading them. */
    bool takeRecalibrateRequest();
    bool takeZeroRequest();

    /* Status text to both ports. */
    void log(const char* msg);

private:
    void handleLine(char* line, Stream& reply,
                    RobotSettings& settings, bool& settingsChanged);
    void printGains(Stream& out, const RobotSettings& s);
    void printHelp(Stream& out);
    void pump(Stream& port, char* buf, uint8_t& len,
              RobotSettings& settings, bool& settingsChanged);

    static const uint8_t LINE_MAX = 48;

    char    m_usbBuf[LINE_MAX];
    uint8_t m_usbLen = 0;
#if ENABLE_WIRELESS
    char    m_wlBuf[LINE_MAX];
    uint8_t m_wlLen = 0;
#endif

    StreamMode m_mode = STREAM_OFF;

    DriveCommand m_drive = {0.0f, 0.0f};
    uint32_t     m_driveStampMs = 0;

    bool m_reqRecalibrate = false;
    bool m_reqZero = false;
};

#endif /* TELEMETRY_H */
