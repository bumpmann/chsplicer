import { AppPlugin } from "../appPlugin";
import * as express from "express";
import * as http from "http";
import * as socketIO from "socket.io";
import * as fse from "fs-extra";
import * as _path from "path";
import * as needle from 'needle';
import { Config } from "../config";
import { Logger } from "../logger";
import { Splicer } from "../splicer";

export class PluginWeb extends AppPlugin
{
    app: express.Express
    io: socketIO.Server

    async load(options: any)
    {
        await super.load(options);
        this.options.host = this.options.host ? Config.resolveView(this.options.host, this.options.args) : "127.0.0.1";
        this.options.port = this.options.port ? Config.resolveView(this.options.port, this.options.args) : 7676;
        this.logger.logTimeDelta = false;
    }

    private async scanDir(path: string, depth = 5): Promise<any>
    {
        if (!depth)
            return {};

        let dir = await fse.readdir(path);
        let paths: any = {};
        for (let file of dir)
        {
            if (_path.extname(file) == ".json")
            {
                let name = _path.basename(file);
                name = name.substr(0, name.length - 5);
                paths[name] = _path.relative(Config.configs_path, _path.normalize(path + "/" + file));
            }
            else if ((await fse.lstat(path + "/" + file)).isDirectory())
            {
                let subs = await this.scanDir(path + "/" + file, depth - 1);
                if (Object.keys(subs).length)
                    paths[_path.basename(file)] = subs;
            }
        }
        return paths;
    }

    async layoutPass()
    {
        this.app = express();
        let server = http.createServer(this.app);
        this.io = socketIO(server);

        this.io.on("connect", async socket => {
            let configs = await this.scanDir(Config.configs_path);
            socket.emit("configs", configs);
            socket.on("selectConfig", async (path, callback) => {
                path = _path.normalize(_path.resolve(Config.configs_path, path));
                if (_path.relative(Config.configs_path, path).match(/^\.\.(\/|\\|$)+/) || !await fse.pathExists(path))
                {
                    callback(null);
                    return;
                }

                let obj = JSON.parse((await fse.readFile(path, 'utf-8')).toString());
                callback(obj);
            });

            socket.on("runConfig", async (name, args, callback) => {
                try
                {
                    await new Splicer().run(name, args);
                }
                catch (e)
                {
                    callback({message: e.message, stack: e.stack});
                    return;
                }
                this.logger.log("Done config " + name + " !");
                callback();
            })

            socket.on("chorusSearch", async (query, callback) => {
                let url = 'https://chorus.fightthe.pw/api/search?query=' + encodeURIComponent(query);
                this.logger.log("Searching on chorus: ", query);
                callback((await needle('get', url)).body);
            });

            socket.on("chorusRandom", async (callback) => {
                this.logger.log("Searching random chorus songs");
                callback((await needle('get', 'https://chorus.fightthe.pw/api/random')).body);
            })

            this.logger.log("New client connection");
        })

        this.app.use(express.static(Config.assets_dir + '/web'));

        this.log(`Starting web server on http://${this.options.host}:${this.options.port}/`);
        server.listen(this.options.port, this.options.host, () => {
            this.log(`Web server listening on http://${this.options.host}:${this.options.port}/`);
            Logger.logger = (...args) => {
                this.io.emit('log', JSON.stringify(args));
            }
        })

        while(true) await new Promise(resolve => setTimeout(resolve, 600000));
    }
}