#!/usr/bin/env node
import { Splicer } from './splicer';
import { Config } from './config';
import * as args from 'args';
import * as fse from 'fs-extra';
import * as _path from 'path';


async function run(name: string, sub: string[], options: any)
{
    for (let config of sub)
    {
        await new Splicer().run(config);
        console.log("Done config " + _path.basename(config) + " !");
    }
}

async function runall(name: string, sub: string[], options: any)
{
    for (let folder of sub)
    {
        let configs = await fse.readdir(folder);
        configs = configs.filter(config => _path.extname(config) == ".json").map(config => folder + "/" + config);
        await run(name, configs, options);
    }
}

function prepareCommand(fn: (name: string, sub: string[], options: any) => void)
{
    return (name: string, sub: string[], options: any) =>
    {
        Config.loadConfig()
        .then(() => fn(name, sub, options))
        .catch(e => {
            console.error(e);
        });
    }
}

args.command("run", "run a configuration file", prepareCommand(run));
args.command("runall", "run all configurations in a folder", prepareCommand(runall))
args.example("chsplicer run ./examples/destiny.json", "run galneryus's destiny solo trainer configuration")
args.parse(process.argv, {name: "chsplicer"} as any);