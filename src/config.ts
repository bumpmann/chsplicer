import * as readline from 'readline';
import * as fse from 'fs-extra';
import * as _path from 'path';

export interface LocalConfig
{
	songPath: string
	cachePath: string
}

export class Config {
	static local: LocalConfig = {} as LocalConfig;
	static bin_dir = __dirname + "/../lib";
	static config_path = __dirname + "/../config.json";
	static cache_path = __dirname + "/../cache";
	static temp_path = __dirname + "/../temp";

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