Node.js: chsplicer
=================

`chsplicer` is a toolbox for clone hero songs. The main features are:

- Pick parts from different songs or make loops for godlike trainings.
- Download and extract songs from chorus or an url.
- Generate difficuly levels using a dictionary or a trained neural network ai.

Installation
------------

    npm install -g chsplicer

Usage
-----

The first argument is a path to a json configuration. This will fallback in [configs dir](https://github.com/bumpmann/chsplicer/tree/master/configs).

    chsplicer marathons/usual_deaths

    chsplicer download chorus:d3cfc782368b0d9c70e3369c4a312e1f

    chsplicer translate './Ozzy Osbourne - Gets Me Through'


Included configs
----------------

### [harder](https://github.com/bumpmann/chsplicer/tree/master/configs/harder)

This folder contains the songs where i added some loops when it's a hard part. (currently only ttfaf)

### [marathons](https://github.com/bumpmann/chsplicer/tree/master/configs/harder)

This folder contains some long songs where i paste different interesting parts.

### [download](https://github.com/bumpmann/chsplicer/blob/master/configs/download.json)

Download from chorus or an url, can also translate missing tracks using the ai gh+rb if it exists.

    chsplicer download chorus:d3cfc782368b0d9c70e3369c4a312e1f --out=customfolder --translate

### [translate](https://github.com/bumpmann/chsplicer/blob/master/configs/translate.json)

Generate the Hard, Medium and Easy tracks from the Expert track using either a `dictionary` or `ai` (neural network).

None of the dictionary or trained ai are included in this repo because they're a little big (with guitar hero + rock band 3 i have a dictionary of 60Mb and an ai of 11Mb). I may add a download link if requested.

    chsplicer translate './Ozzy Osbourne - Gets Me Through' --method=ai --overwrite --only=MediumSingle --using=gh+rb

### [translations/build_dictionary](https://github.com/bumpmann/chsplicer/blob/master/configs/translations/build_dictionary.json)

This will scan all songs in `Guitar Hero III - Bonus`, `Guitar Hero III - Quickplay`, `Guitar Hero World Tour`, `Guitar Hero World Tour DLC`, `Rock Band 3 + DLC` if they're present in the Songs folder, and build a dictionary to translate Expert tracks to Hard, Medium, Easy.

The dictionary is generated to a chart `assets/gh+rb.chart`.

### [translations/train_neuralnet](https://github.com/bumpmann/chsplicer/blob/master/configs/translations/train_neuralnet.json)

This will train a neural network from the `assets/gh+rb.chart` dictionary.

The output is a folder `assets/gh+rb` containing the nn structures, trained weights, training and testing data.

Config format
-------------

- Almost all of the properties are optional or have default values.
- Most of properties are handlebars template so that you can send cli parameters: `{{test}}` will be replaced by a --test=... parameter and `{{1}}`, `{{2}}`... with the free params. There are also few additional params sent to the templates:
  - `{{cache}}`: Downloads cache folder path
  - `{{songs}}`: Clone hero's songs path
  - `{{app}}`: This app's path
  - `{{assets}}`: The assets path, you can put dictionaries and ai stuff here
  - `{{bin}}`: The lib path (e.g. where to put ffmpeg binary)
  - `{{temp}}`: A temp folder


This is how are described these configs:

```javascript
{
    "version": "1.1.0",
    "name": "New song name",
    "output": "Path/Relative/To/Songs",
    "require": {"path": "translations/build_dictionary", "check": "{{assets}}/translations/gh+rb.chart"}, // This will run the required config, or skip it if the check path exists.
    "songs": { // Input songs. this also can be "song" with only one input value
        "Destiny": "chorus:d3cfc782368b0d9c70e3369c4a312e1f", // <-- Download from chorus by the song's md5
        "Dragonforce": "url:https://public.fightthe.pw/rehosts/randomshit/Way%20Too%20Much%20Fucking%20God%20Damn%20DragonForce%20Like%20Jesus%20Christ%202.0%20Special%20Edition%20For%20RhythmFag.zip", // <-- Download from an url
        "Other": "Games/Skyrim/Brandon Strader - Dovahkiin" // <-- Relative to the game songs folder
    },
    "infos": { // Will override songs infos in chart infos & songs.ini
        "album": "custom mix",
        "artist": "galneryus, dragonforce & Brandon Strader"
    },
    "copy": { // Will copy files from an input song. "copy": true will copy everything possible with priority from the first song (default behaviour), "copy": false will copy nothing
        "album.png": "Dragonforce"
    },
    "ignoreAudio": false, // Set true to ignore audio output (e.g. in case of a simple copy or download)
    "args": { // Object with possible params / cli params
        "1": {"resolve": true}, // for the first free param this will resolve to an absolute path
        "enablePlugin": {"default": "default value"} // for param --enablePlugin
    }
    "plugins": [ // or "plugin" with only one entry
        ["pluginName", {"if": "{{enablePlugin}}", "pluginArg1":"...", "pluginArg2": "..."]
    ]
    "start_blank": 4, // Starting blank beats
    "autoOffset": 70, // For long songs, this will add some ms to parts to keep sync = part duration / autoOffset (seconds)
    "samples_offset": -20, // Audio delay in samples (e.g. -20 with 44100 sampling rate = -20 / 44100 seconds)
    "parts": [ // parts to concat
        {
            "song": "Destiny", // If not specified this will take the first input song.
            "start": "Guitar Solo 3", "end": 146304, // This can be an event or a chart time reference. first and last note if not specified
            "repeat": 5, // This will repeat this part several times
            "event": "Destiny", // This will add an event at the beginning of this part.
            "startOffset": 3, "endOffset": 3, // This will delay the audio start & end in milliseconds
            "quantize": 1 // This will round the start and end at a beat (1), two beats (2), half beat (0.5) etc.
        },
        {"song": "Dragonforce"},
        {
            "song": "Other",
            "end": -1 // special value -1: this will resolves to the audio end
        }
    ]
}
```


Plugins
-------

- aiTranslator: translate the Expert track to others using an existing ai in `path`, this can `overwrite` the existing ones if set.
- aiTrainer: train or resume training an ai in `path`. The param `only` can be use to train only one track (HardSingle, MediumSingle, EasySingle)
- dictionaryTranslator: translate the Expert track to others using an existing dictionary chart in `chart`, this can `overwrite` the existing ones if set.
- dictionaryBuilder: build a dictionary of the measure's translations from Expert to Hard/Medium/Easy to the `chart`. This will keep only the translations that have the more occurences.
- songScanner: scan one or more folders for songs in `path` (string or array). You can ignore some path with `except` (string or array). This adds the songs and parts to the current config.

Notes
-----

You can point source songs from:
 - a relative path from clone hero song folder
 - a song on chorus by its md5 (this will download the song).
 - an url of a song archive (zip / rar)


Prerequisites
-------------

#### ffmpeg

chsplicer requires ffmpeg to work.

If the `FFMPEG_PATH` environment variable is set, chsplicer will use it as the full path to the `ffmpeg` executable.  Otherwise, it will attempt to call `ffmpeg` directly (so it should be in your `PATH`).

**Windows users**: most probably ffmpeg will _not_ be in your `%PATH`, so you _must_ set `%FFMPEG_PATH`

**Debian/Ubuntu users**: the official repositories have the ffmpeg executable in the `libav-tools` package, and they are actually rebranded avconv/avprobe executables (avconv is a fork of ffmpeg).  They should be mostly compatible, but should you encounter any issue, you may want to use the real ffmpeg instead. You can either compile it from source or find a pre-built .deb package at https://ffmpeg.org/download.html (For Ubuntu, the `ppa:mc3man/trusty-media` PPA provides recent builds).


License
-------

Licensed under MIT

Copyright (c) 2020 [Aurélie Richard](https://arichard.me)