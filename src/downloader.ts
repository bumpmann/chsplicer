import * as needle from 'needle';
import * as fse from 'fs-extra';
import * as path from 'path';
import * as extract_zip from 'extract-zip';
import { EventEmitter } from 'events';
import { Config } from './config';
import * as util from 'util';
const sanitize = require('sanitize-filename');
const {unrar} = require('unrar-promise');

const extract = util.promisify(extract_zip);

export enum DownloadState {
	waitingForResponse,
	failedToRespond,
	download,
	downloadFailed,
	extract,
	extractFailed,
	transfer,
	transferFailed,
	finished
}

export class ChorusDownloader
{
	async download(md5: string): Promise<string>
	{
		let folderName = Downloader.sanitizeFilename(md5);
		let destination = path.join(Config.cache_path, folderName);

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

export class Downloader extends EventEmitter {
	private static lastID = 0;

	id: number
	state: DownloadState
	url: string
	isArchive: boolean
	fileName: string = ""
	fileType: string = ""
	fileSize: string = ""
	downloaded: number = 0
	errorMessage?: string
	tempFolder: string
	destination: string

	private req: NodeJS.ReadableStream

	static async download(url: string, isArchive: boolean, folderid: string): Promise<Downloader>
	{
		return new Promise((resolve, reject) => {
			let dl = new Downloader(url, isArchive, folderid);
			dl.on('error', err => reject(err || dl.errorMessage))
				//.on('update', () => console.log(dl.state.toString()))
				.on('end', () => resolve(dl))
				.start();
		});
	}

	constructor(url: string, isArchive: boolean, folderName: string)
	{
		super();

		this.id = ++Downloader.lastID;
		this.state = DownloadState.waitingForResponse;
		this.url = url;
		this.isArchive = isArchive;

		folderName = Downloader.sanitizeFilename(folderName);
		this.tempFolder = path.join(Config.temp_path, folderName)
		this.destination = path.join(Config.cache_path, folderName);
	}

	private start(cookieHeader?: string) {
		this.req = needle.get(this.url, {
			follow_max: 10,
			headers: (cookieHeader ? { 'Cookie': cookieHeader } : undefined)
		});

		this.req.on('header', (statusCode, headers) => {
			if (statusCode != 200) {
				this.errorMessage = `Failed to download chart: request to [${this.url}] returned status code ${statusCode}.`;
				this.updateState(DownloadState.failedToRespond);
				return;
			}

			this.fileType = headers['content-type'];
			if (this.fileType.startsWith('text/html')) {
				// console.log('REQUEST RETURNED HTML');
				this.handleHTMLResponse(headers['set-cookie']);
			} else {
				// console.log(`REQUEST RETURNED FILE DOWNLOAD (x-goog-hash=[${headers['x-goog-hash']}])`);
				this.fileName = this.getDownloadFileName(this.url, headers);
				this.fileType = headers['content-type'];
				this.fileSize = headers['content-length'];
				this.updateState(DownloadState.download);
				this.handleDownloadResponse(headers);
			}
		});
	}

	private handleHTMLResponse(cookieHeader: string) {
		// The response returned the google drive "couldn't scan for viruses" page
		let virusScanHTML = '';
		this.req.on('data', data => virusScanHTML += data);
		this.req.on('done', (err) => {
			if (err) {
				this.errorMessage = `Failed to download chart: couldn't load the google HTML response: ${err}`;
				this.updateState(DownloadState.downloadFailed);
				return;
			}

			const confirmTokenRegex = /confirm=([0-9A-Za-z]+)&/g;
			const confirmTokenResults = confirmTokenRegex.exec(virusScanHTML);
			if (confirmTokenResults == null) {
				this.errorMessage = `Failed to download chart: invalid HTML response; couldn't find confirm token.`;
				this.updateState(DownloadState.downloadFailed);
				return;
			}

			const confirmToken = confirmTokenResults[1];
			const downloadID = this.url.substr(this.url.indexOf('id=') + 'id='.length);
			this.url = `https://drive.google.com/uc?confirm=${confirmToken}&id=${downloadID}`;
			// console.log(`NEW LINK: ${this.url}`);
			// console.log(`COOKIE HEADER: [${cookieHeader}]`);
			this.start(cookieHeader);
		});
	}

	private async handleDownloadResponse(headers: Headers) {
		await fse.ensureDir(this.tempFolder);

		const filePath = path.join(this.tempFolder, this.fileName);
		this.req.pipe(fse.createWriteStream(filePath));

		this.req.on('data', chunk => {
			this.downloaded += chunk.length;
			this.emit('progress');
		});

		this.req.on('end', async () => {
			if (this.isArchive) {
				this.updateState(DownloadState.extract);
				await this.extractDownload();
			}

			if (this.state != DownloadState.extractFailed) {
				this.updateState(DownloadState.transfer);
				this.transferDownload();
			}
		});
	}

	private getDownloadFileName(url: string, headers: any) {
		if (headers['server'] && headers['server'] === 'cloudflare') {
			// Cloudflare specific jazz
			return Downloader.sanitizeFilename(decodeURIComponent(path.basename(url)));
		}

		// GDrive specific jazz
		const filenameRegex = /filename="(.*?)"/g;
		let results = filenameRegex.exec(headers['content-disposition']);
		if (results == null) {
			console.log(`Warning: couldn't find filename in content-disposition header: [${headers['content-disposition']}]`);
			return 'unknownFilename';
		}

		return Downloader.sanitizeFilename(results[1]);
	}

	private async extractDownload()
	{
		const source = path.join(this.tempFolder, this.fileName);

		try
		{
			if (path.extname(this.fileName).toLowerCase() == ".rar")
				await unrar(source, this.tempFolder);
			else
				await extract(source, { dir: this.tempFolder });
			await fse.unlink(source);
		}
		catch (err) {
			this.errorMessage = `Failed to extract the downloaded file: ${err}`;
			this.updateState(DownloadState.extractFailed);
		}
	}

	private async transferDownload() {
		try {
			await fse.ensureDir(this.destination);

			let files = (this.isArchive ? await fse.readdir(this.tempFolder) : [this.fileName]);

			// If the chart folder is in the archive folder, rather than the chart files
			const isFolderArchive = (files.length < 2 && !fse.lstatSync(path.join(this.tempFolder, files[0])).isFile());
			if (this.isArchive && isFolderArchive) {
				this.tempFolder = path.join(this.tempFolder, files[0]);
				files = await fse.readdir(this.tempFolder);
			}

			// Copy the files from the temporary directory to the destination
			for (const file of files) {
				await fse.move(path.join(this.tempFolder, file), path.join(this.destination, file));
			}

			// Delete the extracted folder from the temporary directory
			if (isFolderArchive) {
				await fse.rmdir(this.tempFolder);
			}

			this.updateState(DownloadState.finished);
			this.emit('end');
		} catch (err) {
			this.errorMessage = `Copying the downloaded file to the target directory failed: ${err}`;
			this.updateState(DownloadState.transferFailed);
		}
	}

	cancelDownload()
	{
		let anyreq = this.req as any;
		if (anyreq.abort)
			anyreq.abort();
		else if (anyreq.destroy)
			anyreq.destroy();
		else
		{
			console.warn("Could not abort request, no suitable method found");
		}
	}


	private updateState(newState: DownloadState) {
		this.state = newState;
		let isError = [DownloadState.downloadFailed, DownloadState.extractFailed, DownloadState.failedToRespond, DownloadState.transferFailed].indexOf(this.state) != -1;
		this.emit(isError ? 'error' : 'update');
	}

	static sanitizeFilename(filename: string): string {
		const newName = sanitize(filename, {
			replacement: ((invalidChar: string) => {
				switch (invalidChar) {
					case '/': return '-';
					case '\\': return '-';
					case '"': return "'";
					default: return '_'; //TODO: add more cases for replacing invalid characters
				}
			})
		});
		return newName;
	}
}