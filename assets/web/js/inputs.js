class BaseInput
{
    constructor(app, label, config)
    {
        this.app = app;
        this.label = label;
        this.config = config;
    }
}

class StringInput extends BaseInput
{
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
                <div class="mdc-notched-outline">
                    <div class="mdc-notched-outline__leading"></div>
                    <div class="mdc-notched-outline__notch">
                        <span class="mdc-floating-label">${this.label}</span>
                    </div>
                    <div class="mdc-notched-outline__trailing"></div>
                </div>
            </div>
        </div>`);
        return this.elt;
    }

    run()
    {
        this.input = new mdc.textField.MDCTextField(this.elt.find('.mdc-text-field')[0]);
    }
}

class BooleanInput extends BaseInput
{
    get value()
    {
        return this.input && this.input.checked;
    }

    set value(val)
    {
        this.input.checked = val;
    }

    dom()
    {
        this.elt = $(`
        <div class="config-arg">
            <div class="mdc-form-field">
                <div class="mdc-checkbox">
                    <input type="checkbox" class="mdc-checkbox__native-control" />
                    <div class="mdc-checkbox__background">
                        <svg class="mdc-checkbox__checkmark"
                            viewBox="0 0 24 24">
                            <path class="mdc-checkbox__checkmark-path"
                                fill="none"
                                d="M1.73,12.91 8.1,19.28 22.79,4.59"/>
                        </svg>
                        <div class="mdc-checkbox__mixedmark"></div>
                        </div>
                    <div class="mdc-checkbox__ripple"></div>
                </div>
                <label>${this.label}</label>
            </div>
        </div>`);
        return this.elt;
    }

    run()
    {
        this.input = new mdc.checkbox.MDCCheckbox(this.elt.find('.mdc-checkbox')[0]);
    }
}

class SelectInput extends BaseInput
{
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
            <div class="mdc-select mdc-select--outlined">
                <div class="mdc-select__anchor">
                    <i class="mdc-select__dropdown-icon"></i>
                    <div id="demo-selected-text" class="mdc-select__selected-text" aria-label="l"></div>
                    <div class="mdc-notched-outline">
                        <div class="mdc-notched-outline__leading"></div>
                        <div class="mdc-notched-outline__notch">
                            <span class="mdc-floating-label">${this.label}</span>
                        </div>
                        <div class="mdc-notched-outline__trailing"></div>
                    </div>
                </div>

                <div class="mdc-select__menu mdc-menu mdc-menu-surface">
                    <ul class="mdc-list">
                        ${this.config.values.map(value =>
                            `<li class="mdc-list-item" data-value="${value}">${value}</li>`
                        ).join()}
                    </ul>
                </div>
            </div>
        </div>`);
        return this.elt;
    }

    run()
    {
        this.input = new mdc.select.MDCSelect(this.elt.find('.mdc-select')[0]);
    }
}