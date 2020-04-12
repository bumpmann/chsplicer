import * as readline from 'readline';
import * as fse from 'fs-extra';
import * as _path from 'path';
import * as Handlebars from 'handlebars';

Handlebars.registerHelper({
    eq: function (v1, v2) {
        return v1 === v2;
    },
    ne: function (v1, v2) {
        return v1 !== v2;
    },
    lt: function (v1, v2) {
        return v1 < v2;
    },
    gt: function (v1, v2) {
        return v1 > v2;
    },
    lte: function (v1, v2) {
        return v1 <= v2;
    },
    gte: function (v1, v2) {
        return v1 >= v2;
    },
    and: function () {
        return Array.prototype.slice.call(arguments).every(Boolean);
    },
    or: function () {
        return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);
    }
});

export interface LocalConfig
{
	songPath: string
	cachePath: string
}

export class Config {
	static local: LocalConfig = {} as LocalConfig;
	static dir = __dirname + "/..";
	static assets_dir = __dirname + "/../assets";
	static bin_dir = __dirname + "/../lib";
	static config_path = __dirname + "/../config.json";
	static cache_path = __dirname + "/../cache";
	static temp_path = __dirname + "/../temp";
	static configs_path = __dirname + "/../configs";
	static verbose = false;

	static resolveView(text: string, view: any = {})
	{
		let tmpl = Handlebars.compile(text);
		let res = tmpl(view);
		return res.toLowerCase() == "false" ? "" : res;
	}

	static resolvePath(path: string, relative: string = ".", view: any = {})
	{
		let fullview = {
			cache: Config.local.cachePath,
			songs: Config.local.songPath,
			app: Config.dir,
			assets: Config.assets_dir,
			bin: Config.bin_dir,
			temp: Config.temp_path
		}
		for (let k in view)
		{
			if (!fullview[k])
			fullview[k] = view[k];
		}
		let resolved = this.resolveView(path, fullview);
		if (!resolved)
			return "";
		return _path.resolve(relative, resolved);
	}

	static async loadConfig()
	{
		if (fse.existsSync(Config.config_path))
			Config.local = JSON.parse(fse.readFileSync(Config.config_path, 'utf-8').toString());
		while (! (await Config.checkConfig())) {
			Config.local = {
				songPath: await Config.ask('Enter clone hero song folder path: ', this.local.songPath),
				cachePath: await Config.ask('Enter downloads folder path: ', this.local.cachePath || "[songs]/cache")
			};
			if (await Config.checkConfig())
				await fse.writeFile(Config.config_path, JSON.stringify(Config.local, null, '\t'), 'utf-8');
		}
		this.cache_path = _path.resolve(__dirname + '/..', this.local.cachePath.replace(/\[songs\]/g, this.local.songPath));
	}

	private static async checkConfig(): Promise<boolean>
	{
		if ( ! this.local.songPath || ! this.local.cachePath)
			return false;
		if ( ! await fse.pathExists(Config.local.songPath))
		{
			console.error("Invalid clone hero song path: " + Config.local.songPath);
			return false;
		}
		return true;
	}

	private static async ask(question: string, def: string = ""): Promise<string>
	{
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});

		if (def)
			question += `(${def})`;

		return new Promise((resolve, reject) => {
			rl.question(question, (answer) => {
				rl.close();
				resolve(answer || def);
			});
		});
	}
}