import * as brain from "brain.js";
import { Chart, ChartNote, ChartTrack, ChartTrackData } from "herochartio";
import { AppPlugin } from "../appPlugin";
import * as _path from "path";
import * as fse from "fs-extra";
import * as cliProgress from "cli-progress";
import { Config } from "../config";
import * as _ from "lodash";
import { TranslateMeasure } from "./translations/translateMeasure";
import { Translations } from "./translations/translations";
import { Brain, BrainConfig } from "./pluginAiTrainer";

export class PluginAiTranslator extends AppPlugin
{
    net: {[name: string]: brain.NeuralNetwork} = {};

    chartTranslator: Chart

    async load(options: any)
    {
        await super.load(options);
        this.options.src = this.options.src || "ExpertSingle";
        if (!this.options.path)
            throw new Error("Missing parameter 'path' of the trained ai");
        if ((typeof this.options.overwrite) == "string")
            this.options.overwrite = Config.resolveView(this.options.overwrite, this.options.args);
        this.options.path = Config.resolvePath(this.options.path, Config.assets_dir, this.options.args);
    }

    async chartPass(chart: Chart)
    {
        this.log(`Started building translations using ${_path.basename(this.options.path)}"`);

        let resolution = chart.Song.Resolution;

        if (!chart.tracks[this.options.src])
        {
            this.log(`Skipping translation as there is no track "${this.options.src}" to translate`);
            return;
        }

        let chartTrackNames = Translations.trackNames.filter(name =>
            name != this.options.src && (!(chart.tracks[name] && Object.keys(chart.tracks[name]).length) || this.options.overwrite)
        );
        if (!chartTrackNames.length)
        {
            this.log("Skipping translation as they're not empty and not overwrite option");
            return;
        }

        const bar1 = new cliProgress.SingleBar({
            clearOnComplete: true,
            format: 'Splitting measures [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}'
        }, cliProgress.Presets.shades_classic);
        bar1.start(Object.keys(chart.tracks[this.options.src]).length, 0);

        // cut measures
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

        await this.loadBrain();

        // translate measures
        for (let trackName of chartTrackNames)
        {
            let track: ChartTrack<ChartTrackData> = chart.tracks[trackName] = {};

            for (let meas = 0; meas < translatePartSrc.length; meas++)
            {
                let translateMeasure: TranslateMeasure = await this.translateMeasure(trackName, translatePartSrc[meas] || new TranslateMeasure({}, resolution));

                for (let _time in translateMeasure.track)
                {
                    let time = parseInt(_time);
                    let trackTime = time + meas * resolution;
                    let elts = track[trackTime] = translateMeasure.track[time];
                    let srcElts = trackSrc[trackTime];
                    if (!srcElts)
                        continue;

                    let originalShortNote = srcElts.reduce((p, c) => c.type == "N" && p.type == "N" && c.touch < 5 && c.duration < p.duration ? c : p, {type: "N", duration: 99999});
                    let maxDuration = originalShortNote.duration == 99999 ? 0 : originalShortNote.duration;

                    for (let elt of elts)
                    {
                        (elt as ChartNote).duration = maxDuration;
                    }
                }
            }

            for (let _time in trackSrc)
            {
                let starPowerElt = trackSrc[_time].find(e => e.type == "S")
                if (starPowerElt)
                {
                    let newElts = track[_time];
                    if (newElts)
                        newElts.unshift(starPowerElt);
                    else
                        track[_time] = [starPowerElt];
                }
            }
        }
        this.log("Translated measures");
    }

    async loadBrain()
    {
        let brainInfos: Brain;
        try
        {
            brainInfos = await fse.readJson(`${this.options.path}/brain.json`);
        }
        catch (e)
        {
            throw new Error("Could not load " + _path.basename(`${this.options.path}/brain.json`));
        }

        for (let trackName in brainInfos.tracks)
        {
            let bestModel: BrainConfig = brainInfos.tracks[trackName].best;
            try
            {
                this.net[trackName] = new brain.NeuralNetwork(bestModel.config);
                this.net[trackName].fromJSON(await fse.readJson(`${this.options.path}/${bestModel.name}`));
            }
            catch (e)
            {
                throw new Error("Could not load " + _path.basename(`${bestModel.name}`));
            }
        }
    }

    async translateMeasure(trackName: string, measure: TranslateMeasure): Promise<TranslateMeasure>
    {
        let outputs = this.net[trackName].run(measure.toArray());
        let outputMeasure = new TranslateMeasure({}, measure.resolution);
        outputMeasure.fromArray(outputs);
        return outputMeasure;
    }
}