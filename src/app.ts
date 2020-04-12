#!/usr/bin/env node
import { Splicer } from './splicer';
import { Config } from './config';
import * as mri from 'mri';
import * as _path from 'path';
import * as cluster from 'cluster';

import { AppPlugin } from './appPlugin';
import { PluginTrackCopy } from './plugins/pluginTrackCopy';
import { PluginAiTranslator } from './plugins/pluginAiTranslator';
import { PluginAiTrainer } from './plugins/pluginAiTrainer';
import { PluginNoteLimiter } from './plugins/pluginNoteLimiter';
import { PluginSongScanner } from './plugins/pluginSongScanner';
import { PluginDictionaryBuilder } from './plugins/pluginDictionaryBuilder';
import { PluginDictionaryTranslator } from './plugins/pluginDictionaryTranslator';

AppPlugin.register("trackCopy", PluginTrackCopy);
AppPlugin.register("aiTranslator", PluginAiTranslator);
AppPlugin.register("aiTrainer", PluginAiTrainer);
AppPlugin.register("dictionaryTranslator", PluginDictionaryTranslator);
AppPlugin.register("dictionaryBuilder", PluginDictionaryBuilder);
AppPlugin.register("noteLimiter", PluginNoteLimiter);
AppPlugin.register("songScanner", PluginSongScanner);


async function run(args: any)
{
    if (args.verbose)
        Config.verbose = true;
    Config.loadConfig();

    await new Splicer().run(args["0"], args);
    console.log("Done config " + _path.basename(args["0"]) + " !");
}

async function worker()
{
    process.on("message", async msg => {
        if (!msg || !msg.pluginName)
            return;

        let pluginInstance = await AppPlugin.instanciate(msg.pluginName, msg.pluginOptions, msg.args || []);
        if (pluginInstance.enabled && pluginInstance.worker)
        {
            //console.log(`pid#${process.pid}: Call worker plugin "${msg.pluginName}"...`);
            try
            {
                await pluginInstance.worker(msg.workerOptions);
            }
            catch (e)
            {
                console.error(e);
                if (process.send) process.send({error: e.message});
            }
        }
    })
}

if (cluster.isMaster)
{
    let args = mri(process.argv.slice(2));
    for (let k in args._)
        args[k] = args._[k];
    delete args._;
    run(args).then(() => {
    }).catch(e => {
        console.error(e);
        process.exit(1);
    })
}
else
{
    worker().then(() => {
    }).catch(e => {
        console.error("Worker #" + process.pid + ":", e);
        process.exit(1);
    })
}