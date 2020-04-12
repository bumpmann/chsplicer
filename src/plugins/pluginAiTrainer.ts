import { Chart, ChartIO, ChartNote, ChartTrack, ChartTrackData, ChartSong } from "herochartio";
import { AppPlugin } from "../appPlugin";
import * as cliProgress from "cli-progress";
import * as _path from "path";
import * as _ from "lodash";
import * as fse from "fs-extra";
import * as brain from "brain.js";
import * as cluster from "cluster";
import { Config } from "../config";
import { Translation } from "./translations/translation";
import { Translations } from "./translations/translations";
import { TranslateMeasure } from "./translations/translateMeasure";
import { LayoutOptions } from "../layoutOptions";


export class PluginAiTrainer extends AppPlugin
{
    static nnConfig: brain.INeuralNetworkOptions = {
        hiddenLayers: [48 * 5, 48 * 5],
    };

    async load(options: any)
    {
        await super.load(options);
        this.options.src = this.options.src || "ExpertSingle";
        if (!this.options.path)
            throw new Error("Missing parameter 'path' of the ai to train");
        this.options.path = Config.resolvePath(this.options.path, Config.assets_dir, this.options.args);
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

        this.log("Started ai trainer");

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

        await this.checkBrain();
        await this.learn(translations);
    }

    async learn(translations: Translations)
    {
        const saveEachIterations = 10;
        await fse.ensureDir(_path.dirname(this.options.path));

        console.log("-----------------------------------");
        console.log("The neural net will start training.");
        console.log("This will save each " + saveEachIterations + " iterations.");
        console.log("For a good learning, the error rate");
        console.log("should be around 2.");
        console.log("Press Ctrl+C to stop training and exit");
        console.log("-----------------------------------");

        const multibar = new cliProgress.MultiBar({
            hideCursor: true,
            format: '[{bar}] {error}\t{trackName}#{iteration}'
        }, cliProgress.Presets.shades_classic);

        for (let trackName of Translations.trackNames)
        {
            if (trackName == "ExpertSingle")
                continue;

            let dataset = translations.translations.map(translation => {
                return {
                    input: translation.match.toArray(),
                    output: translation.best[trackName].toArray()
                }
            });

            let iterations = 0;
            let workerStartIteration = 0;

            let callWorker = () => {
                workerStartIteration = iterations;
                iterations += saveEachIterations;
                worker.send({
                    pluginName: "aiTrainer",
                    pluginOptions: this.options,
                    args: this.options.args,
                    workerOptions: {
                        path: this.options.path,
                        trackName: trackName,
                        dataset: dataset,
                        options: {
                            iterations: saveEachIterations,
                            errorThresh: 0.0001,
                            callbackPeriod: 1
                        }
                    }
                });
            }

            let bar = multibar.create(1, 0, {trackName: trackName, iteration: 0, error: 1});

            let worker = cluster.fork();
            worker.on("online", callWorker);
            worker.on("message", msg => {
                //console.log("msg", msg);
                if (!msg)
                    return;
                if (msg.state)
                    bar.update(Math.max(0, 3 - msg.state.error) / 3, { iteration: workerStartIteration + msg.state.iterations, error: msg.state.error });
                if (msg.finished)
                    callWorker();
            });
        }

        while(true) await new Promise(resolve => setTimeout(resolve, 600000));
    }

    async checkBrain()
    {
        for (let trackName of Translations.trackNames)
        {
            if (trackName == this.options.src)
                continue;

            try
            {
                let net = new brain.NeuralNetwork(PluginAiTrainer.nnConfig);
                net.fromJSON(JSON.parse(await fse.readFile(`${this.options.path}-${trackName}.brain`, 'utf-8')))
            }
            catch (e)
            {
                console.warn("Could not load " + _path.basename(`${this.options.path}-${trackName}.brain`) + ", starting from a new neural net.");
            }
        }
    }

    async worker(workerOptions: any)
    {
        let {path, trackName, dataset, options} = workerOptions;
        options.callback = (state: any) => {
            //console.log(`${trackName}#${state.iterations}: ${Math.floor(state.error * 1000 * 100) / 100}`);
            if (process.send) process.send({ state: { iterations: state.iterations, error: Math.floor(state.error * 1000 * 100) / 100 } });
        };

        let net = new brain.NeuralNetwork(PluginAiTrainer.nnConfig);
        if (await fse.pathExists(`${path}-${trackName}.brain`))
            net.fromJSON(JSON.parse(await fse.readFile(`${path}-${trackName}.brain`, 'utf-8')))

        await net.trainAsync(dataset, options);
        await fse.writeFile(`${path}-${trackName}.brain`, JSON.stringify(net.toJSON()));

        if (process.send) process.send({ finished: true });
    }


        /*
    async testTraining(path: string)
    {
        let nnConfigs: INeuralNetworkOptions[] = [
            { hiddenLayers: [48 * 5], activation: "relu" },
            { hiddenLayers: [48 * 5, 36 * 5], activation: "sigmoid" },
            { hiddenLayers: [48 * 5, 24 * 5, 48 * 5], activation: "sigmoid" }
        ];

        let fullLogs: any[] = [];

        let trackName = "HardSingle";

        let ind = 0;

        for (let nnConfig of nnConfigs)
        {
            // create a simple feed forward neural network with backpropagation
            let net = new brain.NeuralNetwork(nnConfig);

            let dataset = this.translations.filter(t => !t.match.equal(t.best[trackName])).map(translation => {
                return {
                    input: translation.match.toArray(),
                    output: translation.best[trackName].toArray()
                }
            });

            let timeStart = Date.now();
            let time = timeStart;
            let logs: any[] = [];
            let iterations = 0;
            do {
                let error;
                net.train(dataset, {
                    iterations: 1,
                    //learningRate: 0.7,
                    errorThresh: 0.000001,
                    callback: state => {
                        error = state.error;
                    },
                    callbackPeriod: 1
                });
                iterations+=1;
                console.log("#"+iterations + ": " + error)
                time = Date.now();
                logs.push([time - timeStart, iterations, error]);
            } while (time < timeStart + 0.5 * 60 * 1000);

            console.log(logs[logs.length - 1], "config " + (ind++));
            fullLogs.push(logs);

            //await fse.writeFile(`${path}-${trackName}.brain`, JSON.stringify(net.toJSON()));

            //const output = net.run([1, 0]) // [0.987]
        }

        await fse.writeFile(`${path}-logs.csv`, fullLogs.map((logs, index) =>
                [
                    "config " + index,
                    logs.map(log => log[0]).join(';'),
                    logs.map(log => log[1]).join(';'),
                    logs.map(log => log[2]).join(';'),
                    ""
                ].join("\n")
            ).join("\n").replace(/\./g, ',')
        );
    }*/

}