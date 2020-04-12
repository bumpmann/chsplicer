import { Chart, ChartIO } from "herochartio";
import { AppPlugin } from '../appPlugin';

export class PluginTrackCopy extends AppPlugin
{
    async load(options: any)
    {
        if (!options.src)
            throw new Error('Missing option "src" in trackCopy plugin');
            if (!options.dst)
            throw new Error('Missing option "dst" in trackCopy plugin');
        await super.load(options);
    }

    async chartPass(chart: Chart)
    {
        chart.tracks[this.options.dst] = chart.copyTrack(chart.tracks[this.options.src]);
    }
}