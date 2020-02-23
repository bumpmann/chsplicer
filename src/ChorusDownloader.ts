import * as fse from 'fs-extra';
import * as _path from 'path';
import * as needle from 'needle';
import { Config } from './config';
import { Downloader } from './downloader';

export class ChorusDownloader
{
	async download(md5: string): Promise<string>
	{
		let folderName = Downloader.sanitizeFilename(md5);
		let destination = _path.join(Config.cache_path, folderName);

		if (await fse.pathExists(destination))
			return destination;

		let resp = await needle('get', 'https://chorus.fightthe.pw/api/search?query=md5%3D' + md5);
		let directLinks = resp.body.songs[0].directLinks;
		console.log(`Downloading ${resp.body.songs[0].name} - ${resp.body.songs[0].artist} (${resp.body.songs[0].charter})`);
		for (let linkType in directLinks)
		{
			let dl = await Downloader.download(directLinks[linkType], linkType == 'archive', md5);
		}
		return destination;
	}
}