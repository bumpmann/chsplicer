import * as ffmpeg from "fluent-ffmpeg"
import * as fse from 'fs-extra';
import * as mm from 'music-metadata';
import { Config } from "./config";
import { EventEmitter } from "events";

export class VoiceInput
{
    reference: string;
    path: string;
    sampleRate: number;
    numberOfSamples: number;
}

export class AudioVoice extends EventEmitter
{
    output: string
    inputs: {[index: number]: VoiceInput} = {}
    delay: number = 0
    delay_samples: number = 0
    sampling: number = 44100
    valid_exts = ['.ogg', '.mp3'];
    expectedDuration: number = 0;
    currentDuration: number = 0;
    currentSpeed: number = 0;
    autoOffset: number = 0;

    private filters: ffmpeg.FilterSpecification[] = []
    private outputs: string[] = []

    private async findInput(path: string) : Promise<string>
    {
        for (let ext of this.valid_exts)
        {
            if (await fse.pathExists(path + ext))
                return path + ext;
        }
        return "";
    }

    getDuration(): number
    {
        if (!Object.keys(this.inputs).length)
            return 0;

        let longestInput = Object.values(this.inputs).reduce((m, v) => (v.numberOfSamples / v.sampleRate) > (m.numberOfSamples / m.sampleRate) ? v : m);
        return longestInput.numberOfSamples / longestInput.sampleRate;
    }

    async addInput(index: number, path: string)
    {
        path = await this.findInput(path);

        if (!path)
            return;

        let input = new VoiceInput();

        input.reference = Object.keys(this.inputs).length + ':0';
        input.path = path;

        let parsedMeta = await mm.parseFile(path, { duration: true });

        let numberOfSamples = parsedMeta.format.numberOfSamples;
        if (numberOfSamples)
            input.numberOfSamples = numberOfSamples;

        let sampleRate = parsedMeta.format.sampleRate;
        if (sampleRate)
        {
            //if (sampleRate != this.sampling)
            //    throw new Error("Audio inputs must be of same sample rate (" + path + " with " + sampleRate + ")");
            input.sampleRate = sampleRate;
        }
        this.inputs[index] = input;
    }

    concat(index: number, startTime: number, endTime: number)
    {
        let input = this.inputs[index];
        if (this.autoOffset)
            endTime += ((endTime - startTime) / this.autoOffset) / 1000;
        this.expectedDuration += endTime - startTime;
        if (input)
        {
            let startPts = Math.round(startTime * input.sampleRate);
            let endPts = Math.round(endTime * input.sampleRate);
            if (endPts > input.numberOfSamples)
            {
                //console.log("Required end sampling point: " + endPts + ", audio number of samples: " + input.numberOfSamples);
                //throw new Error('Trying to add a note that is outside the audio range, please check end point for ' + input.path);
            }
            this.filters.push({
                filter: 'atrim', options: {'start_pts': startPts, 'end_pts': endPts},
                inputs: input.reference, outputs: 'trimpart' + this.outputs.length
            });
            this.filters.push({
                filter: 'asetpts', options: 'PTS-STARTPTS',
                inputs: ['trimpart' + this.outputs.length], outputs: 'part' + this.outputs.length
            });
        }
        else
        {
            this.filters.push({
                filter: 'anullsrc', options: {'r': 44100},
                outputs: 'nullpart' + this.outputs.length
            });
            this.filters.push({
                filter: 'atrim', options: {'start_pts': 0, 'end_pts': Math.round((endTime - startTime) * 44100)},
                inputs: ['nullpart' + this.outputs.length], outputs: 'part' + this.outputs.length
            });
        }
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
            this.expectedDuration += this.delay + (this.delay_samples - 1) / this.sampling;
            this.filters.push({
                filter: 'adelay', options: {'delays': Math.floor(this.sampling * this.delay + this.delay_samples - 1) + "S", 'all': 1},
                inputs: 'merged', outputs: 'output'
            });
        }

        let cmd = ffmpeg();
        for (let input of Object.values(this.inputs))
        {
            cmd = cmd.input(input.path);
        }
        cmd = cmd.complexFilter(this.filters, 'output');
        cmd = cmd.output(path);

        await this.ffmpegAsync(cmd);
    }

    private async ffmpegAsync(cmd: ffmpeg.FfmpegCommand)
    {
        if (await fse.pathExists(Config.bin_dir + "/ffmpeg") || await fse.pathExists(Config.bin_dir + "/ffmpeg.exe"))
            cmd = cmd.setFfmpegPath(Config.bin_dir + "/ffmpeg").outputOption("-threads 7")
        let cmdLine = "";
        await new Promise((resolve, reject) => {
            cmd.on('start', commandLine => {
                cmdLine = commandLine;
            }).on('progress', progress => {
                if (progress && progress.timemark)
                {
                    let timeParse = progress.timemark.match(/(\d\d):(\d\d):(\d\d\.\d\d)/);
                    this.currentDuration = parseInt(timeParse[1]) * 3600 + parseInt(timeParse[2]) * 60 + parseFloat(timeParse[3]);
                    this.currentSpeed = progress.currentKbps;
                    this.emit('progress');
                }
            }).on('error', err => {
                if (err.message)
                    err.message += "\nError with ffmpeg command " + cmdLine;
                reject(err);
            }).on('end', () => {
                resolve();
            }).run();
        });
    }
}
