'use strict'

const Homey = require('homey')
const MNM = require('../../lib/mnm')
const CP = require('./chargepoint')
const { ManagerSettings } = require('homey');

function mobile() {
    return
}

class ChargepointDriver extends Homey.Driver {

    onInit() {
        this._flowTriggerStart = new Homey.FlowCardTriggerDevice('start').register()
        this._flowTriggerStop = new Homey.FlowCardTriggerDevice('stop').register()
        this._flowTriggerChanged = new Homey.FlowCardTriggerDevice('changed').register()
        this._flowTriggerOccupied = new Homey.FlowCardTrigger('occupied').register()
        this._flowTriggerFree = new Homey.FlowCardTrigger('free').register()
    }

    onPair( socket ) {
        socket.on('login', ( data, callback ) => {
            ManagerSettings.set('user_email',data.username);
            ManagerSettings.set('user_password',data.password);
            
            MNM.getAuthCookie()
              .then(token => {
                  if(token==='')
                   callback( null, false);
                  else
                   callback( null, true);
              })
              .catch(err => {
                callback(err);
              });
        });
        
        socket.on('list_devices', ( data, callback ) => {
            MNM.getAuthCookie()
              .then(token => {
                MNM.list(token)
                    .then(function (points) {
                        const devices = points.map((point) => {
                            point = CP.enhance(point)
                            let device = {
                                name: point.name,
                                data: { id: point.id, serial: point.serial },
                                store: { cache: point },
                                mobile: mobile()
                            }
                            return CP.buildDevice(device, point)
                        })

                        callback(null, devices)
                    })
                    .catch((err) => callback(err, null))
                })
                .catch((err) => callback(err, null))
        })
      }

    triggerStart(device) {
        this._flowTriggerStart
            .trigger(device, {}, {})
            .then(this.log)
            .catch(this.error)
    }

    triggerStop(device) {
        this._flowTriggerStop
            .trigger(device, {}, {})
            .then(this.log)
            .catch(this.error)
    }

    triggerChanged(device) {
        this._flowTriggerChanged
            .trigger(device, {}, {})
            .then(this.log)
            .catch(this.error)
    }

    triggerOccupied() {
        this._flowTriggerOccupied
            .trigger()
            .then(this.log)
            .catch(this.error)
    }

    triggerFree() {
        this._flowTriggerFree
            .trigger()
            .then(this.log)
            .catch(this.error)
    }

}

module.exports = ChargepointDriver