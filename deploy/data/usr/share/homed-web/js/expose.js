let colorPicker;

function temperatureToColor(value)
{
    let color = new Array();
    let k = 10000 / value;

    color.push(parseInt((k > 66 ? 1.292936 * Math.pow(k - 60, -0.133205) : 1) * 255));
    color.push(parseInt((k > 66 ? 1.129891 * Math.pow(k - 60, -0.075515) : 0.390082 * Math.log(k) - 0.631841) * 255));
    color.push(parseInt((k < 66 ? 0.543207 * Math.log(k - 10) -1.1962540 : 1) * 255));

    return color;
}

function exposeMeta(expose)
{
    let list = expose.split('_');
    let meta = {name: list[0]};

    if (!isNaN(list[1]))
        meta.id = list[1];

    return meta;
}

function exposeTitle(device, endpoint, property, names = true)
{
    let endpointId = endpoint.split('/')[2];
    let endpointName = device.options(endpointId).name;
    let propertyName = controller.propertyName(endpoint + '/' + (['lock', 'switch'].includes(property) ? 'status' : property));
    let meta = exposeMeta(property);
    let title = device.options(endpointId ?? 'common')[property]?.title;

    if (names && propertyName)
        return propertyName;

    if (!title || ['light', 'switch', 'cover', 'lock', 'thermostat'].includes(meta.name))
    {
        let list = meta.name.replace(/([A-Z])/g, ' $1').toLowerCase().split(' ');

        switch (list[0])
        {
            case 'co2':    list[0] = 'CO2'; break;
            case 'eco2':   list[0] = 'eCO2'; break;
            case 'pm':     list[0] = 'PM'; break;
            case 'pm1':    list[0] = 'PM1'; break;
            case 'pm4':    list[0] = 'PM4'; break;
            case 'pm10':   list[0] = 'PM10'; break;
            case 'pm25':   list[0] = 'PM2.5'; break;
            case 'uv':     list[0] = 'UV'; break;
            case 'voc':    list[0] = 'VOC'; break;
            default:       list[0] = list[0].charAt(0).toUpperCase() + list[0].slice(1).toLowerCase(); break;
        }

        if (list[1] == 'id' || list[1]?.match('^[pt][0-9]+$'))
            list[1] = list[1].toUpperCase();

        title = list.join(' ');
    }

    if (meta.id)
        title += ' ' + meta.id;

    return endpointId ? (endpointName ? endpointName + ' ' + title : title + ' ' + endpointId) : title;
}

function exposeList(expose, options)
{
    let meta = exposeMeta(expose);
    let list = new Array();

    switch (meta.name)
    {
        case 'cover':
            list = ['cover', 'position'];
            break;

        case 'light':
            list = ['status'].concat(options[meta.id ? 'light_' + meta.id : 'light'] ?? new Array());
            break;

        case 'lock':
        case 'switch':
            list = ['status'];
            break;

        case 'thermostat':
            let controls = ['systemMode', 'operationMode', 'targetTemperature'];
            controls.forEach(function(item) { if (options[item]) { list.push(item); options[item] = {...options[item], ...(item == 'targetTemperature' ? {type: 'number', unit: '°C'} : {type: 'select'})}; } });
            list = list.concat(options.runningStatus ? ['temperature', 'running'] : ['temperature']);
            options['temperature'] = {type: 'sensor', unit: '°C'};
            break;

        case 'thermostatProgram':

            let option = options.targetTemperature ?? {};

            if (isNaN(option.min) || isNaN(option.max))
                break;

            switch (options.thermostatProgram)
            {
                case 'aqara':
                {
                    let types = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

                    for (let i = 0; i < types.length; i++)
                    {
                        list.push('schedule' + types[i]);
                        options['schedule' + types[i]] = {type: 'toggle'};
                    }

                    for (let i = 0; i < 4; i++)
                    {
                        let item = 'scheduleP' + parseInt(i + 1);
                        list.push(item + 'Start');
                        list.push(item + 'Temperature');
                        options[item + 'Temperature'] = option;
                    }

                    break;
                }

                case 'daily':
                {
                    let types = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
                    let count = options.programTransitions ?? 4;

                    for (let i = 0; i < count * 7; i++)
                    {
                        let item = types[parseInt(i / count)] + 'P' + parseInt(i % count + 1);

                        if (options.programType != 2)
                        {
                            list.push(item + 'Start');
                            list.push(item + 'Temperature');
                        }
                        else
                        {
                            list.push(item + 'Temperature');
                            list.push(item + 'End');
                        }

                        options[item + 'Temperature'] = option;
                    }

                    break;
                }

                case 'moes':
                {
                    let types = ['weekday', 'saturday', 'sunday'];

                    for (let i = 0; i < 12; i++)
                    {
                        let item = types[parseInt(i / 4)] + 'P' + parseInt(i % 4 + 1);
                        list.push(item + 'Start');
                        list.push(item + 'Temperature');
                        options[item + 'Temperature'] = option;
                    }

                    break;
                }

                default:
                {
                    let types = ['weekday', 'holiday'];

                    for (let i = 0; i < 12; i++)
                    {
                        let item = types[parseInt(i / 6)] + 'P' + parseInt(i % 6 + 1);
                        list.push(item + 'Start');
                        list.push(item + 'Temperature');
                        options[item + 'Temperature'] = option;
                    }

                    break;
                }
            }

            break;

        default:
            list.push(meta.name);
            break;
    }

    if (meta.id)
        list.forEach((item, index) => { list[index] = item + '_' + meta.id; });

    return list;
}

function addExpose(table, device, endpointId, expose, names = true)
{
    let options = device.options(endpointId);
    let properties = device.properties(endpointId);
    let list = exposeList(expose, options);

    list.forEach(property =>
    {
        let recorder = controller.services.recorder;
        let last = table.rows[table.rows.length - 1]?.dataset.expose;
        let edge = last != expose && (last == 'thermostatProgram' || expose == 'thermostatProgram');
        let endpoint = device.service.split('/')[0] + '/' + device.id;
        let option = options[property] ?? new Object();
        let name = property.split('_')[0];
        let row = table.insertRow();
        let labelCell = row.insertCell();
        let valueCell = row.insertCell();
        let controlCell;

        if (endpointId != 'common')
            endpoint += '/' + endpointId;

        row.dataset.device = device.service + '/' + device.id;
        row.dataset.endpointId = endpointId;
        row.dataset.expose = expose;

        labelCell.innerHTML = '<span>' + exposeTitle(device, endpoint, property) + '</span>';
        labelCell.classList.add('label');

        valueCell.dataset.property = property;
        valueCell.innerHTML = empty;
        valueCell.classList.add('value');

        if (recorder)
        {
            let check = false;
            let element;

            labelCell.innerHTML += ' <i class="icon-chart shade"></i>';
            element = labelCell.querySelector('i');

            recorder.status.items?.forEach((data, index) =>
            {
                if (data.endpoint != endpoint || data.property != property)
                    return;

                element.addEventListener('click', function() { controller.showPage('recorder?index=' + index); showModal(false); });
                check = true;
            });

            if (!check)
            {
                element.classList.add('invisible');
                element.addEventListener('click', function() { recorder.showItemEdit(true, {endpoint: endpoint, property: property}); });
            }
        }

        if (names)
        {
            labelCell.querySelector('span').addEventListener('click', function()
            {
                loadHTML('names.html', this, modal.querySelector('.data'), function()
                {
                    let title = exposeTitle(device, endpoint, property, false);
                    let item = endpoint + '/' + property;

                    modal.querySelector('.name').innerHTML = device.info.name + ' <i class="icon-right"></i> ' + title;
                    modal.querySelector('input[name="name"]').placeholder = title;
                    modal.querySelector('input[name="name"]').value = controller.propertyName(item) ?? '';

                    modal.querySelector('.save').addEventListener('click', function()
                    {
                        controller.setPropertyName(item, modal.querySelector('input[name="name"]').value.trim());
                        labelCell.querySelector('span').innerHTML = exposeTitle(device, endpoint, property);
                        showModal(false);
                    });

                    modal.querySelector('.cancel').addEventListener('click', function() { showModal(false); });
                    showModal(true, 'input[name="name"]');
                });
            });
        }

        if (property != 'irCode')
        {
            controlCell = row.insertCell();
            controlCell.classList.add('control');
        }

        switch (name)
        {
            case 'color':
            {
                colorPicker = new iro.ColorPicker(controlCell, {layout: [{component: iro.ui.Wheel}], width: 150});
                colorPicker.on('input:end', function() { deviceCommand(device, endpointId, {[property]: [colorPicker.color.rgb.r, colorPicker.color.rgb.g, colorPicker.color.rgb.b]}); });
                break;
            }

            case 'colorTemperature':
            {
                let min = option.min ?? 153;
                let max = option.max ?? 500;
                valueCell.dataset.type = 'number';
                controlCell.innerHTML = '<input type="range" min="' + min + '" max="' + max + '" step="' + (option.step ?? 1) + '" class="colorTemperature">';
                controlCell.querySelector('input').style.background = 'linear-gradient(to right, rgb(' + temperatureToColor(min).join(', ') + '), rgb(' + temperatureToColor(max).join(', ') + '))';
                controlCell.querySelector('input').addEventListener('input', function() { valueCell.innerHTML = '<span' + (valueCell.dataset.value != this.value ? ' class="shade"' : '') + '>' + this.value + '</span>'; });
                controlCell.querySelector('input').addEventListener('change', function() { if (valueCell.dataset.value != this.value) deviceCommand(device, endpointId, {[property]: parseInt(this.value)}); });
                break;
            }

            case 'cover':
            {
                controlCell.innerHTML = '<span>open</span>/<span>stop</span>/<span>close</span>';
                controlCell.querySelectorAll('span').forEach(item => item.addEventListener('click', function() { valueCell.innerHTML = '<span class="shade">' + item.innerHTML + '</span>'; deviceCommand(device, endpointId, {[property]: item.innerHTML}); }) );
                break;
            }

            case 'irCode':
            {
                valueCell.innerHTML = '<textarea></textarea><div class "buttons"><button class="learn">Learn</button><button class="send">Send</button></div>';
                valueCell.colSpan = 2;
                valueCell.querySelector(".learn").addEventListener('click', function() { valueCell.querySelector('textarea').value = null; valueCell.dataset.mode = 'learn'; deviceCommand(device, endpointId, {learn: true}); });
                valueCell.querySelector(".send").addEventListener('click', function() { valueCell.dataset.mode = 'send'; deviceCommand(device, endpointId, {irCode: valueCell.querySelector('textarea').value}); });
                break;
            }

            case 'level':
            case 'position':
            {
                valueCell.dataset.unit = '%';

                if (option.type == 'sensor')
                    break;

                valueCell.dataset.type = 'number';
                controlCell.innerHTML = '<input type="range" min="0" max="100" class="' + property + '">';
                controlCell.querySelector('input').addEventListener('input', function() { valueCell.innerHTML = '<span' + (valueCell.dataset.value != this.value ? ' class="shade"' : '') + '>' + this.value + ' %</span>'; });
                controlCell.querySelector('input').addEventListener('change', function() { if (valueCell.dataset.value != this.value) deviceCommand(device, endpointId, {[property]: name == 'level' ? Math.round(this.value * 2.55) : parseInt(this.value)}); });
                break;
            }

            case 'status':
            {
                controlCell.innerHTML = '<span>on</span>/<span>off</span>/<span>toggle</span>';
                controlCell.querySelectorAll('span').forEach(item => item.addEventListener('click', function() { deviceCommand(device, endpointId, {[property]: item.innerHTML}); }) );
                break;
            }

            default:
            {
                if (property.endsWith('P1Start') || (options.programType == 2 && property.endsWith('P1Temperature')))
                    edge = true;

                switch (option.type)
                {
                    case 'binary':

                        if (option.class)
                            valueCell.dataset.class = option.class;

                        break;

                    case 'button':
                        controlCell.innerHTML = '<span>trigger</span>';
                        controlCell.querySelector('span').addEventListener('click', function() { valueCell.innerHTML = '<span class="shade">true</span>'; deviceCommand(device, endpointId, {[property]: true}); });
                        break;

                    case 'number':

                        if (isNaN(option.min) || isNaN(option.max))
                            break;

                        valueCell.dataset.type = 'number';

                        if (option.unit)
                            valueCell.dataset.unit = option.unit;

                        if ((option.max - option.min) / (option.step ?? 1) <= 1000 && !option.collapse)
                        {
                            controlCell.innerHTML = '<input type="range" min="' + option.min + '" max="' + option.max + '" step="' + (option.step ?? 1) + '">';
                            controlCell.querySelector('input').addEventListener('input', function() { valueCell.innerHTML = '<span' + (valueCell.dataset.value != this.value ? ' class="shade"' : '') + '>' + this.value + (option.unit ? ' ' + option.unit : '') + '</span>'; });
                            controlCell.querySelector('input').addEventListener('change', function() { if (valueCell.dataset.value != this.value) deviceCommand(device, endpointId, {[property]: parseFloat(this.value)}); });
                        }
                        else
                        {
                            controlCell.innerHTML = '<input type="number" min="' + option.min + '" max="' + option.max + '" step="' + (option.step ?? 1) + '" value="0"><button>Set</button>';
                            controlCell.querySelector('button').addEventListener('click', function() { let value = controlCell.querySelector('input[type="number"]').value; if (valueCell.dataset.value != value) { valueCell.innerHTML = '<span class="shade">' + value + (option.unit ? ' ' + option.unit : '') + '</span>'; deviceCommand(device, endpointId, {[property]: parseFloat(value)}); } });
                        }

                        break;

                    case 'select':

                        let items = Array.isArray(option.enum) ? option.enum : Object.values(option.enum);

                        if (!items.length)
                            break;

                        if (items.length <= 10 && !option.collapse)
                        {
                            items.forEach((item, index) => { controlCell.innerHTML += (index ? '/' : '') + '<span>' + item + '</span>'; });
                            controlCell.querySelectorAll('span').forEach(item => item.addEventListener('click', function() { if (valueCell.dataset.value != item.innerHTML) { valueCell.innerHTML = '<span class="shade">' + item.innerHTML + '</span>'; deviceCommand(device, endpointId, {[property]: item.innerHTML}); } }) );
                        }
                        else
                        {
                            let select = document.createElement('select');

                            valueCell.dataset.type = 'select';
                            controlCell.append(select);

                            items.forEach(item => { select.innerHTML += '<option>' + item + '</option>'; });
                            select.addEventListener('change', function() { if (valueCell.dataset.value != this.value) { valueCell.innerHTML = '<span class="shade">' + this.value + '</span>'; deviceCommand(device, endpointId, {[property]: this.value}); } });
                        }

                        break;

                    case 'sensor':

                        if (!isNaN(option.round))
                            valueCell.dataset.round = option.round;

                        if (option.unit)
                            valueCell.dataset.unit = option.unit;

                        break;

                    case 'time':
                        valueCell.dataset.type = 'time';
                        controlCell.innerHTML = '<input type="time" value="00:00"><button>Set</button>';
                        controlCell.querySelector('button').addEventListener('click', function() { let value = controlCell.querySelector('input[type="time"]').value; if (valueCell.dataset.value != value) { valueCell.innerHTML = '<span class="shade">' + value + '</span>'; deviceCommand(device, endpointId, {[property]: value}); } });
                        break;

                    case 'toggle':
                        controlCell.innerHTML = '<span>enable</span>/<span>disable</span>';
                        controlCell.querySelectorAll('span').forEach(item => item.addEventListener('click', function() { let value = item.innerHTML == 'enable' ? 'true' : 'false'; if (valueCell.dataset.value != value) { valueCell.innerHTML = '<span class="shade">' + value + '</span>'; deviceCommand(device, endpointId, {[property]: value}); } }) );
                        break;

                    default:

                        if (property.match('^[a-z]+P[0-9]+(Start|End)$'))
                        {
                            controlCell.innerHTML = '<input type="time" value="00:00" step="' + (options.programType != 2 ? 60 : 600) + '"><button>Set</button>';
                            controlCell.querySelector('button').addEventListener('click', function() { let value = controlCell.querySelector('input[type="time"]').value; let data = value.split(':'); if (valueCell.dataset.value != value) { valueCell.innerHTML = '<span class="shade">' + value + '</span>'; deviceCommand(device, endpointId, {[property.replace(options.programType != 2 ? 'Start' : 'End', 'Hour')]: parseInt(data[0]), [property.replace(options.programType != 2 ? 'Start' : 'End', 'Minute')]: parseInt(data[1])}); } });
                        }

                        break;
                }

                break;
            }
        }

        if (!edge)
            return;

        row.querySelectorAll('td').forEach(item => item.classList.add('edge'));
    });

    Object.keys(properties).forEach(property => { updateExpose(device, endpointId, property, properties[property]); });
}

function updateExpose(device, endpointId, property, value)
{
    document.querySelectorAll('tr[data-device="' + device.service + '/' + device.id + '"][data-endpoint-id="' + endpointId + '"]').forEach(row =>
    {
        let cell;

        if (property.match('^[a-z]+P[0-9]+(Hour|Minute)$'))
        {
            let item = property.replace('Hour', 'Start').replace('Minute', 'Start');

            cell = row.querySelector('td.value[data-property="' + item + '"]');

            if (!cell)
                cell = row.querySelector('td.value[data-property="' + item.replace('Start', 'End') + '"]');

            if (cell)
            {
                let input = row.querySelector('td.control input[type="time"]');
                let time;

                if (!input)
                    return;

                if (value < 10)
                    value = '0' + value;

                time = input.value.split(':');
                input.value = property.endsWith('Hour') ? value + ':' + time[1] : time[0] + ':' + value;

                cell.dataset.value = input.value;
                cell.innerHTML = input.value;
            }

            return;
        }

        if (device.options(endpointId).runningStatus && property == 'running')
        {
            cell = row.querySelector('[data-property="runningStatus"]');

            if (cell)
            {
                cell.innerHTML = '<i class="icon-' + (value ? 'play' : 'stop') + '"></i>';
                cell.classList.remove('warning', 'shade');
                cell.classList.add(value ? 'warning' : 'shade');
            }
        }

        cell = row.querySelector('[data-property="' + property + '"]');

        if (cell)
        {
            let name = property.split('_')[0];

            switch (name)
            {
                case 'color':

                    if (value[0] + value[1] + value[2] >= 255)
                    {
                        colorPicker.color.rgb = {r: value[0], g: value[1], b: value[2]};
                        cell.innerHTML = '<div class="color" style="background-color: rgb(' + value[0] + ', ' + value[1] + ', ' + value[2] + ');"></div>';
                    }

                    break;

                case 'irCode':

                    if (cell.dataset.mode == 'learn')
                    {
                        cell.querySelector('textarea').value = value;
                        cell.dataset.mode == 'send';
                    }

                    break;

                case 'status':
                    cell.innerHTML = '<i class="icon-enable ' + (value == 'on' ? 'warning' : 'shade') + '"></i>';
                    break;

                default:

                    if (['battery', 'batteryLow'].includes(name))
                        checkBattery(cell, value);

                    if (typeof value == 'boolean' && cell.dataset.class)
                    {
                        switch (cell.dataset.class)
                        {
                            case 'battery':   value = value ? 'low' : 'normal'; break;
                            case 'door':      value = value ? 'open' : 'closed'; break;
                            case 'occupancy': value = value ? 'occupied' : 'clear'; break;
                            case 'tamper':    value = value ? 'on' : 'off'; break;
                            case 'moisture':  value = value ? 'wet' : 'dry'; break;
                            default:          value = value ? 'detected' : 'clear'; break;
                        }
                    }

                    switch (cell.dataset.type)
                    {
                        case 'number':
                        case 'time':
                        {
                            let input = row.querySelector('td.control input');

                            if (name == 'level')
                                value = Math.round(value / 2.55);

                            if (input && cell.dataset.value != value)
                                input.value = value;

                            break;
                        }

                        case 'select': row.querySelector('td.control select').value = value; break;
                    }

                    if (typeof value == 'number' && cell.dataset.round)
                        value = parseFloat(value.toFixed(parseInt(cell.dataset.round)));

                    if (cell.dataset.value == value)
                        break;

                    cell.innerHTML = value + (cell.dataset.unit ? ' ' + cell.dataset.unit : '');
                    break;
            }

            cell.dataset.value = value;
        }
    });
}
