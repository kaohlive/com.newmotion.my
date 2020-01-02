'use strict'

const Homey = require('homey')
const MNM = require('../../lib/mnm')
const CP = require('./chargepoint')

class Chargepoint extends Homey.Device {
    async onInit() {
        // register a capability listener
        this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this))
        let cards = await MNM.cards(await MNM.getAuthCookie())
        this.setSettings({
            // only provide keys for the settings you want to change
            chargecard: cards[0].rfid,
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
            await MNM.startSession(this.getData().id,this.getSettings().chargecard)
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
        const data = CP.enhance(await MNM(id))
        const prev = this.getStoreValue('cache')
        await this.setStoreValue('cache', data)
        if (prev.e.free !== null && prev.e.free !== data.e.free) {
            this._driver.ready(() => {
                this._driver.triggerChanged( this, {}, {} );
            });

            if (prev.e.free > data.e.free) {
                this._driver.ready(() => {
                    this._driver.triggerStart( this, {}, {} );
                });
            } else if (prev.e.free < data.e.free) {
                this._driver.ready(() => {
                    this._driver.triggerStop( this, {}, {} );
                });
            }
            if(prev.e.occupied < data.e.occupied) {
                this._driver.ready(() => {
                    this._driver.triggerCompleted( this, {}, {} );
                });
            }

            if (data.e.free == 0) {
                this._driver.triggerOccupied(this)
            } else if (data.e.free > 0) {
                this._driver.triggerFree(this)
            }
        }

        this.setIfHasCapability('alarm_online',!data.latestOnlineStatus.online)
        this.setIfHasCapability('onoff', (data.e.free == 0))
        this.setIfHasCapability('occupied', (data.e.free == 0))
        this.setIfHasCapability('connectors.total', data.e.total)
        this.setIfHasCapability('connectors.free', data.e.free)
        if(data.e.availablepower>0)
            this.setIfHasCapability('power.max', (data.e.availablepower/1000))
        else
            this.setIfHasCapability('power.max', 0)

        if(settings.charge_capacity>0)
            this.setIfHasCapability('measure_power.current', (this.getSettings().charge_capacity*1000))

        console.info('device updated')
    }

    setIfHasCapability(cap, value) {
        if (this.hasCapability(cap)) {
            return this.setCapabilityValue(cap, value).catch(this.error)
        }
    }
}



module.exports = Chargepoint