#include <Arduino.h>
#include <string.h>
#include <EEPROM.h>

#include "Settings.h"
#include "Config.h"

static const int      EEPROM_BASE  = 0;
static const uint32_t SETTINGS_MAGIC = 0x53424D31UL;  /* "SBM1" */

struct StoredBlock {
    uint32_t       magic;
    RobotSettings  settings;
    uint16_t       checksum;
};

static uint16_t checksumOf(const StoredBlock& b)
{
    /* Fletcher-16 over everything up to the checksum field. */
    const uint8_t* p = (const uint8_t*)&b;
    const size_t n = sizeof(StoredBlock) - sizeof(uint16_t);

    uint16_t sum1 = 0, sum2 = 0;
    for (size_t i = 0; i < n; ++i) {
        sum1 = (uint16_t)((sum1 + p[i]) % 255);
        sum2 = (uint16_t)((sum2 + sum1) % 255);
    }
    return (uint16_t)((sum2 << 8) | sum1);
}

void settingsDefaults(RobotSettings& out)
{
    out.gains.cTheta = SMC_C_THETA;
    out.gains.cV     = SMC_C_V;
    out.gains.cX     = SMC_C_X;
    out.gains.eta    = SMC_ETA;
    out.gains.K      = SMC_K;
    out.gains.phi    = SMC_PHI;
    out.angleOffsetDeg = ANGLE_OFFSET_DEG;
}

bool settingsLoad(RobotSettings& out)
{
    StoredBlock b;
    EEPROM.get(EEPROM_BASE, b);

    if (b.magic == SETTINGS_MAGIC && b.checksum == checksumOf(b)) {
        out = b.settings;
        return true;
    }

    settingsDefaults(out);
    return false;
}

void settingsSave(const RobotSettings& in)
{
    StoredBlock b;
    /* Zero first: any padding the compiler inserts is covered by the checksum,
     * so it has to be deterministic rather than whatever was on the stack. */
    memset(&b, 0, sizeof(b));
    b.magic    = SETTINGS_MAGIC;
    b.settings = in;
    b.checksum = checksumOf(b);

    EEPROM.put(EEPROM_BASE, b);   /* EEPROM.put uses update() per byte */
}

void settingsClear()
{
    uint32_t zero = 0;
    EEPROM.put(EEPROM_BASE, zero);
}
