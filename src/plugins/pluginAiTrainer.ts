import { Chart, ChartNote } from "herochartio";
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

interface WorkerOptions
{
    path: string
    trackName: string
    dataSet: string
    config: BrainConfig
    iterations: number
}

interface WorkerState
{
    iterations: number
    testError: number
    trainingError: number
}

export interface BrainConfig
{
    name: string
    config: brain.INeuralNetworkOptions
    options: brain.INeuralNetworkTrainingOptions
    iterations: number
    testError: number
    trainingError: number
    testSetOffset: number
    testSetSize: number
}

export interface BrainTrack
{
    dataSet: string
    configs: BrainConfig[]
    best: BrainConfig
}

export interface Brain
{
    tracks: {[name: string]: BrainTrack}
}

export class PluginAiTrainer extends AppPlugin
{
    // https://stats.stackexchange.com/questions/181/how-to-choose-the-number-of-hidden-layers-and-nodes-in-a-feedforward-neural-netw
    static nnConfigs: brain.INeuralNetworkOptions[] = [
        { hiddenLayers: [10], activation: "leaky-relu" },
        { hiddenLayers: [16], activation: "leaky-relu" },
        { hiddenLayers: [22], activation: "leaky-relu" },
        { hiddenLayers: [28], activation: "leaky-relu" },
        { hiddenLayers: [32], activation: "leaky-relu" },
        { hiddenLayers: [36], activation: "leaky-relu" },
        { hiddenLayers: [40], activation: "leaky-relu" },
        { hiddenLayers: [48], activation: "leaky-relu" }
    ];

    static nnOptions: brain.INeuralNetworkTrainingOptions[] = [
        { learningRate: 0.02, momentum: 0.6 },
        { learningRate: 0.02, momentum: 0.6 },
        { learningRate: 0.02, momentum: 0.6 },
        { learningRate: 0.02, momentum: 0.6 },
        { learningRate: 0.02, momentum: 0.6 },
        { learningRate: 0.02, momentum: 0.6 },
        { learningRate: 0.02, momentum: 0.6 },
        { learningRate: 0.02, momentum: 0.6 }
    ];

    brainInfos: Brain;

    async load(options: any)
    {
        await super.load(options);
        this.options.src = this.options.src || "ExpertSingle";
        if (!this.options.path)
            throw new Error("Missing parameter 'path' of the ai to train");
        this.options.path = Config.resolvePath(this.options.path, Config.assets_dir, this.options.args);
        if (this.options.only)
            this.options.only = Config.resolveView(this.options.only, this.options.args);
    }

    async layoutPass(obj: any, layoutOptions: LayoutOptions)
    {
        layoutOptions.ignoreAudio = true;
        layoutOptions.ignoreSync = true;
        layoutOptions.ignoreDurationCheck = true;
    }

    async chartPass(chart: Chart)
    {
        this.log("Started ai trainer");

        if (!await this.loadBrain())
        {
            this.log("Could not load existing brain, starting from a new one");
            await this.newBrain(await this.loadTranslations(chart));
        }

        await this.learn();
    }

    async worker(workerOptions: WorkerOptions)
    {
        let {path, config, dataSet, iterations} = workerOptions;

        config.options.errorThresh = 0.0001;
        config.options.callbackPeriod = 1;
        config.options.iterations = 1;

        let net = new brain.NeuralNetwork(config.config);
        if (await fse.pathExists(`${path}/${config.name}`))
            net.fromJSON(JSON.parse(await fse.readFile(`${path}/${config.name}`, 'utf-8')));

        let dataBuffer = await fse.readFile(`${path}/${dataSet}`);
        const measureSize = 240/8;
        let dataSize = dataBuffer.byteLength / measureSize / 2;
        let data = new Array(dataSize);
        for (let i = 0; i < dataSize; i++)
        {
            let offset = i * measureSize * 2;
            let meas = data[i] = {
                input: new Array(240),
                output: new Array(240)
            };
            for (let j = 0; j < measureSize; j++)
            {
                let inp = dataBuffer.readUInt8(offset + j);
                let out = dataBuffer.readUInt8(offset + measureSize + j);
                meas.input[j * 8] = inp & 1;
                meas.input[j * 8 + 1] = (inp >> 1) & 1;
                meas.input[j * 8 + 2] = (inp >> 2) & 1;
                meas.input[j * 8 + 3] = (inp >> 3) & 1;
                meas.input[j * 8 + 4] = (inp >> 4) & 1;
                meas.input[j * 8 + 5] = (inp >> 5) & 1;
                meas.input[j * 8 + 6] = (inp >> 6) & 1;
                meas.input[j * 8 + 7] = (inp >> 7) & 1;
                meas.output[j * 8] = out & 1;
                meas.output[j * 8 + 1] = (out >> 1) & 1;
                meas.output[j * 8 + 2] = (out >> 2) & 1;
                meas.output[j * 8 + 3] = (out >> 3) & 1;
                meas.output[j * 8 + 4] = (out >> 4) & 1;
                meas.output[j * 8 + 5] = (out >> 5) & 1;
                meas.output[j * 8 + 6] = (out >> 6) & 1;
                meas.output[j * 8 + 7] = (out >> 7) & 1;
            }
        }

        let testSet = data.splice(config.testSetOffset, config.testSetSize);

        while (iterations-- > 0)
        {
            let trainResult = net.train(data, config.options);
            let testResult = net.test(testSet as any);
            config.iterations += trainResult.iterations;
            if (process.send)
            {
                if (process.send) process.send({ state: {
                    iterations: config.iterations,
                    trainingError: Math.floor(trainResult.error * 1000 * 100) / 100,
                    testError: Math.floor(testResult.error * 1000 * 100) / 100,
                } as WorkerState });
            }
        }

        await fse.writeFile(`${path}/${config.name}`, JSON.stringify(net.toJSON()));

        if (process.send) process.send({ finished: true });
    }

    async loadBrain(): Promise<boolean>
    {
        try
        {
            this.brainInfos = await fse.readJson(`${this.options.path}/brain.json`);
            return true;
        }
        catch (e)
        {
            return false;
        }
    }

    async saveBrain()
    {
        await fse.writeJson(`${this.options.path}/brain.json`, this.brainInfos);
    }

    async newBrain(translations: Translations)
    {
        await fse.ensureDir(this.options.path);

        const measureSize = 240/8;

        this.brainInfos = {tracks: {}};
        for (let trackName of Translations.trackNames)
        {
            if (trackName == "ExpertSingle")
                continue;

            let dataBuffer = Buffer.alloc(translations.translations.length * measureSize * 2);
            PluginAiTrainer.shuffleArray(translations.translations);
            translations.translations.forEach((translation, index) => {
                translation.match.writeBuffer(dataBuffer, index * measureSize * 2)
                translation.best[trackName].writeBuffer(dataBuffer, index * measureSize * 2 + measureSize)
            });
            await fse.writeFile(`${this.options.path}/${trackName}.data`, dataBuffer);

            let size = translations.translations.length / PluginAiTrainer.nnConfigs.length;

            let configs: BrainConfig[] = [];
            for (let i in PluginAiTrainer.nnConfigs)
            {
                configs.push({
                    name: `${trackName}.${i}.brain`,
                    config: PluginAiTrainer.nnConfigs[i],
                    options: PluginAiTrainer.nnOptions[i],
                    iterations: 0,
                    testError: 100,
                    trainingError: 100,
                    testSetOffset: parseInt(i) * size,
                    testSetSize: size
                });
            }
            this.brainInfos.tracks[trackName] = {
                dataSet: trackName + '.data',
                configs: configs,
                best: configs[0]
            };
        }
        await this.saveBrain();
    }

    async learn()
    {
        const saveEachIterations = 10;

        console.log("-----------------------------------");
        console.log("The neural net will start training.");
        console.log(`This will save each ${saveEachIterations} iterations.`);
        console.log("For a good learning, the error rate");
        console.log("should be around 2.");
        console.log("Press Ctrl+C to stop training and exit");
        console.log("-----------------------------------");

        const multibar = new cliProgress.MultiBar({
            hideCursor: true,
            format: '[{bar}] {trainingError}/{testError}\t{name}#{iterations}'
        }, cliProgress.Presets.shades_classic);

        for (let trackName in this.brainInfos.tracks)
        {
            if (this.options.only && trackName != this.options.only)
                continue;

            let infos = this.brainInfos.tracks[trackName];
            for (let config of infos.configs)
            {
                let callWorker = () => {
                    worker.send({
                        pluginName: "aiTrainer",
                        pluginOptions: this.options,
                        args: this.options.args,
                        workerOptions: {
                            path: this.options.path,
                            config: config,
                            dataSet: infos.dataSet,
                            iterations: saveEachIterations
                        } as WorkerOptions
                    });
                }

                let lastState: WorkerState = { iterations: config.iterations, trainingError: config.trainingError, testError: config.testError };
                let bar = multibar.create(1, 0, { iterations: lastState.iterations, testError: lastState.testError, trainingError: lastState.trainingError, name: config.name });

                let worker = cluster.fork();
                worker.on("online", callWorker);
                worker.on("message", async msg => {
                    //console.log("msg", msg);
                    if (!msg)
                        return;
                    if (msg.state)
                    {
                        lastState = msg.state;
                        bar.update(Math.max(0, 5 - lastState.testError) / 5, { iterations: lastState.iterations, testError: lastState.testError, trainingError: lastState.trainingError });
                    }
                    if (msg.finished)
                    {
                        if (lastState.testError < infos.best.testError)
                        {
                            infos.best = _.cloneDeep(config);
                            infos.best.name = `${trackName}.best.brain`;
                            await fse.copy(`${this.options.path}/${config.name}`, `${this.options.path}/${infos.best.name}`);
                        }
                        config.iterations = lastState.iterations;
                        config.testError = lastState.testError;
                        config.trainingError = lastState.trainingError;
                        await this.saveBrain();
                        callWorker();
                    }
                });
            }
        }

        while(true) await new Promise(resolve => setTimeout(resolve, 600000));
    }

    private static shuffleArray(array: any[]): void {
        for (let i = array.length - 1; i > 0; i--) {
            let j = Math.floor(Math.random() * (i + 1));
            let temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
    }

    private async loadTranslations(chart: Chart): Promise<Translations>
    {
        let resolution = chart.Song.Resolution;
        let emptyTrack = Translations.emptyTrack;

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

        return translations;
    }
}