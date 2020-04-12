import { TranslationTrack } from "./translationTrack";
import { Translations } from "./translations";
import { TranslateMeasure } from "./translateMeasure";

export type TranslationTracks = {[name: string]: TranslateMeasure};
export type TranslationPretendants = {[name: string]: TranslateMeasure[]};

export class Translation {
    // Matching track
    match: TranslationTrack

    // Pretendants translations
    pretendants: TranslationPretendants
    best: TranslationTracks = {}

    minTouch: number = 5
    maxTouch: number = 0
    occurences: number = 1
    modifiers: string[] = []

    constructor(match: TranslationTrack, pretendants: TranslationPretendants)
    {
        this.match = match;
        this.pretendants = pretendants;
    }

    calculateBest()
    {
        for (let trackName in this.pretendants)
        {
            this.pretendants[trackName].sort((a, b) => b.occurences - a.occurences);
            this.best[trackName] = this.pretendants[trackName][0] || Translations.emptyTrack;
            // TODO : keep translation from harder difficulty until there's at least one note instead of just remove
        }
    }
}
