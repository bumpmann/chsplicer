Changelog
=========

1.1.0
-----

- Handlebar in properties
- First param is relative to current working dir, fallbacks in configs folder.
- CLI parameters are sent to configs, most have a default relative folder.
- Remove useless command "runall", and "download" is now a config.
- Enhanced logs, added progress bars.
- Plugin system
- Added plugin trackCopy (wip), aiTranslator, aiTrainer, dictionaryTranslator, dictionaryBuilder, noteLimiter (wip), songScanner
- Can use inputs that are in output folder (this will generate to a temp folder)
- Properties "require", "plugin"/"plugins", "ignoreAudio"
- Special value for part end = -1: At the audio end
- Small fixes