import * as _path from 'path';
import * as fse from 'fs-extra';
import { AudioVoice } from './audioVoice';

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