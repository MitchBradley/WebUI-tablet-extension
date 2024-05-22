# WebUI-tablet-extension
Plugin for ESP3D WebUI implementing a user interface optimized for tablets

## Scope

This is an addition to [ESP32-WEBUI](https://github.com/luc-github/ESP3D-WEBUI.git) version 3 that presents an additional user interface for CNC use.  The new UI works well with
tablet computers and other touchscreens of similar size.  It is especially useful in a production environment where you want quick access to a small number of
frequently-used functions.

* All of the main controls are on a single screen, in fixed locations.  Scrolling to find a control is unnecessary.
* The control buttons are large, easily touched with a finger, instead of needing a mouse to point precisely at a small icon.
* The text is large for easy visibility from far away.
* Color coding makes it easier to see the run state at a glance
* A GCode visualizer and file content display helps with job setup, letting you confirm that the job is the one you want, with the tool in the right position.

It is intended for use with CNC controllers that are compatible with GRBL.  It lacks many capabilities that are commonly needed for 3D printing.

## History

The first version of this user interface was released as [cncjs-shopfloor-tablet](https://github.com/MitchBradley/cncjs-shopfloor-tablet.git) as an extension to [cncjs](https://github.com/cncjs/cncjs.git).  Later it was ported to ESP3D-WEBUI version 2, [in this fork](https://github.com/MitchBradley/ESP3D-WEBUI.git/tree/#revamp).  That second version was mainly used with FluidNC.

This version works with ESP3D-WEBUI version 3, using its "Extra Content" extension mechanism.  That mechanism makes it possible to maintain and deploy this code independently of the main ESP3D-WEBUI tree.  The earlier version had to be in the same tree, compiled together with ESP3D-WEBUI into one index.html.gz file.

## Development

This program consists of two source files src/tablet.js and src/tablet.css .  The shell script minify.js uses an external cloud-based Javascript minifier service to reduce their size, and then combines them into a single compressed file named build/tablet.html.gz, suitable for use as an ESP3D-WEBUI extension.

That file can be uploaded to the Flash filesystem on an ESP3D-WEBUI system and then used via ESP#d-WEBUI's Extra Content mechanism.
