import { ChartIO, Chart, ChartEvent, ChartTrack } from 'herochartio'
import { Config } from "./config";
import * as fse from 'fs-extra';
import * as ini from 'ini';
import * as _path from 'path';
import { Layout } from './layout';
import { Audio } from './audio';
import { AudioVoice } from "./audioVoice";

export class Splicer
{
    chart: Chart;
    layout: Layout;
    output: string;
    audio: Audio;

    async run(config: string)
    {
        console.log("Loading config and inputs...");

        this.layout = await Layout.load(config);

        this.output = Config.local.songPath + "/" + this.layout.output;

        this.chart = new Chart();
        this.chart.Song = this.layout.infos;

        console.log("Writing new chart...")

        await this.setupAudio();

        await this.writeChart();

        console.log("Writing song files...");

        await this.writeFiles();

        console.log("Wrote song in " + this.output)
    }

    private async writeChart()
    {
        let time = this.layout.infos.Resolution * this.layout.start_blank;
        let events: ChartTrack<ChartEvent> = {};
        for (let part of this.layout.parts)
        {
            let chart = part.song.chart;

            let partStart = part.quantize ? Math.floor(part.start / chart.Song.Resolution / part.quantize) * chart.Song.Resolution : part.start;
            let partEnd = part.quantize ? Math.floor(part.end / chart.Song.Resolution / part.quantize) * chart.Song.Resolution : part.end;

            if (part.event)
                events[time] = [{ type:"E", name: "section " + part.event }];

            let partChart = chart.filterPositions(pos => pos >= partStart && pos < partEnd);
            partChart.mapTrackEntries(partChart.ExpertSingle, (value, ind) => {
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

            let startTime = chart.positionToSeconds(partStart) + (part.startOffset || 0) / 1000;
            let endTime = chart.positionToSeconds(partEnd) + (part.endOffset || 0) / 1000;

            for (let i = 0; i < part.repeat; i++)
            {
                this.audio.concat(part.song.index, startTime, endTime);

                if (this.chart.bpsAt(time) != chart.bpsAt(partStart))
                    this.chart.SyncTrack = this.chart.concatTrack({[time]: [{type: "B", value: chart.bpsAt(partStart)}]}, this.chart.SyncTrack);
                if (this.chart.signatureAt(time) != chart.signatureAt(partStart))
                    this.chart.SyncTrack = this.chart.concatTrack({[time]: [{type: "TS", value: chart.signatureAt(partStart)}]}, this.chart.SyncTrack);
                this.chart = this.chart.concat(partChart.mapPositions(pos => pos - partStart + time));
                time += partEnd - partStart;
            }
        }
        this.chart.Events = events;
    }

    private async setupAudio()
    {
        let firstPart = this.layout.parts[0];
        let firstBps = firstPart.song.chart.bpsAt(firstPart.start);

        this.audio = new Audio();
        let audioOuputs: {[name:string]: AudioVoice} = {};
        let audioInputs = await Promise.all(this.layout.songs.map(song => this.audio.scanVoices(song.fullpath)));
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
        await fse.ensureDir(this.output);

        if (this.layout.copy === true)
        {
            for (let [index, song] of this.layout.songs.entries())
            {
                await fse.copy(song.fullpath, this.output, {
                    overwrite: index == 0,
                    filter: (src: string, dest: string) => {
                        return ! this.audio.isAudioPath(dest)
                            && _path.extname(dest) != '.dat' && _path.extname(dest) != '.db' && _path.extname(dest) != '.json'
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

        await Promise.all([
            await this.audio.save(),
            await fse.writeFile(this.output + '/song.ini', ini.stringify(this.layout.ini, {section: '', whitespace: true})),
            await ChartIO.save(this.chart, this.output + '/notes.chart')
        ])
    }
}