import * as needle from 'needle';
import * as fse from 'fs-extra';
import * as _path from 'path';
import * as _url from 'url';
import * as extract_zip from 'extract-zip';
import { EventEmitter } from 'events';
import { Config } from './config';
import * as util from 'util';
import { NeedleOptions } from 'needle';
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

	static async download(url: string, isArchive: boolean, folderid: string, retry = 10): Promise<Downloader>
	{
		let maxtry = retry;
		while (retry > 0)
		{
			try {
				return await new Promise((resolve, reject) => {
					let dl = new Downloader(url, isArchive, folderid);
					dl.on('error', err => reject(err || dl.errorMessage))
						//.on('update', () => console.log(dl.state.toString()))
						.on('end', () => resolve(dl))
						.start();
				});
			}
			catch (err)
			{
				if (--retry <= 0)
					throw err;

				let waittime = (maxtry - retry) * 5;
				console.log('Will retry in ' + waittime + ' mins (still ' + retry + ' tries)');
				await new Promise(resolve => setTimeout(resolve, waittime * 60000));
			}
		}
		throw new Error();
	}

	constructor(url: string, isArchive: boolean, folderName: string)
	{
		super();

		this.id = ++Downloader.lastID;
		this.state = DownloadState.waitingForResponse;
		this.url = url;
		this.isArchive = isArchive;

		folderName = Downloader.sanitizeFilename(folderName);
		this.tempFolder = _path.join(Config.temp_path, folderName)
		this.destination = _path.join(Config.cache_path, folderName);
	}

	private start(cookieHeader?: string) {
		let options: NeedleOptions = {
			follow_max: 10,
			headers: (cookieHeader ? { 'Cookie': cookieHeader } : undefined)
		};
		if (_url.parse(this.url).hostname == "drive.google.com")
		{
			if (!options.headers)
				options.headers = {};
			options.compressed = true;
			options.headers['accept'] = "accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9";
			options.headers['accept-encoding'] = "gzip, deflate, br";
			options.headers['accept-language'] = "fr,en-US;q=0.9,en;q=0.8";
			options.headers['user-agent'] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.116 Safari/537.36";
		}

		this.req = needle.get(this.url, options);

		this.req.on('header', (statusCode, headers) => {
			if (statusCode != 200) {
				this.errorMessage = `Failed to download chart: request to [${this.url}] returned status code ${statusCode}.`;
				this.handleBadResponse();
				return;
			}

			this.fileType = headers['content-type'];
			if (this.fileType.startsWith('text/html')) {
				// console.log('REQUEST RETURNED HTML');
				this.handleHTMLResponse(headers['set-cookie']);
				return;
			}

			// console.log(`REQUEST RETURNED FILE DOWNLOAD (x-goog-hash=[${headers['x-goog-hash']}])`);
			this.fileName = this.getDownloadFileName(this.url, headers);
			if (fse.pathExistsSync(this.destination + "/" + this.fileName))
			{
				console.log("Skipping " + this.fileName + " download, because already been downloaded");
				this.cancelDownload();
				this.updateState(DownloadState.finished);
				this.emit('end');
				return;
			}

			this.fileType = headers['content-type'];
			this.fileSize = headers['content-length'];
			this.updateState(DownloadState.download);
			this.handleDownloadResponse(headers);
		});
	}

	private handleBadResponse()
	{
		let badResponseHTML = '';
		this.req.on('data', data => badResponseHTML += data);
		this.req.on('done', async (err) => {
			if (badResponseHTML.indexOf("but your computer or network may be sending automated queries. To protect our users, we can't process your request right now") != -1)
			{
				console.log("Too much requests to google drive. Please wait few minutes and retry");
			}
			else
			{
				console.log("Wrote html response in debug.html", err);
				await fse.writeFile("debug.html", badResponseHTML, 'utf-8');
			}
			this.updateState(DownloadState.failedToRespond);
			return;
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

		const filePath = _path.join(this.tempFolder, this.fileName);
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
			return Downloader.sanitizeFilename(decodeURIComponent(_path.basename(url)));
		}

		// GDrive specific jazz
		const filenameRegex = /filename="(.*?)"/g;
		let results = filenameRegex.exec(headers['content-disposition']);
		if (results) {
			return Downloader.sanitizeFilename(results[1]);
		}

		let ext = "";
		if (headers['content-type'] == 'application/zip')
			ext = ".zip";
		let filename = decodeURIComponent(_path.basename(_url.parse(this.url).pathname || ""));
		if (!filename)
		{
			console.log(`Warning: couldn't find suitable filename`);
			return 'unknownFilename' + ext;
		}

		if (!_path.extname(filename))
			filename += ext;

		return Downloader.sanitizeFilename(filename);
	}

	private async extractDownload()
	{
		const source = _path.join(this.tempFolder, this.fileName);

		try
		{
			if (_path.extname(this.fileName).toLowerCase() == ".rar")
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
			const isFolderArchive = (files.length < 2 && !fse.lstatSync(_path.join(this.tempFolder, files[0])).isFile());
			if (this.isArchive && isFolderArchive) {
				this.tempFolder = _path.join(this.tempFolder, files[0]);
				files = await fse.readdir(this.tempFolder);
			}

			// Copy the files from the temporary directory to the destination
			for (const file of files) {
				await fse.move(_path.join(this.tempFolder, file), _path.join(this.destination, file));
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