import { Chart, ChartIO, ChartNote, ChartTrack, ChartTrackData } from "herochartio";
import { AppPlugin } from "../appPlugin";
import * as _path from "path";
import * as cliProgress from "cli-progress";
import { Config } from "../config";
import * as _ from "lodash";
import { TranslateMeasure } from "./translations/translateMeasure";
import { Translations } from "./translations/translations";

export class PluginDictionaryTranslator extends AppPlugin
{
    chartTranslator: Chart

    async load(options: any)
    {
        await super.load(options);
        this.options.src = this.options.src || "ExpertSingle";
        if (!this.options.chart)
            throw new Error("Missing parameter 'chart' to load the dictionary");
        this.options.overwrite = Config.resolveView(this.options.overwrite, this.options.args);
        this.options.chart = Config.resolvePath(this.options.chart, Config.assets_dir, this.options.args);
    }

    async chartPass(chart: Chart)
    {
        this.log(`Started building translations using ${_path.basename(this.options.chart)}.chart"`);

        let resolution = chart.Song.Resolution;

        let chartTrackNames = Translations.trackNames.filter(name =>
            name != this.options.src && (!(chart.tracks[name] && Object.keys(chart.tracks[name]).length) || this.options.overwrite)
        );
        if (!chartTrackNames.length)
        {
            this.log("Skipping translation as they're not empty and not overwrite option");
            return;
        }

        this.log("Loading dictionary");
        let chartDictionary = await ChartIO.load(this.options.chart);
        if (chartDictionary.Song.Resolution != resolution)
        {
            resolution = chartDictionary.Song.Resolution;
            chart.convertResolution(resolution);
        }

        const bar1 = new cliProgress.SingleBar({
            clearOnComplete: true,
            format: 'Splitting measures [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}'
        }, cliProgress.Presets.shades_classic);
        bar1.start(Object.keys(chart.tracks[this.options.src]).length, 0);

        // Cut each tracks / measures
        let counter = 0;
        let translatePartSrc: TranslateMeasure[] = [];
        let trackSrc = chart.tracks[this.options.src];
        for (let _time in trackSrc)
        {
            let time = parseInt(_time);
            let elts: ChartNote[] = trackSrc[_time].filter(elt => elt.type == "N" && elt.touch < 5) as ChartNote[];
            let meas = Math.floor(time / resolution);
            let translateMeasure = translatePartSrc[meas];
            if (!translateMeasure)
                translateMeasure = translatePartSrc[meas] = new TranslateMeasure({}, resolution);
            translateMeasure.track[time - meas * resolution] = elts;
            bar1.update(++counter);
        }
        bar1.stop();
        this.log("Splitted measures");

        let trackNames = Translations.trackNames;

        let translations = new Translations();
        translations.loadTranslations(chartDictionary);

        // fill empty measures
        for (let trackName of chartTrackNames)
        {
            let track: ChartTrack<ChartTrackData> = chart.tracks[trackName] = {};

            for (let meas = 0; meas < translatePartSrc.length; meas++)
            {
                let translateMeasure = translations.translateMeasure(trackName, translatePartSrc[meas] || new TranslateMeasure({}, resolution));
                if (!translateMeasure)
                    continue; // todo: fallback

                for (let _time in translateMeasure.track)
                {
                    let time = parseInt(_time);
                    let trackTime = time + meas * resolution;
                    let elts = track[trackTime] = translateMeasure.track[time];

                    for (let elt of elts)
                    {
                        let srcElts = chart.tracks[this.options.src][trackTime];
                        if (!srcElts)
                            continue;

                        let originalElt: ChartNote = srcElts.find(e => e.type == "N" && e.type == elt.type && e.touch == elt.touch) as ChartNote;
                        if (originalElt)
                            (elt as ChartNote).duration = originalElt.duration;
                    }
                }
            }
        }
        this.log("Translated measures");
    }
}