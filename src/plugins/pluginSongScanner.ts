import * as fse from "fs-extra";
import * as _path from "path";
import { AppPlugin } from "../appPlugin";
import { Config } from "../config";
import { ChartIO, Chart } from "herochartio";

export class PluginSongScanner extends AppPlugin
{
    async load(options: any)
    {
        await super.load(options);
        this.logger.logTimeDelta = false;
        if (!this.options.path)
            throw new Error("Plugin songScanner must have a parameter \"path\"");
        if ((typeof this.options.path) == "string")
            this.options.path = [this.options.path];
        for (let i in this.options.path)
        {
            this.options.path[i] = Config.resolvePath(this.options.path[i], Config.assets_dir, this.options.args);
        }
    }

    async layoutPass(obj: any)
    {
        let dirs: string[] = [];
        for (let path of this.options.path)
        {
            dirs = dirs.concat(await this.scanDir(path));
        }

        let excepts = !this.options.except ? [] : (Array.isArray(this.options.except) ? this.options.except : [this.options.except]);
        for (let except of excepts)
        {
            except = Config.resolvePath(except, Config.local.songPath, this.options.args);
            except = _path.normalize(except).replace(/\\/g, '/');
            dirs = dirs.filter(path => _path.normalize(path).replace(/\\/g, '/').indexOf(except) == -1)
        }

        let dirsFilters = await Promise.all(dirs.map(async path => {
            let chart: Chart;
            try
            {
                if (await fse.pathExists(path + "/notes.chart"))
                    chart = await ChartIO.load(path + "/notes.chart", {silent: true});
                else
                    chart = await ChartIO.load(path + "/notes.mid", {silent: true});
            }
            catch (e)
            {
                this.logger.log("Skipping song due to failed loading: " + path);
                return false;
            }
            for (let t of ["ExpertSingle", "HardSingle", "MediumSingle", "EasySingle"])
                if (!chart.tracks[t] || !Object.keys(chart.tracks[t]).length)
                    return false;
            return true;
        }));
        dirs = dirs.filter((val, index) => dirsFilters[index]);

        if (dirs.length > 200)
            this.logger.log("/!\\ Scanned more than 200 songs. This will probably crash unless running node with option --max-old-space-size to allow more memory.");

        obj.songs = Object.fromEntries(dirs.map((path, index) => [index, path]));
        obj.parts = dirs.map((path, index) => { return {song: index.toString(), quantize: 1}});
    }

    private async scanDir(path: string, depth = 5): Promise<string[]>
    {
        if (await fse.pathExists(path + "/notes.chart") || await fse.pathExists(path + "/notes.mid"))
            return [path];

        if (!depth)
            return [];

        let dir = await fse.readdir(path);
        let paths: string[] = [];
        for (let file of dir)
        {
            if ((await fse.lstat(path + "/" + file)).isDirectory())
            {
                let subs = await this.scanDir(path + "/" + file, depth - 1);
                if (subs.length)
                    paths = paths.concat(subs);
            }
        }
        return paths;
    }
}