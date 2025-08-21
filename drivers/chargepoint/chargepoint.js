'use strict'

const max = Math.max
const round = Math.round

module.exports = {}

module.exports.enhance = function (data) {
    
    if (!data) {
        throw new Error("Invalid data object passed to enhance()");
    } 

    data.e = { connectors: {} }
    data.e.total = 1;
    data.e.free = data.STATUS === '0' ? 1 : 0;
    //Charging is truly drawing power
    data.e.charging = data.STATUS === '10000' ? 1 : 0;
    //Preparing is when the cable is in and hooked, but no active session started
    data.e.preparingEvses = data.Notification === 'Preparing transaction' ? 1 : 0;
    //The overal duration of a connected connector
    data.e.occupied = data.STATUS !== '0' ? 1 : 0;
    //Suspended is the status when there is a EV connected with an active session but it is not charging
    data.e.suspended = data.STATUS === '50000' ? 1 : 0;
    //This is a Error like state that prevents new sessions from being started
    data.e.blocked = data.STATUS === '20000' ? 1 : 0;
    //We now grab the active card from the API statusdetail object to accuratly reflect the used card, this should work also when a card was swiped.
    data.e.cardname = data.CARDID;
    //These are more deprecated values, set them to 0    
    data.e.price = 0
    data.e.availablepower = 0
    data.e.maxpower = 0
    data.e.latestOnlineStatus = !(data.STATUS === '2000000');
    return data
}

module.exports.icon = function (point) {
    return 'lolo.svg'
    // if (point.model.startsWith('LOLO') && point._embedded.evses.length == 1) return 'lolo.svg'
    // if (point.model.startsWith('HOMEADVANCED') && point._embedded.evses.length == 1) return 'lolo.svg'
    // if (point.model.startsWith('NA22') && point._embedded.evses.length == 1) return 'lolo.svg'
    // if (point.serial.startsWith('EVB-P') && point._embedded.evses.length == 1) return 'evbox.svg'
    // if (point.serial.startsWith('ICUEVE') && point._embedded.evses.length == 2) return 'icueve2.svg'
    // if (point.e.total == 2 && point.e.maxpower == 22.1) return 'public2.svg'
    // if (point.e.types.length == 1) return 'plug/' + point.e.types[0].toLowerCase() + '.svg'
}

module.exports.buildDevice = function (device, point) {
    device.icon = module.exports.icon(point)

    const firstplug = '/drivers/chargepoint/assets/plug/type2.svg'

    device.capabilities = []
    device.capabilitiesOptions = {}
    device.mobile = {
        'components': [
            {
                'id': 'icon'
            },
            {
                'id': 'sensor',
                'capabilities': [],
                'options': {
                    'icons': {}
                }
            }
        ]
    }

    // module.exports.addMeasurePowerCurrent(device)

    device.capabilities.push('alarm_online')
    device.capabilitiesOptions['alarm_online'] = {
        'title': {
            'en': 'Offline alarm',
            'nl': 'Offline alarm'
        }
    }

    if(point)
        device.capabilities.push('onoff')
        device.capabilitiesOptions['onoff'] = {
            'uiQuickAction': false
        }

    if (point) {
        //We show the occupied and charging state if its a single connector chargepoint
        device.capabilities.push('occupied')
        device.capabilities.push('charging')
        device.capabilities.push('active_card')
    } 
    //Add the power capabilities
    device.capabilities.push('measure_power')
    device.capabilities.push('power.max')
    device.capabilitiesOptions['power.max'] = {
        'title': {
            'en': 'Power available',
            'nl': 'Vermogen beschikbaar'
        }
    }

    return device;
}

