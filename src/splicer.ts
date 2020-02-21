import { ChartIO, Chart } from 'herochartio'
import { Config } from "./config";
import * as fse from 'fs-extra';
import * as ini from 'ini';
import * as _path from 'path';
import { Layout } from './layout';
import { Audio, AudioVoice } from './audio';

export class Splicer
{
    audio: Audio;

    async run(config: string)
    {
        let layout = await Layout.load(config);

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
        let audioInputs = await Promise.all(layout.songs.map(song => this.audio.scanVoices(Config.local.songPath + "/" + song.path)));
        audioInputs.forEach((inputs, index) =>
        {
            for (let input of inputs)
            {
                let voiceName = input.substr(0, input.length - _path.extname(input).length);
                if (!audioOuputs[voiceName])
                    audioOuputs[voiceName] = this.audio.addVoice(output + "/" + voiceName + ".ogg");
                audioOuputs[voiceName].addInput(Config.local.songPath + "/" + layout.songs[index].path + "/" + input);
            }
        });
        this.audio.setDelay(layout.start_blank * (60000 / firstBps), layout.samples_offset);

        if (audioOuputs["song"]) newChart.Song.MusicStream = _path.basename(audioOuputs["song"].output);
        if (audioOuputs["guitar"]) newChart.Song.GuitarStream = _path.basename(audioOuputs["guitar"].output);
        if (audioOuputs["bass"]) newChart.Song.BassStream = _path.basename(audioOuputs["bass"].output);
        if (audioOuputs["rhythm"]) newChart.Song.RhythmStream = _path.basename(audioOuputs["rhythm"].output);
        if (audioOuputs["drum"]) newChart.Song.DrumStream = _path.basename(audioOuputs["drum"].output);

        let time = layout.infos.Resolution * layout.start_blank;
        for (let part of layout.parts)
        {
            let chart = part.song.chart;
            let startPts = Math.round(chart.positionToSeconds(part.start) * part.song.sampling);
            let endPts = Math.round(chart.positionToSeconds(part.end) * part.song.sampling) - 1;

            let partChart = chart.filterPositions(pos => pos >= part.start && pos < part.end);

            for (let i = 0; i < part.repeat; i++)
            {
                this.audio.concat(part.song.index, startPts, endPts);

                if (newChart.bpsAt(time) != chart.bpsAt(part.start))
                    newChart.SyncTrack = newChart.concatTrack({[time]: [{type: "B", value: chart.bpsAt(part.start)}]}, newChart.SyncTrack);
                if (newChart.signatureAt(time) != chart.signatureAt(part.start))
                    newChart.SyncTrack = newChart.concatTrack({[time]: [{type: "TS", value: chart.signatureAt(part.start)}]}, newChart.SyncTrack);
                newChart = newChart.concat(partChart.mapPositions(pos => pos - part.start + time));
                time += part.end - part.start;
            }
        }

        await fse.ensureDir(output);
        for (let [index, song] of layout.songs.entries())
        {
            await fse.copy(Config.local.songPath + "/" + song.path, output, {
                overwrite: index == 0,
                filter: (src: string, dest: string) => {
                    return ! this.audio.isAudioPath(dest)
                        && _path.extname(dest) != '.dat'
                        && [
                            _path.normalize(_path.resolve(output + "/notes.mid")),
                            _path.normalize(_path.resolve(output + "/notes.chart")),
                            _path.normalize(_path.resolve(output + "/song.ini"))
                        ].indexOf(_path.normalize(_path.resolve(dest))) == -1;
                }
            });
        }

        await Promise.all([
            await this.audio.save(),
            await fse.writeFile(output + '/song.ini', ini.stringify(layout.ini, {section: '', whitespace: true})),
            await ChartIO.save(newChart, output + '/notes.chart')
        ])

        console.log("Wrote song in " + output)
    }
}