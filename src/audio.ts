import * as _path from 'path';
import * as ffmpeg from "fluent-ffmpeg"
import * as fse from 'fs-extra';
import { Config } from "./config";

export class AudioVoice
{
    output: string
    inputs: string[] = []
    delay: number = 0
    delay_samples: number = 0
    sampling: number = 44100

    private filters: ffmpeg.FilterSpecification[] = []
    private outputs: string[] = []

    addInput(path: string)
    {
        this.inputs.push(path);
    }

    concat(inputIndex: number, startPts: number, endPts: number)
    {
        this.filters.push({
            filter: 'atrim', options: {'start_pts': startPts, 'end_pts': endPts},
            inputs: inputIndex + ':0', outputs: 'trimpart' + this.outputs.length
        });
        this.filters.push({
            filter: 'asetpts', options: 'PTS-STARTPTS',
            inputs: ['trimpart' + this.outputs.length], outputs: 'part' + this.outputs.length
        });
        this.outputs.push('part' + this.outputs.length);
    }

    async save(path?: string)
    {
        path = path || this.output;

        this.filters.push({
            filter: 'concat', options: {'n': this.outputs.length, 'v': 0, 'a': 1},
            inputs: this.outputs, outputs: this.delay ? 'merged' : 'output'
        });
        if (this.delay)
        {
            this.filters.push({
                filter: 'adelay', options: {'delays': Math.floor(this.sampling * this.delay + this.delay_samples - 1) + "S", 'all': 1},
                inputs: 'merged', outputs: 'output'
            });
        }

        let cmd = ffmpeg();
        for (let input of this.inputs)
        {
            cmd = cmd.input(input);
        }
        cmd = cmd.complexFilter(this.filters, 'output');
        cmd = cmd.output(path);

        await this.ffmpegAsync(cmd);
    }

    private async ffmpegAsync(cmd: ffmpeg.FfmpegCommand)
    {
        if (await fse.pathExists(Config.bin_dir + "/ffmpeg") || await fse.pathExists(Config.bin_dir + "/ffmpeg.exe"))
            cmd = cmd.setFfmpegPath(Config.bin_dir + "/ffmpeg")
        await new Promise((resolve, reject) => {
            cmd.on('error', (err) => {
                reject(err);
            }).on('end', () => {
                resolve();
            }).run();
        });
    }
}

export class Audio
{
    voices: AudioVoice[] = [];

    addVoice(output: string): AudioVoice
    {
        let voice = new AudioVoice();
        voice.output = output;
        this.voices.push(voice);
        return voice;
    }

    addInput(input: string)
    {
        this.voices.forEach(voice => voice.addInput(input));
    }

    isAudioPath(output: string): boolean
    {
        return ['.mp3', '.ogg'].indexOf(_path.extname(output)) != -1
    }

    setDelay(delay: number, delay_samples: number)
    {
        this.voices.forEach(voice => {
            voice.delay = delay;
            voice.delay_samples = delay_samples;
        });
    }

    concat(inputIndex: number, startPts: number, endPts: number)
    {
        this.voices.forEach(voice => voice.concat(inputIndex, startPts, endPts));
    }

    async scanVoices(path: string): Promise<string[]>
    {
        let files = await fse.readdir(path);
        files = files.map(file => _path.basename(file)).filter(file => ['.mp3', '.ogg'].indexOf(_path.extname(file)) != -1);
        return files;
    }

    async save()
    {
        await Promise.all(this.voices.map(voice => voice.save()));
    }
}