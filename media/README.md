# Media

Photos and diagrams of the real robot.

## What goes where

| Folder | Contents |
|---|---|
| `photos/` | Photographs of the build and the finished robot |
| `diagrams/` | Wiring diagrams, block diagrams, anything drawn rather than photographed |

`media/photos/hero.jpg` is the image the main README shows at the top.

## Videos live outside the repository

Video files are not committed here. A few minutes of phone footage is tens of megabytes, git
keeps every version forever, and everyone who clones the repository afterwards pays for it.
The `.gitignore` blocks common video extensions to make that hard to do by accident.

Instead: upload to YouTube or similar, link it from the README, and commit a still frame or a
short GIF as the thumbnail.

## Keep photos small

Resize to 1600 px on the long edge and save as JPEG at about 80 % quality before committing.
A modern phone photo is 5 MB straight off the camera and perhaps 300 kB after that, with no
visible difference on a web page.

## Worth photographing

Not for anyone else, for you, in three months, when something stops working:

- cable routing before the decks went on
- the IMU orientation and how it is mounted
- which motor went into which RAMPS socket
- the driver jumper positions
- the multimeter reading while setting Vref
