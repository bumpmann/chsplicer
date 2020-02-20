#!/usr/bin/env node
import { Splicer } from './splicer';
import { Config } from './config';
import * as args from 'args';

async function run(name: string, sub: string[], options: any)
{
    await Config.loadConfig();
    await new Splicer().run(sub[0]);
    console.log("Done !");
}

args.command("run", "run a configuration file", (name, sub, options) => {
    run(name, sub, options).catch(e => {
        console.error(e);
    });
});
args.example("chsplicer run ./examples/destiny.json", "run galneryus's destiny solo trainer configuration")
args.parse(process.argv, {name: "chsplicer"} as any);