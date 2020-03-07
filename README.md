Node.js: chsplicer
=================

`chsplicer` a song splicer / customizer for clone hero. This can pick any parts, make loops and so on for godlike trainings.

You can point source songs from:
 - a relative path from clone hero song folder
 - a song on chorus by its md5 (this will download the song).
 - an url of a song archive (zip / rar)

Installation
------------

    npm install -g chsplicer

Usage
-----

    chsplicer run ./examples/destiny.json

    chsplicer runall ./examples

Format
------

```javascript
{
    "version": "1.0.4", // For compatibility
    "name": "New song name",
    "output": "Path/Relative/To/Songs",
    "songs": { // Input songs. this also can be "song" with only one input value
        "Destiny": "chorus:d3cfc782368b0d9c70e3369c4a312e1f", // <-- Download from chorus by the song's md5
        "Dragonforce": "url:https://public.fightthe.pw/rehosts/randomshit/Way%20Too%20Much%20Fucking%20God%20Damn%20DragonForce%20Like%20Jesus%20Christ%202.0%20Special%20Edition%20For%20RhythmFag.zip", // <-- Download from an url
        "Other": "Games/Skyrim/Brandon Strader - Dovahkiin" // <-- Relative to the game songs folder
    },
    "infos": { // optional. Will override songs infos in chart infos & songs.ini
        "album": "custom mix",
        "artist": "galneryus, dragonforce & Brandon Strader"
    },
    "copy": { // optional. Will copy files from an input song. "copy": true will copy everything possible with priority from the first song (default behaviour), "copy": false will copy nothing
        "album.png": "Dragonforce"
    },
    "start_blank": 4, // optional. Starting blank beats
    "samples_offset": -20, // optional. Audio delay in samples (e.g. -20 with 44100 sampling rate = -20 / 44100 seconds)
    "parts": [ // parts to concat
        {
            "song": "Destiny", // optional. If not specified this will take the first input song.
            "start": "Guitar Solo 3", "end": 146304, // optional. This can be an event or a chart time reference.
            "repeat": 5, // optional. This will repeat this part several times
            "event": "Destiny", // optional. This will add an event at the beginning of this part.
            "startOffset": 128, "endOffset": 128, // optional. This will delay the audio start & end of the number of samples
            "quantize": 1 // optional. This will round the start and end at a beat (1), two beats (2), half beat (0.5) etc.
        },
        {"song": "Dragonforce"},
        {"song": "Other"}
    ]
}
```

Prerequisites
-------------

#### ffmpeg

chsplicer requires ffmpeg to work.

If the `FFMPEG_PATH` environment variable is set, chsplicer will use it as the full path to the `ffmpeg` executable.  Otherwise, it will attempt to call `ffmpeg` directly (so it should be in your `PATH`).

**Windows users**: most probably ffmpeg will _not_ be in your `%PATH`, so you _must_ set `%FFMPEG_PATH`

**Debian/Ubuntu users**: the official repositories have the ffmpeg executable in the `libav-tools` package, and they are actually rebranded avconv/avprobe executables (avconv is a fork of ffmpeg).  They should be mostly compatible, but should you encounter any issue, you may want to use the real ffmpeg instead. You can either compile it from source or find a pre-built .deb package at https://ffmpeg.org/download.html (For Ubuntu, the `ppa:mc3man/trusty-media` PPA provides recent builds).

Current limitations
-----

- I did not test to mix songs with different sampling
- This only uses expert guitar track


License
-------

Licensed under MIT

Copyright (c) 2020 [Aurélie Richard](https://arichard.me)