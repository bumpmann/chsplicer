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
    audio: Audio;

    async run(config: string)
    {
        console.log("Loading config and inputs...");

        let layout = await Layout.load(config);

        console.log("Writing new chart...")

        let output = Config.local.songPath + "/" + layout.output;

        let firstPart = layout.parts[0];
        let firstBps = firstPart.song.chart.bpsAt(firstPart.start);

        let newChart = new Chart();
        newChart.Song = layout.infos;
        newChart.SyncTrack = {
            '0': [
                {type: "B", value: firstBps},
                {type: "TS", value: firstPart.song.chart.signatureAt(firstPart.start)}
            ]
        };

        this.audio = new Audio();
        let audioOuputs: {[name:string]: AudioVoice} = {};
        let audioInputs = await Promise.all(layout.songs.map(song => this.audio.scanVoices(song.fullpath)));
        for (let [index, inputs] of audioInputs.entries())
        {
            let song = layout.songs[index];
            for (let input of inputs)
            {
                let voiceName = input.substr(0, input.length - _path.extname(input).length);
                let voice = audioOuputs[voiceName];
                let inputFile = song.fullpath + "/" + voiceName;
                if (!voice)
                    voice = audioOuputs[voiceName] = this.audio.addVoice(output + "/" + voiceName + ".ogg");
                await voice.addInput(index, inputFile);
            }
        }
        this.audio.setDelay(layout.start_blank * (60000 / firstBps), layout.samples_offset);

        if (audioOuputs["song"]) newChart.Song.MusicStream = _path.basename(audioOuputs["song"].output);
        if (audioOuputs["guitar"]) newChart.Song.GuitarStream = _path.basename(audioOuputs["guitar"].output);
        if (audioOuputs["bass"]) newChart.Song.BassStream = _path.basename(audioOuputs["bass"].output);
        if (audioOuputs["rhythm"]) newChart.Song.RhythmStream = _path.basename(audioOuputs["rhythm"].output);
        if (audioOuputs["drum"]) newChart.Song.DrumStream = _path.basename(audioOuputs["drum"].output);

        let time = layout.infos.Resolution * layout.start_blank;
        let events: ChartTrack<ChartEvent> = {};
        for (let part of layout.parts)
        {
            let chart = part.song.chart;

            let partStart = part.quantize ? Math.floor(part.start / chart.Song.Resolution / part.quantize) * chart.Song.Resolution : part.start;
            let partEnd = part.quantize ? Math.floor(part.end / chart.Song.Resolution / part.quantize) * chart.Song.Resolution : part.end;

            let startPts = Math.round(chart.positionToSeconds(partStart) * part.song.sampling) + (part.startOffset||0);
            let endPts = Math.round(chart.positionToSeconds(partEnd) * part.song.sampling) + (part.endOffset||0);

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

            for (let i = 0; i < part.repeat; i++)
            {
                this.audio.concat(part.song.index, startPts, endPts);

                if (newChart.bpsAt(time) != chart.bpsAt(partStart))
                    newChart.SyncTrack = newChart.concatTrack({[time]: [{type: "B", value: chart.bpsAt(partStart)}]}, newChart.SyncTrack);
                if (newChart.signatureAt(time) != chart.signatureAt(partStart))
                    newChart.SyncTrack = newChart.concatTrack({[time]: [{type: "TS", value: chart.signatureAt(partStart)}]}, newChart.SyncTrack);
                newChart = newChart.concat(partChart.mapPositions(pos => pos - partStart + time));
                time += partEnd - partStart;
            }
        }
        newChart.Events = events;

        console.log("Writing song files...");

        await fse.ensureDir(output);

        if (layout.copy === true)
        {
            for (let [index, song] of layout.songs.entries())
            {
                await fse.copy(song.fullpath, output, {
                    overwrite: index == 0,
                    filter: (src: string, dest: string) => {
                        return ! this.audio.isAudioPath(dest)
                            && _path.extname(dest) != '.dat' && _path.extname(dest) != '.db' && _path.extname(dest) != '.json'
                            && [
                                _path.normalize(_path.resolve(output + "/notes.mid")),
                                _path.normalize(_path.resolve(output + "/notes.chart")),
                                _path.normalize(_path.resolve(output + "/song.ini"))
                            ].indexOf(_path.normalize(_path.resolve(dest))) == -1;
                    }
                });
            }
        } else if (layout.copy)
        {
            for (let [filename, song] of Object.entries(layout.copy))
            {
                await fse.copy(song.fullpath + "/" + filename, output + "/" + filename, { overwrite: true });
            }
        }

        await Promise.all([
            await this.audio.save(),
            await fse.writeFile(output + '/song.ini', ini.stringify(layout.ini, {section: '', whitespace: true})),
            await ChartIO.save(newChart, output + '/notes.chart')
        ])

        console.log("Wrote song in " + output)
    }
}