import { AppPlugin } from "../appPlugin";
import { Chart } from "herochartio";
import { Logger } from "../logger";

export class PluginNoteLimiter extends AppPlugin
{
    async load(options: any)
    {
        await super.load(options);
        this.options.maxStep = this.options.maxStep || {};
        this.options.maxStep.Expert = this.options.maxStep.Expert || 1000;
        this.options.maxStep.Hard = this.options.maxStep.Hard || 24;
        this.options.maxStep.Medium = this.options.maxStep.Medium || 16;
        this.options.maxStep.Easy = this.options.maxStep.Easy || 8;
    }

    async chartPass(chart: Chart)
    {
        this.log(`Limit notes density with max step Expert:1/${this.options.maxStep.Expert}, Hard:1/${this.options.maxStep.Hard}, Medium:1/${this.options.maxStep.Medium}, Easy:1/${this.options.maxStep.Easy}`);

        for (let trackName in chart.tracks)
        {
            let matchs = trackName.match(/^.*(Expert|Hard|Medium|Easy)/);
            if (!matchs)
                continue;
            let maxStep = chart.Song.Resolution * 4 / this.options.maxStep[matchs[1]];

            let lastTime = -999;
            let track = chart.tracks[trackName];
            let trackEntries = Object.entries(track);
            for (let i in trackEntries)
            {
                let [_time, elts] = trackEntries[i];
                let time = parseInt(_time);
                if (time - lastTime < maxStep)
                {
                    track[time] = elts.filter(elt => elt.type != "N" || elt.touch > 5);
                }
                if (track[time].findIndex(elt => elt.type == "N" && elt.touch < 5) != -1)
                    lastTime = time;
                if (track[time].length == 0)
                    delete track[time];
            }
        }
    }
}