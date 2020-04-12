import * as _path from 'path';
import * as fse from 'fs-extra';
import { AudioVoice } from './audioVoice';
import * as cliProgress from "cli-progress";

export class Audio
{
    voices: AudioVoice[] = [];
    expectedDuration: number = 0;
    currentDuration: number = 0;
    currentSpeed: number = 0;
    autoOffset: number = 0;

    addVoice(output: string): AudioVoice
    {
        let voice = new AudioVoice();
        voice.output = output;
        voice.autoOffset = this.autoOffset;
        this.voices.push(voice);
        return voice;
    }

    getDuration()
    {
        let duration = 0;
        for (let voice of this.voices)
        {
            let voiceDuration = voice.getDuration();
            if (voiceDuration > duration)
                duration = voiceDuration;
        }
        return duration;
    }

    async addInput(index: number, input: string)
    {
        return Promise.all(this.voices.map(voice => voice.addInput(index, input)));
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

    concat(inputIndex: number, startTime: number, endTime: number)
    {
        this.voices.forEach(voice => voice.concat(inputIndex, startTime, endTime));
    }

    async scanVoices(path: string): Promise<string[]>
    {
        let files = await fse.readdir(path);
        files = files.map(file => _path.basename(file)).filter(file => ['.mp3', '.ogg'].indexOf(_path.extname(file)) != -1 && !file.startsWith("preview."));
        return files;
    }

    async save()
    {
        this.expectedDuration = 0;
        this.voices.forEach(voice => {
            this.expectedDuration += voice.expectedDuration;
            voice.on('progress', () => {
                this.currentDuration = 0;
                this.currentSpeed = 0;
                this.voices.forEach(voice => {
                    this.currentDuration += voice.currentDuration;
                    this.currentSpeed += voice.currentSpeed;
                });
            });
        });

        const bar1 = new cliProgress.SingleBar({
            clearOnComplete: true,
            format: '[{bar}] {percentage}% | ETA: {eta}s | {value}/{total} | Speed: {speed} kbps'
        }, cliProgress.Presets.shades_classic);
        bar1.start(Math.ceil(this.expectedDuration), 0, {
            speed: "N/A"
        });

        let barupdate = setInterval(() => {
            bar1.update(Math.floor(this.currentDuration), {
                speed: Math.round(this.currentSpeed * 10) / 10
            });
        }, 500);

        await Promise.all(this.voices.map(voice => voice.save()));
        this.voices.forEach(voice => voice.removeAllListeners('progress'));

        clearInterval(barupdate);
        bar1.stop();
    }
}