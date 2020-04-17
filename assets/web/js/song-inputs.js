class SongInput extends BaseInput
{
    static chorusDialog;
    static chorusInput;
    static chorusSongs;

    get value()
    {
        return this.input && this.input.value;
    }

    set value(val)
    {
        this.input.value = val;
    }

    dom()
    {
        this.elt = $(`
        <div class="config-arg">
            <div class="mdc-text-field mdc-text-field--outlined">
                <input class="mdc-text-field__input" type="text" aria-label="">
                <button class="mdc-button mdc-button--unelevated button-shaped button-chorus"><span class="mdc-button__label">Chorus</span></button>
                <div class="mdc-notched-outline">
                    <div class="mdc-notched-outline__leading"></div>
                    <div class="mdc-notched-outline__notch">
                        <span class="mdc-floating-label">${this.label}</span>
                    </div>
                    <div class="mdc-notched-outline__trailing"></div>
                </div>
            </div>
        </div>`);
        this.elt.find('.button-chorus').click(this.openChorus.bind(this));
        return this.elt;
    }

    run()
    {
        this.input = new mdc.textField.MDCTextField(this.elt.find('.mdc-text-field')[0]);
        if (!SongInput.chorusDialog)
        {
            SongInput.chorusDialog = new mdc.dialog.MDCDialog($('#dialog-chorus')[0]);
            SongInput.chorusInput = new mdc.textField.MDCTextField($('#dialog-chorus .mdc-text-field')[0]);
        }
    }

    displaySongs(songs)
    {
        SongInput.chorusSongs = songs;
        $('#dialog-chorus .chorus-results').html('');
        for (let song of songs)
        {
            let elt = $(`
<div class="mdc-layout-grid__inner">
<div class="mdc-layout-grid__cell mdc-layout-grid__cell--span-12">
    <div class="Song">
        <div class="Song__meta">
            ${song.artist ? `<div class="Song__artist">${song.artist}</div>` : ''}
            ${song.artist ? `<div class="Song__name">${song.name}</div>` : ''}
            ${song.album ? `<div class="Song__album">${song.album}${song.year ? ` (${song.year})` : ''}</div>` : ''}
            ${song.genre ? `<div class="Song__genre">${song.genre}</div>` : ''}
            ${song.length ? `<div class="Song__length">${Math.floor(song.length / 60)}:${song.length % 60}</div>`: ''}
            ${song.charter ? `<div class="Song__charter"><b>${song.charter}'s</b> chart</div>` : ''}
            ${song.hashes && song.hashes.file ? `<div class="Song__hash">Chart checksum: ${song.hashes.file}</div>` : ''}
        </div>
        ${song.effectiveLength && song.noteCounts && song.noteCounts.guitar && song.noteCounts.guitar.x ? `
        <div class="Song__chart-metrics">
            <div class="Song__chart-info">
                <div class="NoteDensity">
                    <div class="NoteDensity__text">
                        <div class="NoteDensity__label">${Math.floor(song.noteCounts.guitar.x / song.effectiveLength * 100) / 100} average NPS</div>
                    </div>
                </div>
            </div>
            <div class="select-container" style="display:none">
                <button class="mdc-button mdc-button--raised">Select</button>
            </div>
        </div>` : ''}
    </div>
</div>
</div>
            `);
            $('#dialog-chorus .chorus-results').append(elt);
            if (song.hashes && song.hashes.file)
            {
                elt.find('.select-container').show();
                elt.find('button').click(() => {
                    this.value = "chorus:" + song.hashes.file;
                    SongInput.chorusDialog.close();
                })
            }
        }
    }

    searchChorus()
    {
        if (!SongInput.chorusInput.value)
            return;
        this.app.socket.emit('chorusSearch', SongInput.chorusInput.value, result => {
            if (!result || !result.songs || !result.songs.length)
            {
                this.app.log("Found no results");
                return;
            }

            this.displaySongs(result.songs);
        });
    }

    randomChorus()
    {
        this.app.socket.emit('chorusRandom', result => {
            if (!result || !result.songs || !result.songs.length)
            {
                this.app.log("Error while fetching songs");
                return;
            }

            this.displaySongs(result.songs);
        })
    }

    openChorus()
    {
        SongInput.chorusDialog.open();
        $('#dialog-chorus .button-search').off().click(this.searchChorus.bind(this));
        $('#dialog-chorus #chorus-randomizer').off().click(this.randomChorus.bind(this));
        $('#dialog-chorus .mdc-text-field').off().keyup(e => {
            if(e.keyCode == 13)
                this.searchChorus();
        });
        if (SongInput.chorusSongs)
            this.displaySongs(SongInput.chorusSongs);
    }
}