import * as crypto from 'crypto';
import * as fse from 'fs-extra';
import * as _path from 'path';
import { Config } from './config';
import { Downloader } from './downloader';

export class CachedDownloader
{
	async download(url: string): Promise<string>
	{
		let folderName = crypto.createHash('sha1').update(url).digest('hex');
		let destination = _path.join(Config.cache_path, folderName);

		if (await fse.pathExists(destination))
			return destination;

		console.log(`Downloading ${url}`);
		await Downloader.download(url, true, folderName);

		return destination;
	}
}