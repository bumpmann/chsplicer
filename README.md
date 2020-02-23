Node.js: chsplicer
=================

`chsplicer` a song splicer / customizer for clone hero. This can pick any parts, make loops and so on for godlike trainings.

Installation
------------

    npm install -g chsplicer

Usage
-----

    chsplicer run examples/destiny.json

Prerequisites
-------------

#### ffmpeg

chsplicer requires ffmpeg to work.

If the `FFMPEG_PATH` environment variable is set, chsplicer will use it as the full path to the `ffmpeg` executable.  Otherwise, it will attempt to call `ffmpeg` directly (so it should be in your `PATH`).

**Windows users**: most probably ffmpeg will _not_ be in your `%PATH`, so you _must_ set `%FFMPEG_PATH`

**Debian/Ubuntu users**: the official repositories have the ffmpeg executable in the `libav-tools` package, and they are actually rebranded avconv/avprobe executables (avconv is a fork of ffmpeg).  They should be mostly compatible, but should you encounter any issue, you may want to use the real ffmpeg instead. You can either compile it from source or find a pre-built .deb package at https://ffmpeg.org/download.html (For Ubuntu, the `ppa:mc3man/trusty-media` PPA provides recent builds).

Current limitations
-----

- This only supports chart format, not mid or dat.
- I did not test to mix songs with different sampling
- This only uses expert track


License
-------

Licensed under MIT

Copyright (c) 2020 [Aurélie Richard](https://arichard.me)