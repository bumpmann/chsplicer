import * as ffmpeg from "fluent-ffmpeg"
import * as fse from 'fs-extra';
import * as mm from 'music-metadata';
import { Config } from "./config";
import { start } from "repl";

export class AudioVoice
{
    output: string
    inputs: string[] = []
    inputsName: {[index: number]: string} = {}
    inputsPath: {[index: number]: string} = {}
    inputsNumberOfSamples: {[index: number]: number} = {};
    delay: number = 0
    delay_samples: number = 0
    sampling: number = 44100
    valid_exts = ['.ogg', '.mp3'];

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

    async addInput(index: number, path: string)
    {
        path = await this.findInput(path);

        if (!path)
            return;

        this.inputsName[index] = this.inputs.length + ':0';
        this.inputsPath[index] = path;
        this.inputs.push(path);

        let parsedMeta = await mm.parseFile(path, { duration: true });

        let numberOfSamples = parsedMeta.format.numberOfSamples;
        if (numberOfSamples)
        {
            this.inputsNumberOfSamples[index] = numberOfSamples;
        }

        let sampleRate = parsedMeta.format.sampleRate;
        if (sampleRate)
        {
            if (sampleRate != this.sampling)
                throw new Error("Audio inputs must be of same sample rate (" + path + " with " + sampleRate + ")");
            this.sampling = sampleRate;
        }
    }

    concat(index: number, startPts: number, endPts: number)
    {
        if (this.inputsName[index])
        {
            if (endPts > this.inputsNumberOfSamples[index])
            {
                console.log("Required end sampling point: " + endPts + ", audio number of samples: " + this.inputsNumberOfSamples[index]);
                throw new Error('Trying to add a note that is outside the audio range, please check end point for ' + this.inputsPath[index]);
            }
            this.filters.push({
                filter: 'atrim', options: {'start_pts': startPts, 'end_pts': endPts},
                inputs: this.inputsName[index], outputs: 'trimpart' + this.outputs.length
            });
            this.filters.push({
                filter: 'asetpts', options: 'PTS-STARTPTS',
                inputs: ['trimpart' + this.outputs.length], outputs: 'part' + this.outputs.length
            });
        }
        else
        {
            this.filters.push({
                filter: 'anullsrc', options: {'r': this.sampling || 44100},
                outputs: 'nullpart' + this.outputs.length
            });
            this.filters.push({
                filter: 'atrim', options: {'start_pts': 0, 'end_pts': endPts - startPts},
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
            cmd = cmd.setFfmpegPath(Config.bin_dir + "/ffmpeg").outputOption("-threads 7")
        let cmdLine = "";
        await new Promise((resolve, reject) => {
            cmd.on('start', function(commandLine) {
                cmdLine = commandLine;
            }).on('error', (err) => {
                if (err.message)
                    err.message += "\nError with ffmpeg command " + cmdLine;
                reject(err);
            }).on('end', () => {
                resolve();
            }).run();
        });
    }
}
