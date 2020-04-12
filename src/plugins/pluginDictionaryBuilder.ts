import { Chart, ChartIO, ChartNote, ChartTrack, ChartTrackData, ChartSong } from "herochartio";
import { AppPlugin } from "../appPlugin";
import * as cliProgress from "cli-progress";
import * as _path from "path";
import * as _ from "lodash";
import * as fse from "fs-extra";
import { Config } from "../config";
import { Translation } from "./translations/translation";
import { Translations } from "./translations/translations";
import { TranslateMeasure } from "./translations/translateMeasure";
import { LayoutOptions } from "../layoutOptions";


export class PluginDictionaryBuilder extends AppPlugin
{
    async load(options: any)
    {
        await super.load(options);
        this.options.src = this.options.src || "ExpertSingle";
        if (!this.options.chart)
            throw new Error("Missing parameter 'chart' to save the dictionary");
        this.options.chart = Config.resolvePath(this.options.chart, Config.assets_dir, this.options.args);
    }

    async layoutPass(obj: any, layoutOptions: LayoutOptions)
    {
        layoutOptions.ignoreAudio = true;
        layoutOptions.ignoreSync = true;
        layoutOptions.ignoreDurationCheck = true;
    }

    async chartPass(chart: Chart)
    {
        let resolution = chart.Song.Resolution;
        let emptyTrack = Translations.emptyTrack;

        this.log("Started building dictionary");

        // Cut each tracks / measures
        let translatePart: {[name: string]: TranslateMeasure[]} = {};

        let chartTrackNames = Object.keys(chart.tracks).filter(name => name.endsWith("Single"));
        let totalLength = 0;
        for (let trackName of chartTrackNames)
        {
            totalLength += Object.keys(chart.tracks[trackName]).length;
        }

        const bar1 = new cliProgress.SingleBar({
            clearOnComplete: true,
            format: 'Splitting measures [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}'
        }, cliProgress.Presets.shades_classic);
        bar1.start(totalLength, 0);

        // cut measures
        let counter = 0;
        for (let trackName of chartTrackNames)
        {
            let track = chart.tracks[trackName];
            let translateTrack: TranslateMeasure[] = translatePart[trackName] = [];
            for (let _time in track)
            {
                let time = parseInt(_time);
                let elts: ChartNote[] = track[_time].filter(elt => elt.type == "N" && elt.touch < 5) as ChartNote[];
                let meas = Math.floor(time / resolution);
                let translateMeasure = translateTrack[meas];
                if (!translateMeasure)
                    translateMeasure = translateTrack[meas] = new TranslateMeasure({}, resolution);
                translateMeasure.track[time - meas * resolution] = elts;
                for (let elt of elts)
                {
                    elt.duration = 0;
                    if (elt.touch < translateMeasure.minTouch)
                        translateMeasure.minTouch = elt.touch;
                    if (elt.touch > translateMeasure.maxTouch)
                        translateMeasure.maxTouch = elt.touch;
                }
                bar1.update(++counter);
            }
        }
        bar1.stop();
        this.log("Splitted measures");

        let trackNames = Translations.trackNames;

        let translatePartSrc = translatePart[this.options.src];

        // fill empty measures
        for (let meas = 0; meas < translatePartSrc.length; meas++)
        {
            for (let trackName of trackNames)
            {
                let translateMeasure = translatePart[trackName][meas];
                if (!translateMeasure)
                    translateMeasure = translatePart[trackName][meas] = Translations.emptyTrack;
            }
        }
        this.log("Filled empty measures");

        // remove identity translations
        /*for (let meas_i = 0; meas_i < translatePartSrc.length; meas_i++)
        {
            let same = true;
            for (let trackName of trackNames)
            {
                if (trackName == this.options.src)
                    continue;

                if (!translatePart[trackName][meas_i].equal(translatePartSrc[meas_i]))
                {
                    same = false;
                    break;
                }
            }

            if (same)
            {
                //console.log('same')
                for (let trackName of trackNames)
                {
                    let translateTrack = translatePart[trackName];
                    let translateMeasure = translateTrack.pop() as TranslateMeasure;
                    if (meas_i < translateTrack.length - 1)
                        translateTrack[meas_i] = translateMeasure;
                }
                translatePartSrc = translatePart[this.options.src];
                if (meas_i < translatePartSrc.length - 1)
                    meas_i--;
                break;
            }
        }
        this.log("Removed identity translations");*/


        // Pack occurences
        let translations = new Translations();

        const bar2 = new cliProgress.SingleBar({
            clearOnComplete: true,
            format: '[{bar}] {percentage}% | ETA: {eta}s | {value}/{total}'
        }, cliProgress.Presets.shades_classic);
        bar2.start(Object.keys(translatePartSrc).length, 0);

        counter = 0;
        for (let _meas in translatePartSrc)
        {
            let meas = parseInt(_meas);
            let tracki = translatePartSrc[meas];

            bar2.update(++counter);

            if (tracki.equal(emptyTrack)) // skip empty translation
                continue;

            let translation = new Translation(tracki, {});
            for (let trackName of trackNames)
            {
                translation.best[trackName] = translatePart[trackName][meas];
            }
            translations.addTranslation(translation);
        }
        bar2.stop();
        this.log("Packed occurences");

        // Expand translations
        //translations.expandTranslations();
        //console.log(translations[6].minTouch, translations[6].maxTouch, translations[6].match, translations[6].best);
        //this.log("Factorized translations");

        // Sort translations and pretendants by occurences desc, compute translation max/min touch
        translations.sort();
        this.log("Sorted translations");

        //console.log(translations[6].minTouch, translations[6].maxTouch, translations[6].match, translations[6].best);

        //console.log(translations[0], translations[3]);

        // Write events
        for (let _meas in translations.translations)
        {
            let meas = parseInt(_meas);
            let translation: Translation = translations[meas];
            let evs = chart.Events[meas * resolution];
            if (!evs)
                evs = chart.Events[meas * resolution] = [];
            evs.push({
                type: "E",
                name: "#oc:" //+ trackNames.map(name => translation.best[name].occurences) // + translation.modifiers.join('/')
            })
        }
        this.log("Wrote events");

        // Linearize translations
        for (let trackName of trackNames)
        {
            let track: ChartTrack<ChartTrackData> = chart.tracks[trackName] = {};

            //console.log('linearize', trackName, translatePart[trackName]);
            for (let _meas in translations.translations)
            {
                let meas = parseInt(_meas);
                let translateMeasure = translations.translations[meas].best[trackName];
                for (let _time in translateMeasure.track)
                {
                    let time = parseInt(_time);
                    track[time + meas * resolution] = translateMeasure.track[time];
                }
            }
        }
        this.log("Linearized translations");

        // Write dictionary
        let chartPath = this.options.chart + ".chart";
        await fse.ensureDir(_path.dirname(chartPath));
        let infos = chart.Song;
        chart.Song = new ChartSong();
        chart.Song.Name = infos.Name;
        chart.Song.Resolution = resolution;
        chart.SyncTrack = {0: [
            {type: "B", value: 120000},
            {type: "TS", value: 1}
        ]};
        await ChartIO.save(chart, chartPath);

        this.log(`Wrote ${translations.translations.length} translations from ${translatePartSrc.length} measures to "${_path.basename(this.options.chart)}.chart"`);
    }
}