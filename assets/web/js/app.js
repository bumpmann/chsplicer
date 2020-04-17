

class App
{
    static inputClasses = {
        'string': StringInput,
        'boolean': BooleanInput,
        'select': SelectInput,
        'song': SongInput
    }

    constructor()
    {
        this.socket = io();
        this.selectedConfig = null;
        this.runButton = $('#config-card button');
        this.logCount = 0;

        this.runButton.click(this.runConfig.bind(this));

        this.socket.on('log', msg => {
            let data = JSON.parse(msg);
            this.log(...data);
        });

        this.socket.on('configs', configs => {
            $('#configs').html("");
            this.addConfigs("", configs);
        })
    }

    addConfig(path, name, config, depth)
    {
        if (name == "web")
            return;

        let li = $('<li>');
        li.addClass("mdc-list-item");
        li.text(name);
        li.css('padding-left', (depth * 40) + 'px');
        if ((typeof config) == "string")
        {
            $('#configs').append(li);
            li.click(() => {
                this.socket.emit('selectConfig', config, data => {
                    $('#configs li').removeClass('mdc-list-item--activated');
                    li.addClass('mdc-list-item--activated');
                    this.selectConfig(path + name, data)
                });
            })
        }
        else if (config)
        {
            li.prepend($('<i class="material-icons">folder</i>'));
            $('#configs').append(li);
            this.addConfigs(path + name + "/", config, depth + 1);
        }
    }

    addConfigs(path, configs, depth = 0)
    {
        for (let k in configs)
        {
            let config = configs[k];
            if ((typeof config) == "string")
                this.addConfig(path, k, config, depth);
        }
        for (let k in configs)
        {
            let config = configs[k];
            if ((typeof config) != "string")
            this.addConfig(path, k, config, depth);
        }
    }

    selectConfig(name, config)
    {
        $('#config-card h2').text("Configuration - " + name);
        $('#config-card').show();
        $('#config-params').html("");
        if (config.name)
            $('#config-params').append($("<div>").text("Song name: " + config.name));
        if (config.description)
            $('#config-description').show().text(config.description);
        else
            $('#config-description').hide();
        let configArgs = {};
        if (config.args)
        {
            for (let k in config.args)
            {
                let labelName = k == parseInt(k) ? "Value " + (k > 1 ? k : '') : k;
                let arg = config.args[k];
                if (!arg.type)
                {
                    if (arg.values)
                        arg.type = 'select';
                    else if (arg.default != undefined)
                        arg.type = typeof arg.default;
                }
                let argInput = new (App.inputClasses[arg.type || 'string'] || StringInput)(this, labelName, arg);
                if (arg.description)
                    $('#config-params').append($('<div class="config-desc">').text(arg.description));
                $('#config-params').append(argInput.dom());
                if (argInput.run)
                    argInput.run();
                if (arg.default != undefined)
                    argInput.value = arg.default;
                configArgs[k] = argInput;
            }
        }
        this.selectedConfig = {
            name: name,
            config: config,
            inputs: configArgs
        };
    }

    log(...args)
    {
        if (++this.logCount >= 32)
        {
            $('#messages p.log').last().remove();
            this.logCount--;
        }
        let logLine = $('<p class="log">').text(args.map(arg => (typeof arg) == "string" ? arg : JSON.stringify(arg)).join(" "));
        $('#messages').prepend(logLine);
        return logLine;
    }

    error(...args)
    {
        this.log(...args).addClass('log-error');
    }


    runConfig()
    {
        if (!this.selectedConfig)
            return;
        let args = {};
        for (let k in this.selectedConfig.inputs)
        {
            args[k] = this.selectedConfig.inputs[k].value;
        }
        this.log("");
        this.socket.emit('runConfig', this.selectedConfig.name, args, e => {
            if (e)
            {
                this.error(e.message);
                console.error(e.stack);
            }
            this.runButton.removeAttr('disabled');
        });
        this.runButton.attr('disabled', true);
    }
}
