import * as fse from 'fs-extra';
import * as _path from 'path';
import * as needle from 'needle';
import { Config } from './config';
import { Downloader } from './downloader';
import { Logger } from './logger';

export class ChorusDownloader
{
	async download(md5: string): Promise<string>
	{
		let folderName = Downloader.sanitizeFilename(md5);
		let destination = _path.join(Config.cache_path, folderName);

		let logger = new Logger("chorusDownloader");

		if (await fse.pathExists(destination + "/chorus.json"))
		{
			let resp = JSON.parse(await fse.readFile(destination + "/chorus.json", "utf-8"));
			logger.log(`Already downloaded: ${resp.songs[0].name} - ${resp.songs[0].artist} (${resp.songs[0].charter})`);
			return destination;
		}

		let resp = (await needle('get', 'https://chorus.fightthe.pw/api/search?query=md5%3D' + md5)).body;

		let directLinks = resp.songs[0].directLinks;
		logger.log(`Downloading ${resp.songs[0].name} - ${resp.songs[0].artist} (${resp.songs[0].charter})`);
		for (let linkType in directLinks)
		{
			if (linkType == 'archive' && (await fse.pathExists(destination)) && (await fse.readdir(destination)).length > 0)
				logger.log('Skipping download because archive is already extracted');
			else
				await Downloader.download(directLinks[linkType], linkType == 'archive', md5);
		}
		await fse.writeFile(destination + "/chorus.json", JSON.stringify(resp, null, "\t"));
		return destination;
	}
}