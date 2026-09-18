/*
 * Settings.h - controller gains held in EEPROM.
 *
 * Tuning a balancing robot means changing a gain, watching what happens, and
 * changing it again, dozens of times. Recompiling and re-uploading for each
 * change is slow, and it means losing the values the moment the robot resets.
 * These routines let gains be changed over the serial link and then kept.
 *
 * The stored block is validated by a magic number and a checksum, so a blank or
 * corrupted EEPROM falls back to the compiled-in defaults from Config.h rather
 * than loading garbage into the controller.
 */

#ifndef SETTINGS_H
#define SETTINGS_H

#include <stdint.h>
#include "SlidingModeController.h"

struct RobotSettings {
    SmcGains gains;
    float    angleOffsetDeg;
};

/* The compiled-in defaults from Config.h. */
void settingsDefaults(RobotSettings& out);

/* Fills 'out' from EEPROM. Returns false and loads the defaults instead if the
 * stored block is missing or fails its checksum. */
bool settingsLoad(RobotSettings& out);

/* Writes to EEPROM. Uses update semantics, so unchanged bytes are not rewritten
 * and the cell wear budget is not spent on repeated identical saves. */
void settingsSave(const RobotSettings& in);

/* Invalidates the stored block so the next boot uses the defaults. */
void settingsClear();

#endif /* SETTINGS_H */
