import { ChartIO, Chart, ChartEvent, ChartTrack } from 'herochartio'
import { Config } from "./config";
import * as cliProgress from "cli-progress";
import * as fse from 'fs-extra';
import * as ini from 'ini';
import * as _path from 'path';
import { Layout } from './layout';
import { Audio } from './audio';
import { AudioVoice } from "./audioVoice";
import { AppPlugin } from './appPlugin';
import { Logger } from './logger';

export class Splicer
{
    chart: Chart;
    layout: Layout;
    output: string;
    audio: Audio;
    logger: Logger;
    args: any;

    async run(config: string, args: any = {})
    {
        if (!config.endsWith('.json'))
            config += '.json';

        this.args = args;
        let configName = _path.basename(config);
        configName = this.args[0] = configName.substr(0, configName.length - 5);

        this.logger = new Logger(configName);

        let cwdConfig = Config.resolvePath(config, '.', this.args);
        if (await fse.pathExists(cwdConfig))
            config = cwdConfig;
        else
            config = Config.resolvePath(config, Config.configs_path, this.args);

        this.logger.log("Loading config and inputs...");

        this.layout = await Layout.loadFile(config, args, async require => {
            for (let required of require)
            {
                let depName = _path.basename(required.path);
                if (required.check && await fse.pathExists(required.check))
                {
                    this.logger.log("Dependency up to date: " + depName);
                    continue;
                }
                this.logger.log("Running dependency " + depName);
                await new Splicer().run(required.path, required.args || {});
            }
        });


        this.output = this.layout.output;

        this.chart = new Chart();
        this.chart.Song = this.layout.infos;

        if (!this.layout.songs.length || !this.layout.parts.length)
            return;

        this.logger.log("Writing new chart...")

        await this.setupAudio();

        await this.writeChart();

        await this.applyPlugins();

        if (this.output)
        {
            this.logger.log("Writing song files...");

            await this.writeFiles();

            this.logger.log("Wrote song in " + this.output)
        }
    }

    private async writeChart()
    {
        let time = this.layout.infos.Resolution * this.layout.start_blank;
        this.chart.Events = {};

        const bar1 = new cliProgress.SingleBar({
            clearOnComplete: true,
            format: '[{bar}] {percentage}% | ETA: {eta}s | {value}/{total}'
        }, cliProgress.Presets.shades_classic);
        bar1.start(this.layout.parts.length, 0);

        let startTime, endTime;
        for (let partIndex in this.layout.parts)
        {
            let part = this.layout.parts[partIndex];
            let chart = part.song.chart;

            let partStart = part.quantize ? Math.floor(part.start / chart.Song.Resolution / part.quantize) * chart.Song.Resolution : part.start;

            let partEnd = part.end == -1 ? chart.secondsToPosition(this.audio.getDuration()) : part.end;
            if (part.quantize)
                partEnd = Math.floor(partEnd / chart.Song.Resolution / part.quantize) * chart.Song.Resolution;

            if (part.event && typeof part.event == "string")
                this.chart.Events[time] = [{ type:"E", name: "section " + part.event }];

            let partChart = chart.filterPositions(pos => pos >= partStart && pos < partEnd);
            if (!this.layout.options.ignoreDurationCheck)
            {
                for (let trackName in partChart.tracks)
                {
                    partChart.tracks[trackName] = partChart.mapTrackEntries(partChart.tracks[trackName], (value, ind) => {
                        return [
                            ind,
                            value.map(val => {
                                if (val.type != "N" && val.type != "S")
                                    return val;
                                val.duration = ind + val.duration > partEnd ? partEnd - ind : val.duration;
                                return val;
                            })
                        ]
                    });
                }
            }

            if (!this.layout.options.ignoreAudio)
            {
                startTime = chart.positionToSeconds(partStart) + (part.startOffset || 0) / 1000;
                endTime = chart.positionToSeconds(partEnd) + (part.endOffset || 0) / 1000;
            }

            for (let i = 0; i < part.repeat; i++)
            {
                if (!this.layout.options.ignoreAudio)
                    this.audio.concat(part.song.index, startTime, endTime);

                if (!this.layout.options.ignoreSync)
                {
                    if (this.chart.bpsAt(time) != chart.bpsAt(partStart))
                        this.chart.SyncTrack = this.chart.concatTrack({[time]: [{type: "B", value: chart.bpsAt(partStart)}]}, this.chart.SyncTrack);
                    if (this.chart.signatureAt(time) != chart.signatureAt(partStart))
                        this.chart.SyncTrack = this.chart.concatTrack({[time]: [{type: "TS", value: chart.signatureAt(partStart)}]}, this.chart.SyncTrack);
                }

                this.chart.mergeWith(partChart, pos => pos - partStart + time, this.layout.options.ignoreSync, this.layout.options.ignoreSync || part.event !== true);
                time += partEnd - partStart;
            }

            bar1.update(parseInt(partIndex));
        }
        bar1.stop();
    }

    private async applyPlugins()
    {
        for (let calls of this.layout.plugins)
        {
            let pluginInstance = await AppPlugin.instanciate(calls[0], calls[1], this.args);
            if (pluginInstance.enabled && pluginInstance.chartPass)
            {
                this.logger.log(`Applying plugin chart:${calls[0]}...`);
                await pluginInstance.chartPass(this.chart);
            }
        }
    }

    private async setupAudio()
    {
        let firstPart = this.layout.parts[0];
        let firstBps = firstPart.song.chart.bpsAt(firstPart.start);

        this.audio = new Audio();
        this.audio.autoOffset = this.layout.autoOffset;
        let audioOuputs: {[name:string]: AudioVoice} = {};
        let audioInputs = !this.output ? [] : await Promise.all(this.layout.songs.map(song => this.audio.scanVoices(song.fullpath)));
        for (let [index, inputs] of audioInputs.entries())
        {
            let song = this.layout.songs[index];
            for (let input of inputs)
            {
                let voiceName = input.substr(0, input.length - _path.extname(input).length);
                let voice = audioOuputs[voiceName];
                let inputFile = song.fullpath + "/" + voiceName;
                if (!voice)
                    voice = audioOuputs[voiceName] = this.audio.addVoice(this.output + "/" + voiceName + ".ogg");
                await voice.addInput(index, inputFile);
            }
        }
        this.audio.setDelay(this.layout.start_blank * (60000 / firstBps), this.layout.samples_offset);

        this.chart.SyncTrack = {
            '0': [
                {type: "B", value: firstBps},
                {type: "TS", value: firstPart.song.chart.signatureAt(firstPart.start)}
            ]
        };

        if (audioOuputs["song"]) this.chart.Song.MusicStream = _path.basename(audioOuputs["song"].output);
        if (audioOuputs["guitar"]) this.chart.Song.GuitarStream = _path.basename(audioOuputs["guitar"].output);
        if (audioOuputs["bass"]) this.chart.Song.BassStream = _path.basename(audioOuputs["bass"].output);
        if (audioOuputs["rhythm"]) this.chart.Song.RhythmStream = _path.basename(audioOuputs["rhythm"].output);
        if (audioOuputs["drum"]) this.chart.Song.DrumStream = _path.basename(audioOuputs["drum"].output);
    }

    private async writeFiles()
    {
        let sameDir = !this.audio.voices.every(voice => !Object.values(voice.inputs).find(input => _path.normalize(_path.dirname(input.path)) == _path.normalize(this.output)));
        let finalOutput = this.output;
        if (sameDir)
        {
            this.output = _path.resolve(Config.temp_path, "tempOutput");
            this.logger.log("Detected an inplace modification, this will use a temp folder");
            await fse.remove(this.output);
        }

        await fse.ensureDir(this.output);

        if (this.layout.copy === true)
        {
            for (let [index, song] of this.layout.songs.entries())
            {
                await fse.copy(song.fullpath, this.output, {
                    overwrite: index == 0,
                    filter: (src: string, dest: string) => {
                        return (! this.audio.isAudioPath(dest) || this.layout.options.ignoreAudio)
                            && _path.extname(dest) != '.dat' && _path.extname(dest) != '.db'
                            && [
                                _path.normalize(_path.resolve(this.output + "/notes.mid")),
                                _path.normalize(_path.resolve(this.output + "/notes.chart")),
                                _path.normalize(_path.resolve(this.output + "/song.ini"))
                            ].indexOf(_path.normalize(_path.resolve(dest))) == -1;
                    }
                });
            }
        } else if (this.layout.copy)
        {
            for (let [filename, song] of Object.entries(this.layout.copy))
            {
                await fse.copy(song.fullpath + "/" + filename, this.output + "/" + filename, { overwrite: true });
            }
        }

        let promises = [
            fse.writeFile(this.output + '/song.ini', ini.stringify(this.layout.ini, {section: '', whitespace: true})),
            ChartIO.save(this.chart, this.output + '/notes.chart')
        ];

        if (!this.layout.options.ignoreAudio)
            promises.push(this.audio.save());

        await Promise.all(promises);

        if (sameDir)
        {
            if (await fse.pathExists(finalOutput))
            {
                let existingFiles = await fse.readdir(finalOutput);
                for (let file of existingFiles)
                {
                    if (await fse.pathExists(this.output + "/" + file))
                        continue;
                    try
                    {
                        await fse.remove(finalOutput + "/" + file);
                    }
                    catch (e)
                    {
                        this.logger.log("Warning: Could not remove " + file + " in output folder.")
                    }
                }
            }
            let newFiles = await fse.readdir(this.output);
            for (let file of newFiles)
            {
                await fse.promises.copyFile(this.output + "/" + file, finalOutput + "/" + file);
            }
            this.output = finalOutput;
        }
    }
}