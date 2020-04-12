import { ChartNote, ChartTrack, ChartTrackData } from "herochartio";
import * as crypto from "crypto";

export class TranslationTrack
{
    resolution: number
    track: ChartTrack<ChartTrackData>
    hash: string

    constructor(track: ChartTrack<ChartTrackData>, resolution: number)
    {
        this.resolution = resolution;
        this.track = track;
    }

    calculateHash()
    {
        let hash = crypto.createHash("md5");
        hash.update("t");
        for (let time in this.track)
        {
            let elts: ChartNote[] = this.track[time].filter(elt => elt.type == "N" && elt.touch < 5) as ChartNote[];
            if (!elts.length)
                continue;
            hash.update((this.resolution / parseInt(time)).toString());
            for (let elt of elts)
            {
                hash.update(elt.touch.toString());
            }
        }
        this.hash = hash.digest('latin1');
    }

    equal(other: TranslationTrack)
    {
        if (!this.hash)
            this.calculateHash();
        if (!other.hash)
            other.calculateHash();
        return this.hash == other.hash;
    }

    toArray(): number[]
    {
        let values: number[] = [];
        values.length = 48 * 5;
        values.fill(0);
        for (let _time in this.track)
        {
            let time = parseInt(_time);
            let elts = this.track[_time];
            for (let elt of elts)
            {
                if (elt.type == "N" && elt.touch < 5)
                    values[Math.floor(time * 48 / this.resolution) * 5 + elt.touch] = 1;
            }
        }
        return values;
    }

    fromArray(arr: number[])
    {
        this.track = {};
        for (let time = 0; time < 48; time++)
        {
            let elts: ChartNote[] = [];
            for (let i = 0; i < 5; i++)
            {
                if (arr[time * 5 + i] > 0.5)
                {
                    elts.push({
                        type: "N",
                        touch: i,
                        duration: 0
                    });
                }
            }
            if (elts.length)
                this.track[time * this.resolution / 48] = elts;
        }
    }
}