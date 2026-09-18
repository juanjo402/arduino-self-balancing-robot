#include <string.h>
#include <stdlib.h>

#include "Telemetry.h"

/* A wireless link that goes quiet must not leave the robot driving. */
static const uint32_t DRIVE_TIMEOUT_MS = 500;

void Telemetry::begin()
{
    Serial.begin(USB_BAUD);
#if ENABLE_WIRELESS
    Serial1.begin(WIRELESS_BAUD);
#endif
    m_driveStampMs = millis();
}

void Telemetry::log(const char* msg)
{
    Serial.print(F("# "));
    Serial.println(msg);
#if ENABLE_WIRELESS
    Serial1.print(F("# "));
    Serial1.println(msg);
#endif
}

void Telemetry::pump(Stream& port, char* buf, uint8_t& len,
                     RobotSettings& settings, bool& settingsChanged)
{
    while (port.available() > 0) {
        const char c = (char)port.read();

        if (c == '\r') continue;

        if (c == '\n') {
            buf[len] = '\0';
            if (len > 0) {
                handleLine(buf, port, settings, settingsChanged);
            }
            len = 0;
            continue;
        }

        if (len < (LINE_MAX - 1)) {
            buf[len++] = c;
        } else {
            /* Overlong line: drop it rather than executing a truncated command. */
            len = 0;
        }
    }
}

void Telemetry::poll(RobotSettings& settings, bool& settingsChanged)
{
    pump(Serial, m_usbBuf, m_usbLen, settings, settingsChanged);
#if ENABLE_WIRELESS
    pump(Serial1, m_wlBuf, m_wlLen, settings, settingsChanged);
#endif
}

void Telemetry::printHelp(Stream& out)
{
    out.println(F("# commands"));
    out.println(F("#   ?              this help"));
    out.println(F("#   g              print gains"));
    out.println(F("#   g <n> <v>      set gain: ct cv cx eta k phi off"));
    out.println(F("#   d <fwd> <turn> drive, each -1..1"));
    out.println(F("#   s <0|1|2>      stream: off, csv, plotter"));
    out.println(F("#   z              zero the odometry"));
    out.println(F("#   c              recalibrate the gyro, hold still"));
    out.println(F("#   w              save gains to EEPROM"));
    out.println(F("#   r              restore compiled-in defaults"));
}

void Telemetry::printGains(Stream& out, const RobotSettings& s)
{
    out.print(F("G,"));
    out.print(s.gains.cTheta, 4); out.print(',');
    out.print(s.gains.cV,     4); out.print(',');
    out.print(s.gains.cX,     4); out.print(',');
    out.print(s.gains.eta,    4); out.print(',');
    out.print(s.gains.K,      4); out.print(',');
    out.print(s.gains.phi,    4); out.print(',');
    out.println(s.angleOffsetDeg, 4);
}

void Telemetry::handleLine(char* line, Stream& reply,
                           RobotSettings& settings, bool& settingsChanged)
{
    char* cmd = strtok(line, " \t");
    if (cmd == nullptr) return;

    switch (cmd[0]) {

    case '?':
        printHelp(reply);
        break;

    case 'g': {
        char* name = strtok(nullptr, " \t");
        if (name == nullptr) {
            printGains(reply, settings);
            break;
        }
        char* valTok = strtok(nullptr, " \t");
        if (valTok == nullptr) {
            reply.println(F("# error: missing value"));
            break;
        }
        const float v = atof(valTok);

        if      (!strcmp(name, "ct"))  settings.gains.cTheta = v;
        else if (!strcmp(name, "cv"))  settings.gains.cV     = v;
        else if (!strcmp(name, "cx"))  settings.gains.cX     = v;
        else if (!strcmp(name, "eta")) settings.gains.eta    = v;
        else if (!strcmp(name, "k"))   settings.gains.K      = v;
        else if (!strcmp(name, "phi")) settings.gains.phi    = v;
        else if (!strcmp(name, "off")) settings.angleOffsetDeg = v;
        else { reply.println(F("# error: unknown gain")); break; }

        settingsChanged = true;
        printGains(reply, settings);
        break;
    }

    case 'd': {
        char* fwdTok  = strtok(nullptr, " \t");
        char* turnTok = strtok(nullptr, " \t");
        if (fwdTok == nullptr || turnTok == nullptr) {
            reply.println(F("# error: usage d <fwd> <turn>"));
            break;
        }
        float f = atof(fwdTok);
        float t = atof(turnTok);
        if (f >  1.0f) f =  1.0f;
        if (f < -1.0f) f = -1.0f;
        if (t >  1.0f) t =  1.0f;
        if (t < -1.0f) t = -1.0f;
        m_drive.forward = f;
        m_drive.turn    = t;
        m_driveStampMs  = millis();
        break;
    }

    case 's': {
        char* modeTok = strtok(nullptr, " \t");
        const int m = (modeTok == nullptr) ? 1 : atoi(modeTok);
        m_mode = (m == 2) ? STREAM_PLOT : (m == 1 ? STREAM_CSV : STREAM_OFF);
        break;
    }

    case 'z':
        m_reqZero = true;
        break;

    case 'c':
        m_reqRecalibrate = true;
        break;

    case 'w':
        settingsSave(settings);
        reply.println(F("# saved"));
        break;

    case 'r':
        settingsDefaults(settings);
        settingsChanged = true;
        printGains(reply, settings);
        break;

    default:
        reply.println(F("# error: unknown command, try ?"));
        break;
    }
}

void Telemetry::send(const TelemetrySample& s)
{
    if (m_mode == STREAM_OFF) return;

    if (m_mode == STREAM_PLOT) {
        /* Bare numbers, which is what the Arduino IDE's Serial Plotter wants. */
        Serial.print(s.angleDeg);  Serial.print(' ');
        Serial.print(s.rateDps);   Serial.print(' ');
        Serial.print(s.surface);   Serial.print(' ');
        Serial.println(s.speed);
        return;
    }

    /* Tagged CSV: T,ms,state,angle,rate,s,u,v,x */
    char buf[96];
    char fAngle[10], fRate[10], fSurf[10], fAccel[10], fSpeed[10], fPos[10];

    dtostrf(s.angleDeg, 0, 2, fAngle);
    dtostrf(s.rateDps,  0, 2, fRate);
    dtostrf(s.surface,  0, 3, fSurf);
    dtostrf(s.accel,    0, 3, fAccel);
    dtostrf(s.speed,    0, 3, fSpeed);
    dtostrf(s.position, 0, 3, fPos);

    snprintf(buf, sizeof(buf), "T,%lu,%u,%s,%s,%s,%s,%s,%s",
             (unsigned long)s.ms, (unsigned)s.state,
             fAngle, fRate, fSurf, fAccel, fSpeed, fPos);

    Serial.println(buf);
#if ENABLE_WIRELESS
    Serial1.println(buf);
#endif
}

DriveCommand Telemetry::drive()
{
    if ((millis() - m_driveStampMs) > DRIVE_TIMEOUT_MS) {
        m_drive.forward = 0.0f;
        m_drive.turn    = 0.0f;
    }
    return m_drive;
}

bool Telemetry::takeRecalibrateRequest()
{
    const bool v = m_reqRecalibrate;
    m_reqRecalibrate = false;
    return v;
}

bool Telemetry::takeZeroRequest()
{
    const bool v = m_reqZero;
    m_reqZero = false;
    return v;
}
