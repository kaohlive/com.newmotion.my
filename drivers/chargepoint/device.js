'use strict'

const Homey = require('homey')
const MNM = require('../../lib/mnm')
const CP = require('./chargepoint')

class Chargepoint extends Homey.Device {
    async onInit() {
        // register a capability listener
        this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this))
        this.setSettings({
            charge_card:this.getData().deviceSettings.card.name,
            connected_car:this.getData().deviceSettings.car.name
        })
        this._driver = this.getDriver()
        //CP.addMeasurePowerCurrent(this)
        this.updateDevice()
        this.start_update_loop()
    }


    // this method is called when the Device has requested a state change (turned on or off)
	async onCapabilityOnoff( value, opts ) {
        this.setIfHasCapability('onoff', value)
        console.info('turn charging '+value)
        if(value)
        {
            await MNM.startSession(this.getData().id,this.getData().deviceSettings.card.rfid)
            await this.delay(10000)
        }
        else
        {
            await MNM.stopSession(this.getData().id)
            await this.delay(4000)
        }
        this.updateDevice()
    }
    
    delay(t, val) {
        return new Promise(function(resolve) {
            setTimeout(function() {
                resolve(val);
            }, t);
        });
     }

    onDeleted() {
        if (this._timer) {
            clearInterval(this._timer)
        }
    }

    start_update_loop() {
        this._timer = setInterval(() => {
            this.updateDevice();
        }, 60000); //1 min
    }

    async updateDevice() {
        const settings = this.getSettings()
        const id = this.getData().id
        const serial = this.getData().serial
        
        const data = CP.enhance(await MNM(id, await MNM.getAuthCookie()))
        //console.log(JSON.stringify(data));
        const prev = this.getStoreValue('cache')
        await this.setStoreValue('cache', data)
        if (prev.e.free !== null && prev.e.free !== data.e.free) {
            this._driver.ready(() => {
                this._driver.triggerChanged( this, {}, {} );
            });
            //A connector become occupied
            if (prev.e.free > data.e.free) {
                this._driver.ready(() => {
                    console.log('Trigger start event, a free connector is no more.');
                    this._driver.triggerStart( this, {}, {} );
                });
            } else if (prev.e.free<prev.e.total && data.e.total == data.e.free) {
                this._driver.ready(() => {
                    console.log('Trigger stop event, all connectors are now free.');
                    this._driver.triggerStop( this, {}, {} );
                });
            }
            //A connector has stopped charging
            if(prev.e.charging > data.e.charging) {
                this._driver.ready(() => {
                    console.log('Trigger charging completed event, a connector is no longer charging.');
                    this._driver.triggerCompleted( this, {}, {} );
                });
            }
            //A connector has started charging
            if(prev.e.charging < data.e.charging) {
                this._driver.ready(() => {
                    console.log('Trigger charging started event, a connector is now charging.');
                    this._driver.triggerCharging( this, {}, {} );
                });
            }
            //So a connector became available
            if(prev.e.free < data.e.free) {
                this._driver.ready(() => {
                    console.log('Trigger connector free event, a connector is now free.');
                    this._driver.triggerFree( this, {}, {} );
                });
            }
            //So the chargepoint is now fully occupied
            if (prev.e.free > 0 &&  data.e.free == 0) {
                this._driver.ready(() => {
                    console.log('Trigger occupied event, all connectors are occupied.');
                    this._driver.triggerOccupied( this, {}, {} );
                });
            }
        }

        this.setIfHasCapability('alarm_online',!data.latestOnlineStatus.online)
        this.setIfHasCapability('onoff', (data.e.free == 0))
        this.setIfHasCapability('occupied', (data.e.free == 0))
        this.setIfHasCapability('charging', (data.e.charging > 0))
        this.setIfHasCapability('connectors.total', data.e.total)
        this.setIfHasCapability('connectors.free', data.e.free)
        if(data.e.availablepower>0)
            this.setIfHasCapability('power.max', (data.e.availablepower/1000))
        else
            this.setIfHasCapability('power.max', 0)

        if(settings.charge_capacity>0 && data.e.charging > 0) {
            // this.setIfHasCapability('measure_power.current', (this.getSettings().charge_capacity*1000))
            this.setIfHasCapability('measure_power', (this.getSettings().charge_capacity*1000))
        } else {
            // this.setIfHasCapability('measure_power.current', 1)
            this.setIfHasCapability('measure_power', 1)
        }

        console.info('device updated')
    }

    setIfHasCapability(cap, value) {
        if (this.hasCapability(cap)) {
            return this.setCapabilityValue(cap, value).catch(this.error)
        }
        else
        {
            //console.log('Attempt to set cap ['+cap+'] not available');
        }
    }
}



module.exports = Chargepoint