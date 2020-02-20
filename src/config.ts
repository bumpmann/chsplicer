import * as readline from 'readline';
import * as fse from 'fs-extra';

export interface LocalConfig
{
	songPath: string
}

export class Config {
	static local: LocalConfig;
	static bin_dir = __dirname + "/../lib";
	static config_path = __dirname + "/../config.json";

	static async loadConfig()
	{
		if (fse.existsSync(Config.config_path))
		{
			Config.local = JSON.parse(fse.readFileSync(Config.config_path, 'utf-8').toString());
			await Config.checkConfig();
		}
		else
		{
			Config.local = {
				songPath: await Config.ask('Enter clone hero song folder path: ')
			};
			await Config.checkConfig();
			await fse.writeFile(Config.config_path, JSON.stringify(Config.local, null, '\t'), 'utf-8');
		}
	}

	private static async checkConfig()
	{
		if ( ! await fse.pathExists(Config.local.songPath))
			throw new Error("Invalid clone hero song path: " + Config.local.songPath);
	}

	private static async ask(question: string): Promise<string>
	{
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});

		return new Promise((resolve, reject) => {
			rl.question(question, (answer) => {
				rl.close();
				resolve(answer);
			});
		});
	}
}