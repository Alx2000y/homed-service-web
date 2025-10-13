class Dashboard
{
    content = document.querySelector('.content .container');
    index = parseInt(localStorage.getItem('dashboard'));
    status = new Object();

    constructor(controller)
    {
        this.controller = controller;
    }

    updatePage()
    {
        document.querySelector('#serviceVersion').innerHTML = 'Web ' + this.status.version;
    }

    parseMessage(list, message)
    {
        switch (list[0])
        {
            case 'status':

                this.status = message;

                if (!this.status.dashboards)
                    this.status.dashboards = new Array();

                if (!this.status.names)
                    this.status.names = new Object();

                if (this.controller.service == 'dashboard')
                {
                    this.controller.showPage('dashboard');
                    this.updatePage();
                }

                break;
        }
    }

    devicePromise(item, cell)
    {
        cell.innerHTML = item.name ?? (item.endpoint ? item.endpoint + ' <i class="icon-right"></i> ' + (item.expose ?? item.property) : 'New item');

        if (!item.name)
        {
            let device;

            function wait(resolve)
            {
                device = this.controller.findDevice(item);

                if (!device.endpoints?.[item.endpoint.split('/')[2] ?? 'common']?.exposes)
                {
                    setTimeout(wait.bind(this, resolve), 10);
                    return;
                }

                resolve();
            }

            new Promise(wait.bind(this)).then(function() { cell.innerHTML = device.info.name + ' <i class="icon-right"></i> ' + exposeTitle(device, item.endpoint, item.expose ?? item.property); }.bind(this));
        }
    }

    sleep(timeout)
    {
        return new Promise(resolve => setTimeout(resolve, timeout));
    }

    itemString(item, edit = true)
    {
        let device = this.controller.findDevice(item);
        let property = item.expose ?? item.property;

        if (['lock', 'switch'].includes(property))
            property = 'status';

        return (edit ? (item.expose ? 'Device' : 'Recorder') + ' <i class="icon-right"></i> ' : '') + (device.info ? device.info.name : '<span class="error">' + item.endpoint + '</span>') + ' <i class="icon-right"></i> ' + exposeTitle(device, item.endpoint, property);
    }

    dashboardName(dashboard)
    {
        return (dashboard.overview ? '<i class="icon-group"></i> ' : '') + dashboard.name;
    }

    setIndex(index)
    {
        this.index = index;
        localStorage.setItem('dashboard', this.index);
    }

    storeDashboards()
    {
        this.controller.socket.publish('command/web', {action: 'updateDashboards', data: this.status.dashboards});
        this.controller.clearPage();
    }

    storeNames()
    {
        this.controller.socket.publish('command/web', {action: 'updateNames', data: this.status.names});
    }

    addOverview(dashboard)
    {
        dashboard.blocks = new Array();

        dashboard.exposes.forEach(expose =>
        {
            let block = {items: new Array()};

            switch (expose)
            {
                case 'co2':       block.name = 'CO2'; break;
                case 'voc':       block.name = 'VOC'; break;
                case 'waterLeak': block.name = 'Water leak'; break;
                default:          block.name = expose.charAt(0).toUpperCase() + expose.slice(1); break;
            }

            Object.keys(this.controller.services).forEach(item =>
            {
                let service = this.controller.services[item];

                if (!service.devices || !Object.keys(service.devices).length)
                    return;

                Object.keys(service.devices).forEach(id =>
                {
                    let device = service.devices[id];

                    Object.keys(device.endpoints).forEach(endpointId => { device.items(endpointId).forEach(item =>
                    {
                        let data = {endpoint: device.service.split('/')[0] + '/' + device.id, expose: item};

                        if (item.split('_')[0] != expose && device.options(endpointId)[item]?.class != expose)
                            return;

                        if (endpointId != 'common')
                            data.endpoint += '/' + endpointId;

                        block.items.push(data);

                    }); });
                });
            });

            dashboard.blocks.push(block);
        });
    }

    addBlockItem(table, item)
    {
        let row = table.insertRow();
        let titleCell = row.insertCell();
        let valueCell = row.insertCell();

        this.devicePromise(item, titleCell);
        titleCell.classList.add('name');

        valueCell.innerHTML = empty;
        valueCell.classList.add('value');

        if (item.expose)
        {
            let part = item.expose.split('_');

            switch (part[0])
            {
                case 'light':
                case 'lock':
                case 'switch':
                    let name = part[1] ? 'status_' + part[1] : 'status';
                    row.dataset.type = 'status';
                    valueCell.dataset.property = name;
                    valueCell.addEventListener('click', function() { let device = this.controller.findDevice(item); if (device) deviceCommand(device, item.endpoint.split('/')[2] ?? 'common', {[name]: 'toggle'}); }.bind(this));
                    break;

                case 'cover':
                    valueCell.dataset.property = 'position';
                    valueCell.dataset.unit = '%';
                    break;

                case 'thermostat':
                    valueCell.innerHTML = '<span data-property="runningStatus"></span> <span data-property="temperature">' + empty + '</span> <i class="icon-right"></i> <span data-property="targetTemperature" data-unit="°C">' + empty + '</span>';
                    break;

                default:
                    valueCell.dataset.property = item.expose;
                    break;
            }
        }
        else
        {
            valueCell.dataset.property = item.property;

            if (item.property.split('_')[0] == 'status')
            {
                row.dataset.type = 'status';
                valueCell.addEventListener('click', function() { let device = this.controller.findDevice(item); if (device) deviceCommand(device, item.endpoint.split('/')[2] ?? 'common', {[item.property]: 'toggle'}); }.bind(this));
            }
        }

        return row;
    }

    addChart(table, item, interval, height)
    {
        let row = table.insertRow();
        let cell = row.insertCell();

        cell.innerHTML = '<div class="placeholder"></div>';
        cell.classList.add('chart');
        cell.colSpan = 2;

        function wait(resolve)
        {
            if (!this.controller.services.recorder)
            {
                setTimeout(wait.bind(this, resolve), 10);
                return;
            }

            resolve();
        }

        new Promise(wait.bind(this)).then(function()
        {
            row.addEventListener('click', function() { this.showRecorderInfo(item, interval); }.bind(this));
            cell.querySelector('div').innerHTML = '<canvas id="chart-' + randomString(8) + '" class="' + (height ?? 'normal') + '"></canvas>';
            cell.querySelector('div').classList.remove('placeholder');
            this.controller.services.recorder.chartQuery(item, cell, interval);

        }.bind(this));
    }

    showPage()
    {
        let menu = document.querySelector('.menu');

        if (!guest)
        {
            menu.innerHTML  = '<span id="sort"><i class="icon-list"></i> Sort</span>';
            menu.innerHTML += '<span id="add"><i class="icon-plus"></i> Add</span>';
            menu.innerHTML += '<span id="import" class="mobileHidden"><i class="icon-upload"></i> Import</span>';

            menu.querySelector('#sort').addEventListener('click', function() { this.showDashboardSort(); }.bind(this));
            menu.querySelector('#add').addEventListener('click', function() { this.showDashboardEdit(null); }.bind(this));

            menu.querySelector('#import').addEventListener('click', function()
            {
                loadFile(function(data)
                {
                    this.status.dashboards.push(data);
                    this.setIndex(this.status.dashboards.length - 1);
                    this.storeDashboards();

                }.bind(this));

            }.bind(this));
        }
        else
            menu.innerHTML = null;

        if (!this.status.version)
            return;

        this.showDashboard();
        this.updatePage();
    }

    showDashboard()
    {
        if (!guest)
            document.querySelector('#sort').style.display = this.status.dashboards.length > 1 ? 'inline-block' : 'none';

        if (!this.status.dashboards.length)
        {
            this.content.innerHTML = '<div class="emptyList">dashboards list is empty</div>';
            return;
        }

        if (!this.status.dashboards[this.index])
            this.index = 0;

        loadHTML('html/dashboard/dashboard.html', this, this.content, function()
        {
            let loader = this.content.querySelector('.pageLoader');
            let list = this.content.querySelector('.dashboardList');
            let dashboard = this.status.dashboards[this.index];

            if (!guest)
            {
                this.content.querySelector('.edit').addEventListener('click', function() { this.showDashboardEdit(dashboard); }.bind(this));
                this.content.querySelector('.remove').addEventListener('click', function() { this.showDashboardRemove(dashboard); }.bind(this));

                this.content.querySelector('.export').addEventListener('click', function()
                {
                    let item = document.createElement("a");
                    let data = {...dashboard};

                    if (data.overview)
                        delete data.blocks;

                    item.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
                    item.download = dashboard.name + '.json';
                    item.click();

                }.bind(this));
            }
            else
                this.content.querySelectorAll('.edit, .remove, .export').forEach(element => element.style.display = 'none');

            handleArrowButtons(this.content, Array.from(this.status.dashboards.keys()), this.index, function(index) { this.setIndex(index); this.showDashboard(); }.bind(this));

            this.status.dashboards.forEach((dashboard, index) =>
            {
                let element = document.createElement('span');

                if (list.innerHTML)
                    list.append('|');

                if (this.index == index)
                    element.classList.add('highlight');

                element.innerHTML = this.dashboardName(dashboard);
                element.addEventListener('click', function() { this.setIndex(index); this.showDashboard(); }.bind(this));

                list.appendChild(element);
            });

            loader.style.display = 'block';

            this.sleep(dashboard.overview ? 100 : 0).then(() =>
            {
                if (dashboard.overview && !dashboard.blocks)
                    this.addOverview(dashboard);

                loader.style.display = 'none';

                if (!dashboard.blocks.length)
                {
                    let element = this.content.querySelector('.dashboardData');
                    element.innerHTML = '<div class="emptyList">dashboard is empty</div>';
                    element.style.display = 'block';
                    return;
                }

                dashboard.blocks.forEach((block, index) =>
                {
                    let element = document.createElement('div');
                    let table = document.createElement('table');
                    let status = true;
                    let items = new Array();
                    let column;

                    element.innerHTML = '<div class="title"><span class="name">' + block.name + '</span><span class="control"></span></div>';

                    if (!dashboard.overview && !guest)
                    {
                        element.querySelector('.control').innerHTML += '<span class="edit"><i class="icon-edit"></i></span>';
                        element.querySelector('.edit').addEventListener('click', function() { this.showBlockEdit(dashboard, index); }.bind(this));
                    }

                    if (block.note)
                    {
                        let note = document.createElement('div');
                        note.innerHTML += block.note;
                        note.classList.add('note');
                        element.append(note);
                    }

                    element.append(table);
                    element.classList.add('dashboardBlock');

                    block.items.forEach(item =>
                    {
                        let row = this.addBlockItem(table, item);
                        let endpointId = item.endpoint.split('/')[2] ?? 'common';
                        let device;

                        row.classList.add('inactive');

                        if (row.dataset.type != 'status')
                            status = false;

                        function wait(resolve)
                        {
                            device = this.controller.findDevice(item);

                            if (!device.endpoints?.[endpointId]?.exposes)
                            {
                                setTimeout(wait.bind(this, resolve), 10);
                                return;
                            }

                            resolve();
                        }

                        new Promise(wait.bind(this)).then(function()
                        {
                            let cell = row.querySelector("td.value");
                            let option = device.options(endpointId)[item.expose ?? item.property] ?? new Object();
                            let properties = device.properties(endpointId);

                            row.dataset.device = device.service + '/' + device.id;
                            row.dataset.endpointId = endpointId;
                            row.querySelectorAll(row.dataset.type == 'status' ? 'td.name' : 'td.name, td.value').forEach(element => element.addEventListener('click', function() { this.showExposeInfo(item, device, endpointId); }.bind(this)));

                            if (status)
                                items.push({device: device, endpointId: endpointId, property: row.querySelector('td.value').dataset.property});

                            if (option.type == 'binary' && option.class)
                                cell.dataset.class = option.class;

                            if (!isNaN(option.round))
                                cell.dataset.round = option.round;

                            if (option.unit)
                                cell.dataset.unit = option.unit;

                            Object.keys(properties).forEach(property => { updateExpose(device, endpointId, property, properties[property]); });

                        }.bind(this));

                        if (item.expose)
                            return;

                        row.classList.add('label');
                        this.addChart(table, item, block.interval, block.height);
                    });

                    if (!table.rows.length)
                    {
                        let cell = table.insertRow().insertCell();
                        cell.innerHTML = '<i>block is empty<i>';
                        cell.classList.add('center', 'shade');
                    }
                    else if (status)
                    {
                        let toggle = document.createElement('span');

                        toggle.innerHTML = '<i class="icon-enable shade"></i>';
                        toggle.classList.add('toggle');

                        toggle.addEventListener('click', function() { items.forEach(item => { deviceCommand(item.device, item.endpointId, {[item.property]: toggle.dataset.status == 'on' ? 'off' : 'on'}); }); });
                        element.querySelector('.control').append(toggle);

                        setInterval(function()
                        {
                            let status = 'off'

                            items.forEach(item => { if (item.device.properties(item.endpointId)[item.property] == 'on') status = 'on'; });

                            if (toggle.dataset.status == status)
                                return;

                            toggle.dataset.status = status;
                            toggle.querySelector('i').className = 'icon-enable ' + (status == 'on' ? 'warning' : 'shade');

                        }, 100);
                    }

                    switch (dashboard.columnPriority)
                    {
                        case 'left':  column = index < dashboard.blocks.length / 1.5 ? 'a' : 'b'; break;
                        case 'right': column = index < dashboard.blocks.length / 4.0 ? 'a' : 'b'; break;
                        default:      column = index < dashboard.blocks.length / 2.0 ? 'a' : 'b'; break;
                    }

                    this.content.querySelector('.column.' + column).append(element);
                });
            });
        });
    }

    showDashboardSort()
    {
        let showTable = function(table)
        {
            table.innerHTML = null;

            this.status.dashboards.forEach((dashboard, index) =>
            {
                let row = table.insertRow();

                for (let i = 0; i < 3; i++)
                {
                    let cell = row.insertCell();

                    switch (i)
                    {
                        case 0: cell.innerHTML = this.dashboardName(dashboard); break;

                        case 1:

                            if (index == this.status.dashboards.length - 1)
                                break;

                            cell.innerHTML = '<i class="icon-down"></i>';
                            cell.classList.add('move');
                            cell.addEventListener('click', function() { this.status.dashboards[index + 1] = this.status.dashboards.splice(index, 1, this.status.dashboards[index + 1])[0]; showTable(table); }.bind(this));
                            break;

                        case 2:

                            if (!index)
                                break;

                            cell.innerHTML = '<i class="icon-up"></i>';
                            cell.classList.add('move');
                            cell.addEventListener('click', function() { this.status.dashboards[index - 1] = this.status.dashboards.splice(index, 1, this.status.dashboards[index - 1])[0]; showTable(table); }.bind(this));
                            break;
                    }
                }
            });

        }.bind(this);

        loadHTML('html/dashboard/dashboardSort.html', this, modal.querySelector('.data'), function()
        {
            modal.querySelector('.save').addEventListener('click', function() { this.storeDashboards(); }.bind(this));
            modal.querySelector('.cancel').addEventListener('click', function() { showModal(false); });

            showTable(modal.querySelector('table.dashboards'));
            showModal(true);
        });
    }

    showDashboardEdit(dashboard)
    {
        let showTable = function(table, dashboard, overview)
        {
            table.style.display = dashboard.blocks.length && !overview ? 'table' : 'none';
            table.innerHTML = null;

            dashboard.blocks?.forEach((block, index) =>
            {
                let row = table.insertRow();

                for (let i = 0; i < 4; i++)
                {
                    let cell = row.insertCell();

                    switch (i)
                    {
                        case 0:
                            cell.innerHTML = block.name;
                            cell.classList.add('edit');
                            cell.addEventListener('click', function() { this.showBlockEdit(dashboard, index, function() { this.showDashboardEdit(dashboard); }.bind(this)); }.bind(this));
                            break;

                        case 1:

                            if (dashboard.blocks.length < 2 || index == dashboard.blocks.length - 1)
                                break;

                            cell.innerHTML = '<i class="icon-down"></i>';
                            cell.classList.add('move');
                            cell.addEventListener('click', function() { dashboard.blocks[index + 1] = dashboard.blocks.splice(index, 1, dashboard.blocks[index + 1])[0]; showTable(table, dashboard); }.bind(this));
                            break;

                        case 2:

                            if (dashboard.blocks.length < 2 || !index)
                                break;

                            cell.innerHTML = '<i class="icon-up"></i>';
                            cell.classList.add('move');
                            cell.addEventListener('click', function() { dashboard.blocks[index - 1] = dashboard.blocks.splice(index, 1, dashboard.blocks[index - 1])[0]; showTable(table, dashboard); }.bind(this));
                            break;

                        case 3:
                            cell.innerHTML = '<i class="icon-trash"></i>';
                            cell.classList.add('remove');
                            cell.addEventListener('click', function() { dashboard.blocks.splice(index, 1); showTable(table, dashboard); });
                            break;
                    }
                }
            });

        }.bind(this);

        if (!dashboard)
            dashboard = {name: 'New dashboard', blocks: new Array(), add: true};

        loadHTML('html/dashboard/dashboardEdit.html', this, modal.querySelector('.data'), function()
        {
            modal.querySelector('.name').innerHTML = this.dashboardName(dashboard);
            modal.querySelector('input[name="name"]').value = dashboard.name;
            modal.querySelector('select[name="columnPriority"]').value = dashboard.columnPriority ?? 'equal';

            modal.querySelector('input[name="overview"]').closest('label').style.display = dashboard.overview || dashboard.add ? 'block' : 'none';
            modal.querySelector('input[name="overview"]').checked = dashboard.overview;

            modal.querySelector('input[name="overview"]').addEventListener('click', function()
            {
                modal.querySelector('.overview').style.display = this.checked ? 'block' : 'none';
                modal.querySelector('.add').disabled = this.checked;
                showTable(modal.querySelector('table.blocks'), dashboard, this.checked);
            });

            modal.querySelector('.overview').style.display = dashboard.overview ? 'block' : 'none';
            modal.querySelectorAll('.overview input').forEach(item => { if (dashboard.exposes?.includes(item.name)) item.checked = true; });

            modal.querySelector('.add').disabled = dashboard.overview;
            modal.querySelector('.add').addEventListener('click', function() { this.showBlockEdit(dashboard, null, function() { this.showDashboardEdit(dashboard); }.bind(this)); }.bind(this));

            modal.querySelector('.save').addEventListener('click', function()
            {
                let form = formData(modal.querySelector('form'));

                dashboard.name = form.name;
                dashboard.columnPriority = form.columnPriority;
                dashboard.overview = form.overview;

                if (dashboard.overview)
                {
                    dashboard.exposes = new Array();
                    modal.querySelectorAll('.overview input').forEach(item => { if (item.checked) dashboard.exposes.push(item.name); });
                    delete dashboard.blocks;
                }
                else
                {
                    delete dashboard.exposes;
                    delete dashboard.overview;
                }

                if (dashboard.add)
                {
                    this.setIndex(this.status.dashboards.length);
                    this.status.dashboards.push(dashboard);
                    delete dashboard.add;
                }

                this.storeDashboards();

            }.bind(this));

            modal.querySelector('.cancel').addEventListener('click', function() { showModal(false); });

            showTable(modal.querySelector('table.blocks'), dashboard, dashboard.overview);
            showModal(true, 'input[name="name"]');
        });
    }

    showDashboardRemove(dashboard)
    {
        loadHTML('html/dashboard/dashboardRemove.html', this, modal.querySelector('.data'), function()
        {
            modal.querySelector('.name').innerHTML = this.dashboardName(dashboard);
            modal.querySelector('.remove').addEventListener('click', function() { this.status.dashboards.splice(this.index, 1); this.setIndex(0); this.storeDashboards(); }.bind(this));
            modal.querySelector('.cancel').addEventListener('click', function() { showModal(false); });
            showModal(true);
        });
    }

    showBlockEdit(dashboard, blockIndex, callback)
    {
        let showTable = function(table, dashboard, block)
        {
            table.style.display = block.items.length ? 'table' : 'none';
            table.innerHTML = null;

            block.items.forEach((item, index) =>
            {
                let row = table.insertRow();

                for (let i = 0; i < 4; i++)
                {
                    let cell = row.insertCell();

                    switch (i)
                    {
                        case 0:
                            cell.innerHTML = '<span></span><div class="note">' + this.itemString(item) + '</div>';
                            cell.classList.add('edit');
                            cell.addEventListener('click', function() { this.showItemEdit(dashboard, block, item, function() { this.showBlockEdit(dashboard, blockIndex, callback); }.bind(this)); }.bind(this));
                            this.devicePromise(item, cell.querySelector('span'));
                            break;

                        case 1:

                            if (block.items.length < 2 || index == block.items.length - 1)
                                break;

                            cell.innerHTML = '<i class="icon-down"></i>';
                            cell.classList.add('move');
                            cell.addEventListener('click', function() { block.items[index + 1] = block.items.splice(index, 1, block.items[index + 1])[0]; showTable(table, dashboard, block); }.bind(this));
                            break;

                        case 2:

                            if (block.items.length < 2 || !index)
                                break;

                            cell.innerHTML = '<i class="icon-up"></i>';
                            cell.classList.add('move');
                            cell.addEventListener('click', function() { block.items[index - 1] = block.items.splice(index, 1, block.items[index - 1])[0]; showTable(table, dashboard, block); }.bind(this));
                            break;

                        case 3:
                            cell.innerHTML = '<i class="icon-trash"></i>';
                            cell.classList.add('remove');
                            cell.addEventListener('click', function() { block.items.splice(index, 1); showTable(table, dashboard, block); });
                            break;
                    }
                }
            });

        }.bind(this);

        let block = isNaN(blockIndex) ? new Qbject() : dashboard.blocks[blockIndex];

        if (!block)
            block = {name: 'New block', items: new Array(), add: true};

        loadHTML('html/dashboard/blockEdit.html', this, modal.querySelector('.data'), function()
        {
            modal.querySelector('.name').innerHTML = dashboard.name + ' <i class="icon-right"></i> ' + block.name;
            modal.querySelector('input[name="name"]').value = block.name;
            modal.querySelector('textarea[name="note"]').value = block.note ?? '';

            this.status.dashboards.forEach((dashboard, index) =>
            {
                let option = document.createElement('option');
                option.innerHTML = dashboard.name;
                option.value = index;
                modal.querySelector('select[name="dashboard"]').append(option);
            });

            modal.querySelector('.edit').style.display = block.add ? 'none' : 'block';
            modal.querySelector('select[name="dashboard"]').value = this.index;
            modal.querySelector('select[name="interval"]').value = block.interval ?? '24h';
            modal.querySelector('select[name="height"]').value = block.height ?? 'normal';
            modal.querySelector('.add').addEventListener('click', function() { this.showItemEdit(dashboard, block, null, function() { this.showBlockEdit(dashboard, blockIndex, callback); }.bind(this)); }.bind(this));

            modal.querySelector('.save').addEventListener('click', function()
            {
                let form = formData(modal.querySelector('form'));

                block.name = form.name;
                block.interval = form.interval;
                block.height = form.height;

                if (form.note)
                    block.note = form.note;
                else
                    delete block.note;

                if (block.add)
                {
                    dashboard.blocks.push(block);
                    delete block.add;
                }
                else if (form.dashboard != this.index)
                {
                    if (!callback)
                        this.setIndex(form.dashboard);

                    dashboard.blocks.splice(blockIndex, 1);
                    this.status.dashboards[form.dashboard].blocks.splice(blockIndex, 0, block);
                }

                if (callback)
                {
                    callback();
                    return;
                }

                this.storeDashboards();

            }.bind(this));

            modal.querySelector('.cancel').addEventListener('click', function() { callback ? callback() : showModal(false); });

            showTable(modal.querySelector('table.items'), dashboard, block);
            showModal(true, 'input[name="name"]');
        });
    }

    showItemEdit(dashboard, block, item, callback)
    {
        let recorder = this.controller.services.recorder;
        let list = new Object();

        if (!item)
            item = {add: true};

        Object.keys(this.controller.services).forEach(item =>
        {
            let service = this.controller.services[item];

            if (!service.devices || !Object.keys(service.devices).length)
                return;

            Object.keys(service.devices).forEach(id =>
            {
                let device = service.devices[id];

                Object.keys(device.endpoints).forEach(endpointId => { device.items(endpointId).forEach(expose =>
                {
                    let value = {endpoint: item.split('/')[0] + '/' + id, expose: expose};

                    if (expose == 'thermostatProgram')
                        return;

                    if (endpointId != 'common')
                        value.endpoint += '/' + endpointId;

                    list['Device <i class="icon-right"></i> ' + device.info.name + ' <i class="icon-right"></i> ' + exposeTitle(device, value.endpoint, expose)] = value;

                }); });
            });
        });

        if (recorder?.status?.items?.length)
        {
            recorder.status.items.forEach(item =>
            {
                let device = this.controller.findDevice(item);

                if (!device.info)
                    return;

                list['Recorder <i class="icon-right"></i> ' + device.info.name + ' <i class="icon-right"></i> ' + exposeTitle(device, item.endpoint, item.property)] = {endpoint: item.endpoint, property: item.property};
            });
        }

        loadHTML('html/dashboard/itemEdit.html', this, modal.querySelector('.data'), function()
        {
            let name = modal.querySelector('.name');
            let data;

            name.innerHTML = dashboard.name + ' <i class="icon-right"></i> ' + block.name + ' <i class="icon-right"></i> <span>New item</span>';

            if (!item.add)
                this.devicePromise(item, name.querySelector('span'));

            modal.querySelector('input[name="name"]').placeholder = 'Default name';
            modal.querySelector('input[name="name"]').value = item.name ?? '';
            modal.querySelector('.item').innerHTML = item.add ? 'Select item there <i class="icon-right"></i>' : this.itemString(item);

            addDropdown(modal.querySelector('.dropdown'), Object.keys(list), function(key)
            {
                data = list[key];
                modal.querySelector('.item').innerHTML = this.itemString(data);
                modal.querySelector('.item').classList.remove('error');

            }.bind(this));

            modal.querySelector('.save').addEventListener('click', function()
            {
                item.name = modal.querySelector('input[name="name"]').value;

                if (!item.name)
                    delete item.name;

                if (data)
                {
                    item.endpoint = data.endpoint;

                    if (data.expose)
                    {
                        item.expose = data.expose;
                        delete item.property;
                    }
                    else
                    {
                        item.property = data.property;
                        delete item.expose;
                    }
                }

                if (!item.endpoint || (!item.expose && !item.property))
                {
                    modal.querySelector('.item').classList.add('error');
                    return;
                }

                if (item.add)
                {
                    block.items.push(item);
                    delete item.add;
                }

                if (callback)
                {
                    callback();
                    return;
                }

                this.storeDashboards();

            }.bind(this));

            modal.querySelector('.cancel').addEventListener('click', function() { callback ? callback() : showModal(false); });
            showModal(true, 'input[name="name"]');
        });
    }

    showExposeInfo(item, device, endpointId)
    {
        let expose = item.expose;

        if (item.property)
        {
            let part = item.property.split('_');
            let list =
            {
                cover:      ['cover', 'position'],
                light:      ['status', 'level', 'color', 'colorTemperature', 'colorMode'],
                lock:       ['status'],
                switch:     ['status'],
                thermostat: ['systemMode', 'operationMode', 'targetTemperature', 'temperature', 'running']
            };

            Object.keys(list).forEach(key => { if (list[key].includes(part[0]) && device.items(endpointId).includes(key)) expose = key; });

            if (!expose)
                expose = item.property;

            if (part[1])
                expose += '_' + part[1];
        }

        loadHTML('html/dashboard/exposeInfo.html', this, modal.querySelector('.data'), function()
        {
            let table;

            modal.querySelector('.name').innerHTML = this.itemString({endpoint: item.endpoint, expose: expose}, false);

            table = modal.querySelector('table.exposes');
            addExpose(table, device, endpointId, expose, false);

            if (table.rows.length == 1 && !table.querySelector('td.control').innerHTML)
                table.querySelector('tr').deleteCell(2);

            if (!guest)
                modal.querySelector('.device').addEventListener('click', function() { this.controller.showPage(device.service + '?device=' + device.id); showModal(false); }.bind(this));
            else
                modal.querySelector('.device').style.display = 'none';

            modal.querySelector('.close').addEventListener('click', function() { showModal(false); });
            showModal(true);
        });
    }

    showRecorderInfo(item, interval)
    {
        loadHTML('html/dashboard/recorderInfo.html', this, modal.querySelector('.data'), function()
        {
            let id = 'chart-' + randomString(8);
            let chart = modal.querySelector('.chart');

            modal.querySelector('.name').innerHTML = this.itemString(item, false);

            modal.querySelector('.interval').querySelectorAll('span').forEach(element =>
            {
                if (element.innerHTML == interval)
                    element.classList.add('warning');

                element.addEventListener('click', function()
                {
                    modal.querySelector('.interval').querySelectorAll('span').forEach(element => element.classList.remove('warning'));
                    element.classList.add('warning');

                    modal.querySelector('.status').innerHTML = '<div class="dataLoader"></div>';

                    if (!this.controller.services.recorder)
                        return;

                    this.controller.services.recorder.chartQuery(item, chart, element.innerHTML);

                }.bind(this))
            });

            modal.querySelector('.item').addEventListener('click', function()
            {
                this.controller.services.recorder?.status.items?.forEach((data, index) =>
                {
                    if (data.endpoint != item.endpoint || data.property != item.property)
                        return;

                    this.controller.showPage('recorder?index=' + index);
                    showModal(false);
                });

            }.bind(this));

            modal.querySelector('.close').addEventListener('click', function() { showModal(false); });
            modal.querySelectorAll('#data').forEach(item => { item.id = id; });

            if (this.controller.services.recorder)
                this.controller.services.recorder.chartQuery(item, chart, interval);

            showModal(true);
        });
    }
}
