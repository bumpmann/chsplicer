import { Translation, TranslationPretendants } from "./translation";
import { TranslateMeasure } from "./translateMeasure";
import * as _path from "path";
import * as _ from "lodash";
import { ChartNote, Chart } from "herochartio";

export class Translations {
    static emptyTrack = new TranslateMeasure({}, 1);
    static trackNames = ["ExpertSingle", "HardSingle", "MediumSingle", "EasySingle"];

    translations: Translation[] = [];

    sort()
    {
        this.translations.forEach(translation => translation.calculateBest());
        this.translations.sort((a, b) => b.occurences - a.occurences);
    }

    addTranslation(translation: Translation, incrementOccurences: boolean = true)
    {
        let localTranslation = this.translations.find(local => local.match.equal(translation.match));

        if (localTranslation)
        {
            if (incrementOccurences)
                localTranslation.occurences++;
            for (let trackName in translation.best)
            {
                let translateMeasure = translation.best[trackName];
                if (translateMeasure.equal(Translations.emptyTrack)) // skip empty pretendant
                    continue;
                let trackPretendants = localTranslation.pretendants[trackName];
                let pretendant;
                if (!trackPretendants)
                    trackPretendants = localTranslation.pretendants[trackName] = [];
                else
                    pretendant = trackPretendants.find(p => translateMeasure.equal(p));

                if (pretendant)
                {
                    if (incrementOccurences)
                        pretendant.occurences++;
                }
                else
                    trackPretendants.push(translateMeasure);
            }
        }
        else
        {
            let tracks: TranslationPretendants = {};
            for (let trackName of Translations.trackNames)
            {
                let translateMeasure = translation.best[trackName];
                tracks[trackName] = translateMeasure.equal(Translations.emptyTrack) ? [] : [translateMeasure];
            }
            this.translations.push(translation);
        }
    }

    loadTranslations(dictionary: Chart, src: string = "ExpertSingle")
    {
        let resolution = dictionary.Song.Resolution;

        // Cut each tracks / measures
        let translatePart: {[name: string]: TranslateMeasure[]} = {};
        let chartTrackNames = Object.keys(dictionary.tracks).filter(name => name.endsWith("Single"));
        for (let trackName of chartTrackNames)
        {
            let track = dictionary.tracks[trackName];
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
            }
        }

        let trackNames = Translations.trackNames;

        let translatePartSrc = translatePart[src];

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

        // Pack occurences
        for (let _meas in translatePartSrc)
        {
            let meas = parseInt(_meas);
            let tracki = translatePartSrc[meas];

            if (tracki.equal(Translations.emptyTrack)) // skip empty translation
                continue;

            let translation = new Translation(tracki, {});
            for (let trackName of trackNames)
            {
                translation.best[trackName] = translatePart[trackName][meas];
            }
            this.addTranslation(translation);
        }
    }

    expandTranslations()
    {
        let addedTranslations = new Translations();
        for (let translation of this.translations)
        {
            for (let trackName of Translations.trackNames)
            {
                let translateMeasure = translation.best[trackName];
                if (translateMeasure.minTouch < translation.minTouch)
                    translation.minTouch = translateMeasure.minTouch;
                if (translateMeasure.maxTouch > translation.maxTouch)
                    translation.maxTouch = translateMeasure.maxTouch;
            }

            for (let trackName of Translations.trackNames)
            {
                let translateMeasure = translation.best[trackName];
                for (let mod = translation.minTouch; mod < translation.maxTouch - translation.minTouch; mod++)
                {
                    let track = _.cloneDeep(translateMeasure.track);
                    for (let time in track)
                    {
                        for (let elt of track[time])
                        {
                            if (elt.type == "N")
                            {
                                elt.touch -= translation.minTouch;
                                elt.duration = 0;
                            }
                        }
                    }
                    // todo ...
                }
            }
            translation.maxTouch -= translation.minTouch;
        }
    }

    translateMeasure(trackName: string, measure: TranslateMeasure): TranslateMeasure | null
    {
        let localTranslation = this.translations.find(local => local.match.equal(measure));
        return localTranslation ? localTranslation.best[trackName] : null;
    }

}