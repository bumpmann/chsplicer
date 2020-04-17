import { Chart } from "herochartio";
import { Logger } from "./logger";
import { LayoutOptions } from "./layoutOptions";
import { Config } from "./config";

export abstract class AppPlugin
{
    static registeredPlugins: {[name: string]: { new(): AppPlugin }} = {};

    options: any;
    enabled: boolean = true;

    protected logger: Logger;

    async load(options: any)
    {
        this.options = options;
        this.logger = new Logger(this.options.pluginName);
        this.logger.logTimeDelta = true;
    }

    log(...args:any[])
    {
        if (!this.options.silent)
            this.logger.log(...args);
    }

    async layoutPass?(workerOptions: any, layoutOptions?: LayoutOptions): Promise<any>;
    async chartPass?(chart: Chart): Promise<any>;

    async worker?(workerOptions: any): Promise<any>;

    static register(name: string, pluginClass: { new(): AppPlugin }) {
        AppPlugin.registeredPlugins[name.toLowerCase()] = pluginClass;
    }

    static async instanciate(name: string, options: any, args: any = {}): Promise<AppPlugin>
    {
        let classPlugin = AppPlugin.registeredPlugins[name.toLowerCase()];
        if (!classPlugin)
            throw new Error('Unknown plugin "' + name +'"');
        let instance = new classPlugin();
        options = options || {};

        if (options.if && !Config.resolveView(options.if, args))
        {
            instance.enabled = false;
            return instance;
        }

        options.args = args;
        options.pluginName = name.toLowerCase();
        await instance.load(options);
        return instance;
    }
}