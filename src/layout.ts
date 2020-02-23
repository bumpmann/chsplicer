import { ChartIO, Chart, ChartSong } from 'herochartio'
import * as fse from 'fs-extra'
import { Config } from './config'
import * as ini from 'ini'
import { Downloader } from './downloader'
import { ChorusDownloader } from "./ChorusDownloader"
import { CachedDownloader } from './CachedDownloader'

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
    event: string
}

export class Layout
{
    ini: any
    name: string
    output: string
    songs: LayoutSong[] = []
    start_blank: number
    samples_offset: number
    parts: LayoutPart[]
    infos: ChartSong

    static async load(path: string)
    {
        let obj = JSON.parse((await fse.readFile(path, 'utf-8')).toString());
        let layout = new Layout();
        layout.name = obj.name;
        obj.infos = obj.infos || {};
        obj.infos.Name = obj.infos.Name || layout.name;
        if (!obj.songs)
            obj.songs = {};
        if (obj.song)
        {
            let entries = Object.entries(obj.songs as {[id:string]: any});
            entries.unshift(['song', obj.song]);
            obj.songs = Object.fromEntries(entries);
        }
        obj.songs = Object.entries(obj.songs).map((song: any) => {
            if ((typeof song[1]) == 'string')
                return {id: song[0], path: song[1]};

            song[1].id = song[0];
            return song[1];
        });
        layout.output = obj.output;
        layout.start_blank = obj.start_blank || 8;
        layout.samples_offset = obj.samples_offset || 0;

        for (let [index, objsong] of obj.songs.entries())
        {
            let song = new LayoutSong();
            song.id = objsong.id;
            song.index = index;
            song.path = objsong.path;
            if (objsong.path.substr(0,7) == 'chorus:')
                song.fullpath = await (new ChorusDownloader().download(objsong.path.substr(7)));
            else if (objsong.path.substr(0,4) == 'url:')
                song.fullpath = await (new CachedDownloader().download(objsong.path.substr(4)));
            else
                song.fullpath = `${Config.local.songPath}/${song.path}`;
            song.chart = await ChartIO.load(`${song.fullpath}/notes`);
            song.sampling = objsong.sampling || 44100;
            layout.songs.push(song);
        }

        layout.parts = obj.parts.map((obj: any) => {
            let part = new LayoutPart();
            let song = obj.song ? layout.songs.find(song => song.id == obj.song) : null;
            part.song = song || layout.songs[0];
            part.start = (typeof obj.start) == 'string' ? part.song.chart.findSectionPosition(obj.start) : (obj.start || 0);
            part.end = (typeof obj.end) == 'string' ? part.song.chart.findSectionPosition(obj.end) : obj.end;
            if (part.start == -1)
                throw new Error(part.song.chart.Song.Name + ": could not find section " + obj.start);
            if (part.end == -1)
                throw new Error(part.song.chart.Song.Name + ": could not find section " + obj.end);
            part.repeat = obj.repeat || 1;
            part.event = obj.event;
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
                        part.end = Math.round(part.end * outputResolution / song.chart.Song.Resolution);
                    }
                }
                song.chart.convertResolution(outputResolution);
            }
        }

        layout.ini = ini.parse((await fse.readFile(`${layout.songs[0].fullpath}/song.ini`, 'utf-8')).toString());
        delete layout.ini.song.song_length;

        layout.infos = layout.songs[0].chart.Song;
        layout.infos.Resolution = outputResolution;
        for (let k in obj.infos || {})
        {
            (layout.infos as any)[k] = obj.infos[k];
            if (layout.ini.song[k.toLowerCase()])
                layout.ini.song[k.toLowerCase()] = obj.infos[k];
        }

        return layout;
    }
}