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

module.exports.addMeasurePowerCurrent = function (device) {
    device.capabilities.push('measure_power.current')
    device.capabilitiesOptions['measure_power.current'] = {
        "title": {
            "en": "Estimated usage in W",
            "nl": "Geschat verbruik in W"
          },
          'preventInsights': false
    }
}

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

    module.exports.addMeasurePowerCurrent(device)

    device.capabilities.push('alarm_online')
    device.capabilitiesOptions['alarm_online'] = {
        'title': {
            'en': 'Is offline'
        }
    }

    if(point._embedded.evses[0].connectors.length>0)
        device.capabilities.push('onoff')

    if (point._embedded.evses[0].connectors.length == 1) {
        device.capabilities.push('occupied')

        device.mobile.components[1].capabilities.push('occupied')
        device.mobile.components[1].options.icons['occupied'] = firstplug

    } else {
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

        device.mobile.components[1].capabilities.push('connectors.free')
        device.mobile.components[1].capabilities.push('connectors.total')

        device.mobile.components[1].options.icons['connectors.free'] = firstplug
        device.mobile.components[1].options.icons['connectors.total'] = firstplug
    }

    device.capabilities.push('power.max')

    device.capabilitiesOptions['power.max'] = {
        'title': {
            'en': 'Power available',
            'nl': 'Vermogen beschikbaar'
        }
    }

    device.mobile.components[1].capabilities.push('power.max')

    device.mobile.components[1].options.icons['power.max'] = '/assets/power.svg';
    
    return device
}

