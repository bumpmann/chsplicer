import { ChartIO, Chart, ChartSong } from 'herochartio'
import * as fse from 'fs-extra'
import { Config } from './config'
import * as ini from 'ini'

export class LayoutSong
{
    id: string
    index: number
    chart: Chart
    path: string
    sampling: number
}

export class LayoutPart
{
    song: LayoutSong
    start: number
    end: number
    repeat: number
}

export class Layout
{
    ini: any
    name: string
    output: string
    songs: LayoutSong[]
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
        obj.songs = Array.isArray(obj.songs) ? obj.songs : [obj.songs];
        layout.output = obj.output;
        layout.start_blank = obj.start_blank;
        layout.samples_offset = obj.samples_offset;

        layout.songs = await Promise.all(obj.songs.map(async (obj: any, index: number) => {
            let song = new LayoutSong();
            song.id = obj.id;
            song.index = index;
            song.chart = await ChartIO.load(`${Config.local.songPath}/${obj.path}/notes.chart`);
            song.path = obj.path;
            song.sampling = obj.sampling || 44100;
            return song;
        }))

        layout.parts = obj.parts.map((obj: any) => {
            let part = new LayoutPart();
            let song = obj.song ? layout.songs.find(song => song.id == obj.song) : null;
            part.song = song || layout.songs[0];
            part.start = (typeof obj.start) == 'string' ? part.song.chart.findSectionPosition(obj.start) : (obj.start || 0);
            part.end = (typeof obj.end) == 'string' ? part.song.chart.findSectionPosition(obj.end) : obj.end;
            part.repeat = obj.repeat || 1;
            return part;
        });

        layout.ini = ini.parse((await fse.readFile(`${Config.local.songPath}/${layout.songs[0].path}/song.ini`, 'utf-8')).toString());
        delete layout.ini.song.song_length;

        layout.infos = layout.songs[0].chart.Song;
        for (let k in obj.infos || {})
        {
            (layout.infos as any)[k] = obj.infos[k];
            if (layout.ini.song[k.toLowerCase()])
                layout.ini.song[k.toLowerCase()] = obj.infos[k];
        }

        return layout;
    }
}