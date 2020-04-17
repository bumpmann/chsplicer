type loggerFunction = (message?: any, ...optionalParams: any[]) => void;

export class Logger
{
    static logger: null | loggerFunction = null
    private tag: string
    private timeStart: Date
    private timeLast: Date

    logTimeDelta: boolean = false;

    constructor(tag: string)
    {
        this.timeStart = new Date();
        this.timeLast = this.timeStart;
        this.tag = tag;
    }

    log(...args: any[])
    {
        let timeDiff = 0;

        if (this.logTimeDelta)
        {
            let time = new Date();
            timeDiff = time.getTime() - this.timeLast.getTime();
            this.timeLast = time;
        }

        let log = '';
        if (this.tag)
            log = `[${this.tag}]`;
        if (timeDiff)
            log += ` (+${timeDiff}ms)`

        if (Logger.logger)
            Logger.logger(log, ...args);
        else
            console.log(log, ...args);
    }
}