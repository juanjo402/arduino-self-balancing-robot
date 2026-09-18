# Hardware

The physical side of the robot: the printable chassis, any editable CAD sources, and print
profiles.

## Layout

| Folder | Contents |
|---|---|
| `stl/` | Ready-to-slice parts. This is what most people need |
| `cad/` | Editable sources, when available, so the design can be modified rather than only printed |
| `print-profiles/` | Slicer profiles that are known to work |
| `datasheets/` | Local copies of component datasheets, so the build does not depend on a vendor keeping a page up |

## Before you print

Read [`docs/3d-printing.md`](../docs/3d-printing.md). It covers the settings, the print
orientation that stops motor mounts splitting, and the four requirements a chassis has to
meet for the robot to be tunable at all.

## Naming

One part per file, named for what it is and how many you need:

```
chassis-base.stl
motor-mount-x2.stl
deck-upper.stl
battery-strap.stl
```

A suffix such as `-x2` means print that many.

## If you reuse someone else's design

Keep the attribution and the licence with it, in a `SOURCES.md` next to the file. Do not
commit a third-party STL here without checking that its licence allows redistribution. The
MIT licence on this repository covers the work in it, not work that arrived from elsewhere.

## Status

The chassis for this build exists and its STL is going here. Until it lands, the dimensional
requirements in [`docs/3d-printing.md`](../docs/3d-printing.md) are enough to design or adapt
one: the firmware assumes nothing about the chassis beyond the numbers in `Config.h`.
