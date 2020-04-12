import { TranslationTrack } from "./translationTrack";

export class TranslateMeasure extends TranslationTrack {
    minTouch: number = 5;
    maxTouch: number = 0;
    occurences: number = 1;
}
