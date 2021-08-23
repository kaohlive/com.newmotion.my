'use strict'

const max = Math.max
const round = Math.round

module.exports = {}

module.exports.enhance = function (data) {
    data.e = { connectors: {} }
    delete (data.openingHours)
    let total = 0
    data._embedded.evses.forEach((evse) => { total += evse.connectors.length })
    data.e.total = total
    let totalFree = 0
    let availableEvses = data._embedded.evses.filter((evse) => evse.status == 'available')
    availableEvses.forEach((evse) => { totalFree += evse.connectors.length })
    data.e.free = totalFree
    //We now grab the active card from the API statusdetail object to accuratly reflect the used card, this should work also when a card was swiped.
    data.e.cardname = (data._embedded.evses[0] && data._embedded.evses[0].statusDetails) ? data._embedded.evses[0].statusDetails.printedNumber : ''
    let totalCharging = 0
    let chargingEvses = data._embedded.evses.filter((evse) => evse.status == 'charging')
    chargingEvses.forEach((evse) => { totalCharging += evse.connectors.length })
    data.e.charging = totalCharging
    let totalOccupied = 0
    let occupiedEvses = data._embedded.evses.filter((evse) => evse.status == 'occupied')
    occupiedEvses.forEach((evse) => { totalOccupied += evse.connectors.length })
    data.e.occupied = totalOccupied

    data.e.price = 0

    //Calculate the available power the chargepoint can give based on the connector max times the available connectors
    if (data.e.free > 0)
        data.e.availablepower = (availableEvses[0].maxPower*data.e.free)
    else   
        data.e.availablepower = 0
    //The Maximum of power the charge point can give is the max per connector times the amount of connectors
    data.e.maxpower = (data._embedded.evses[0].maxPower*data.e.total)

    data.e.types = []
    data._embedded.evses.forEach((evse) => { 
        evse.connectors.forEach((conn) => {
            if (!data.e.types.includes(conn.connectorType)) data.e.types.push(conn.connectorType)
        })
    })

    if (data.e.types.length > 1) {
        data.e.bytype = {}
        data.e.types.forEach((type) => {
            total = 0

            data._embedded.evses.forEach((evse) => { 
                connectorsOfType = evse.connectors.filter((conn) => conn.connectorType == type)
                total += connectorsOfType.length
            })
            totalfree = 0
            availableEvses.forEach((evse) => { 
                availableConnectorsOfType = evse.connectors.filter((conn) => conn.connectorType == type)
                totalfree += availableConnectorsOfType.length
            })
            data.e.bytype[type] = {
                total: total,
                free: totalfree
            }
            console.info(data.e.bytype[type])
        })
    }
    return data
}

module.exports.icon = function (point) {
    if (point.model.startsWith('LOLO') && point._embedded.evses.length == 1) return 'lolo.svg'
    if (point.serial.startsWith('EVB-P') && point._embedded.evses.length == 1) return 'evbox.svg'
    if (point.serial.startsWith('ICUEVE') && point._embedded.evses.length == 2) return 'icueve2.svg'
    if (point.e.total == 2 && point.e.maxpower == 22.1) return 'public2.svg'
    if (point.e.types.length == 1) return 'plug/' + point.e.types[0].toLowerCase() + '.svg'
}

// module.exports.addMeasurePowerCurrent = function (device) {
//     device.capabilities.push('measure_power.current')
//     device.capabilitiesOptions['measure_power.current'] = {
//         "title": {
//             "en": "Estimated usage in W",
//             "nl": "Geschat verbruik in W"
//           },
//           'preventInsights': false
//     }
// }

module.exports.buildDevice = function (device, point) {
    device.icon = module.exports.icon(point)

    const firstplug = '/drivers/chargepoint/assets/plug/' + point.e.types[0].toLowerCase() + '.svg'

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

    if(point._embedded.evses[0].connectors.length>0)
        device.capabilities.push('onoff')
        device.capabilitiesOptions['onoff'] = {
            'uiQuickAction': false
        }

    if (point._embedded.evses[0].connectors.length == 1) {
        //We show the occupied and charging state if its a single connector chargepoint
        device.capabilities.push('occupied')
        device.capabilities.push('charging')
        device.capabilities.push('active_card')
    } else {
        //So these only show up if we have more than 1 connector on the charge point
        device.capabilities.push('connectors.free')
        device.capabilities.push('connectors.total')

        device.capabilitiesOptions['connectors.free'] = {
            'title': {
                'en': 'Free',
                'nl': 'Vrij'
            }
        }

        device.capabilitiesOptions['connectors.total'] = {
            'title': {
                'en': 'Total',
                'nl': 'Totaal'
            },
            'preventInsights': true
        }
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

