import { ChartIO, Chart, ChartSong } from 'herochartio'
import * as fse from 'fs-extra'
import { Config } from './config'
import * as _ from 'lodash'
import * as ini from 'ini'
import * as _path from 'path'
import { ChorusDownloader } from "./chorusDownloader"
import { CachedDownloader } from './cachedDownloader'
import { AppPlugin } from './appPlugin'
import { LayoutOptions } from './layoutOptions'
import { Logger } from './logger'

export class LayoutSong
{
    id: string
    index: number
    chart: Chart
    path: string
    fullpath: string
    sampling: number
}

export class LayoutPart
{
    song: LayoutSong
    start: number
    end: number
    repeat: number
    event: string | boolean
    quantize: number
    startOffset: number
    endOffset: number
}

export interface LayoutRequire
{
    path: string
    check?: string
    args?: string[]
}

export type LayoutPlugin = [string, any];

export class Layout
{
    ini: any
    name: string
    output: string
    songs: LayoutSong[] = []
    start_blank: number
    require: LayoutRequire[]
    samples_offset: number
    parts: LayoutPart[]
    infos: ChartSong
    copy: boolean | {[filename: string]: LayoutSong}
    autoOffset: number
    plugins: LayoutPlugin[]
    options: LayoutOptions = new LayoutOptions()

    static async loadSong(path: string, args: any = {})
    {
        let resolved = Config.resolveView(path, args);
        if (resolved.substr(0,7) == 'chorus:')
            return await (new ChorusDownloader().download(resolved.substr(7)));
        else if (resolved.substr(0,4) == 'url:')
            return await (new CachedDownloader().download(resolved.substr(4)));
        return Config.resolvePath(path, Config.local.songPath, args);
    }

    static async loadFile(path: string, args: any, requireCallback: (require: LayoutRequire[]) => Promise<void>)
    {
        let obj = JSON.parse((await fse.readFile(path, 'utf-8')).toString());
        return await this.load(obj, args, _path.dirname(_path.resolve(path)), requireCallback);
    }

    private static async load(obj: any, args: any, cwd: string, requireCallback: (require: LayoutRequire[]) => Promise<void>)
    {
        let logger = new Logger("loader");
        let layout = new Layout();
        obj.infos = obj.infos || {};
        if (!obj.songs)
            obj.songs = {};
        if (obj.plugins)
            layout.plugins = obj.plugins;
        if (obj.plugin && typeof obj.plugin == "string")
            layout.plugins = [[obj.plugin, {}]];
        if (obj.plugin && Array.isArray(obj.plugin))
            layout.plugins = [obj.plugin];
        if (!layout.plugins)
            layout.plugins = [];
        if (!obj.parts)
            obj.parts = [];

        if (obj.args)
        {
            for (let argName in obj.args)
            {
                let arg = obj.args[argName];
                if (arg.default && args[argName] === undefined)
                    args[argName] = arg.default;
            }
            for (let argName in obj.args)
            {
                let arg = obj.args[argName];
                if (arg.resolve)
                    args[argName] = Config.resolvePath(args[argName], arg.resolve === true ? "." : arg.resolve, args);
                if (!arg.type)
                {
                    if (arg.values)
                        arg.type = typeof arg.values[0];
                    else if (arg.default != undefined)
                        arg.type = typeof arg.default;
                }
            }
        }

        if (!obj.require)
            layout.require = [];
        else if (typeof obj.require == "string")
            layout.require = [{path: obj.require}];
        else if (Array.isArray(obj.require))
            layout.require = obj.require.map(r => {
                if (typeof r == "string")
                    return {path: r};
                return r;
            })
        else if (obj.require)
            layout.require = [obj.require];
        layout.require.forEach(required => {
            required.path = Config.resolvePath(required.path, cwd, args);
            if (required.check)
                required.check = Config.resolvePath(required.check, cwd, args);
        });
        await requireCallback(layout.require);
        if (obj.song)
        {
            let entries = Object.entries(obj.songs as {[id:string]: any});
            entries.unshift(['song', obj.song]);
            obj.songs = Object.fromEntries(entries);
        }

        for (let calls of layout.plugins)
        {
            let pluginInstance = await AppPlugin.instanciate(calls[0], calls[1], args);
            if (pluginInstance.enabled && pluginInstance.layoutPass)
            {
                logger.log(`Applying plugin layout:${calls[0]}...`);
                await pluginInstance.layoutPass(obj, layout.options);
            }
        }

        obj.songs = Object.entries(obj.songs).map((song: any) => {
            if ((typeof song[1]) == 'string')
                return {id: song[0], path: song[1]};

            song[1].id = song[0];
            return song[1];
        });

        layout.autoOffset = obj.autoOffset || 0; // 53862.08; // 1 / (ms offset per second)
        layout.start_blank = obj.start_blank === undefined ? 8 : obj.start_blank;
        layout.samples_offset = obj.samples_offset || 0;
        if (obj.ignoreAudio)
            layout.options.ignoreAudio = true;

        logger.log("Loading songs...");
        for (let [index, objsong] of obj.songs.entries())
        {
            let song = new LayoutSong();
            song.id = objsong.id;
            song.index = index;
            song.path = objsong.path;
            song.fullpath = await Layout.loadSong(song.path, args);
            if (await fse.pathExists(`${song.fullpath}/notes.chart`) || await fse.pathExists(`${song.fullpath}/notes.mid`))
                song.chart = await ChartIO.load(`${song.fullpath}/notes`);
            else if (await fse.pathExists(`${song.fullpath}.chart`))
                song.chart = await ChartIO.load(`${song.fullpath}`);
            else
                throw new Error('Could not find song at ' + song.fullpath);
            song.sampling = objsong.sampling || 44100;
            layout.songs.push(song);
        }

        layout.parts = obj.parts.map((obj: any, index: number) => {
            let part = new LayoutPart();
            let song = obj.song;
            if (song)
            {
                song = layout.songs.find(song => song.id == obj.song);
                if (!song)
                    throw new Error(`Could not find song "${obj.song}"`);
            }
            else
                song = null;
            part.song = song || layout.songs[0];
            if (obj.start == undefined)
                obj.start = part.song.chart.firstNotePosition();
            if (obj.end == undefined)
                obj.end = part.song.chart.lastNotePosition();
            part.start = (typeof obj.start) == 'string' ? part.song.chart.findSectionPosition(obj.start) : (obj.start || 0);
            if ((typeof obj.end) == 'string')
            {
                part.end = part.song.chart.findSectionPosition(obj.end)
                if (part.end == -1)
                    throw new Error(part.song.chart.Song.Name + ": could not find section " + obj.end);
            }
            else
                part.end = obj.end;
            if (part.start == -1)
                throw new Error(part.song.chart.Song.Name + ": could not find section " + obj.start);
            part.repeat = obj.repeat || 1;
            part.event = obj.event;
            part.quantize = obj.quantize;
            part.startOffset = obj.startOffset;
            part.endOffset = obj.endOffset;
            return part;
        });

        let outputResolution = Math.max(...layout.songs.map(song => song.chart.Song.Resolution));
        for (let song of layout.songs)
        {
            if (song.chart.Song.Resolution != outputResolution)
            {
                for (let part of layout.parts)
                {
                    if (part.song == song)
                    {
                        part.start = Math.round(part.start * outputResolution / song.chart.Song.Resolution);
                        if (part.end != -1)
                            part.end = Math.round(part.end * outputResolution / song.chart.Song.Resolution);
                    }
                }
                song.chart.convertResolution(outputResolution);
            }
        }

        try
        {
            layout.ini = ini.parse((await fse.readFile(`${layout.songs[0].fullpath}/song.ini`, 'utf-8')).toString());
        }
        catch(e)
        {
            logger.log("Could not find song.ini, using an empty base.");
            layout.ini = {song:{}};
        }
        if (layout.ini.Song)
        {
            layout.ini.song = layout.ini.Song;
            delete layout.ini.Song;
        }
        delete layout.ini.song.song_length;
        delete layout.ini.song.song_length;

        layout.infos = layout.songs[0] ? layout.songs[0].chart.Song : {} as ChartSong;
        layout.infos.Resolution = outputResolution;
        for (let k in obj.infos)
        {
            (layout.infos as any)[k] = obj.infos[k];
            if (layout.ini.song[k.toLowerCase()])
                layout.ini.song[k.toLowerCase()] = obj.infos[k];
        }
        let songProps = Object.keys(new ChartSong());
        for (let k in layout.ini.song)
        {
            let kProp = _.capitalize(k);
            if (!layout.infos[kProp] && songProps.indexOf(kProp) != -1)
                layout.infos[kProp] = layout.ini.song[k];
        }

        if (!obj.name)
        {
            if (layout.songs.length)
            {
                layout.name = layout.infos.Artist + ' - ' + layout.infos.Name;
            }
            else
                throw new Error('Missing property "name" or at least one song');
        }
        else
        {
            layout.name = obj.name;
        }

        obj.infos.Name = obj.infos.Name || layout.name;

        args.infos = {name: layout.name};
        if (obj.output)
            layout.output = Config.resolvePath(obj.output, Config.local.songPath, args);

        if (obj.copy == undefined)
            layout.copy = !!layout.output;
        else if (typeof obj.copy == "boolean")
            layout.copy = obj.copy;
        else
        {
            layout.copy = Object.fromEntries(Object.entries(obj.copy).map(ent => {
                let song = layout.songs.find(song => song.id == ent[1]);
                if (!song)
                    throw new Error("Could not copy file " + ent[0] + " from unknown song " + ent[1]);
                return [ent[0], song];
            }));
        }

        return layout;
    }
}