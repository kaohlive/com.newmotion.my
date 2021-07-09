'use strict'

const Homey = require('homey')
const MNM = require('../../lib/mnm')
const CP = require('./chargepoint')

class Chargepoint extends Homey.Device {

    async onInit() {
        // register a capability listener
        this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
        this.setupDeviceSettings();
        this.updateDevice();
        this.start_update_loop();
        this.setAvailable();
        //register flow cards
        this._startGenericCharging = this.homey.flow.getActionCard('start_charge_generic');
        this.setupStartGenericCharging();        
        this._stopGenericCharging = this.homey.flow.getActionCard('stop_charge_generic');
        this.setupStopGenericCharging();   
        this._conditionActiveCharge = this.homey.flow.getConditionCard('charging_state');
        this.setupConditionActiveCharge();   
        this._conditionActiveChargeForCard = this.homey.flow.getConditionCard('charging_state_card');
        this.setupConditionActiveChargeForCard();   
        this._conditionActiveChargeForCardCar = this.homey.flow.getConditionCard('charging_state_generic');
        this.setupConditionActiveChargeForCardCar();   
    }

    setupDeviceSettings()
    {
        let storedCard = this.getStoreValue('card');
        if(!storedCard)
        {
            console.log('The store did not hold a card yet, grab it from device data');
            this.setStoreValue('card',this.getData().deviceSettings.card);
            this.setStoreValue('car',this.getData().deviceSettings.car);
            storedCard = this.getStoreValue('card');
        }
        this.setSettings({
            charge_card:this.getStoreValue('card').formattedName,
            connected_car:this.getStoreValue('car').formattedName
        });
    }


    // this method is called when the Device has requested a state change (turned on or off)
	async onCapabilityOnoff( value, opts ) {
        this.setIfHasCapability('onoff', value)
        console.info('turn charging '+value)
        if(value)
        {
            await MNM.startSession(this.getData().id,this.getData().deviceSettings.card.rfid, this.homey.settings.get('user_email'),this.homey.settings.get('user_password'))
            await this.delay(10000)
        }
        else
        {
            await MNM.stopSession(this.getData().id, this.homey.settings.get('user_email'),this.homey.settings.get('user_password'))
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
        }, 15000); //15 seconds
    }

    async updateDevice() {
        const settings = this.getSettings()
        const id = this.getData().id
        const serial = this.getData().serial
        
        const data = CP.enhance(await MNM(id, await MNM.getAuthCookie(this.homey.settings.get('user_email'),this.homey.settings.get('user_password'))))
        //console.log(JSON.stringify(data));
        console.debug('get previous status from cache');
        const prev = this.getStoreValue('cache')
        console.debug('replace cache');
        await this.setStoreValue('cache', data)
        if (prev.e.free !== null) {
            console.debug('free prev: '+prev.e.free+' new: '+data.e.free)
            console.debug('total prev: '+prev.e.total +' new: '+data.e.total)
            console.debug('charging prev: '+prev.e.charging +' new: '+data.e.charging)
            if(prev.e.free !== data.e.free) {
                this.driver.ready().then(() => {
                    console.log('Trigger changed event, something changed.');
                    this.driver.triggerChanged( this, {}, {} );
                });
            }
            //A connector become occupied
            if (prev.e.free > data.e.free) {
                this.driver.ready().then(() => {
                    console.log('Trigger start event, a free connector is no more.');
                    this.driver.triggerStart( this, {
                        cardname:data.e.cardname,
                        carname:this.getStoreValue('car').name
                    }, {} );
                });
            } else if (prev.e.free<prev.e.total && data.e.total == data.e.free) {
                this.driver.ready().then(() => {
                    console.log('Trigger stop event, all connectors are now free.');
                    this.driver.triggerStop( this, {
                        cardname:data.e.cardname,
                        carname:this.getStoreValue('car').name
                    }, {} );
                });
            }
            //So a connector became available
            if(prev.e.free < data.e.free) {
                this.driver.ready().then(() => {
                    console.log('Trigger connector free event, a connector is now free.');
                    this.driver.triggerFree( this, {}, {} );
                });
            }
            //So the chargepoint is now fully occupied
            if (prev.e.free > 0 &&  data.e.free == 0) {
                this.driver.ready().then(() => {
                    console.log('Trigger occupied event, all connectors are occupied.');
                    this.driver.triggerOccupied( this, {}, {} );
                });
            }
            //A connector has stopped charging
            if(prev.e.charging > data.e.charging) {
                this.driver.ready().then(() => {
                    console.log('Trigger charging completed event, a connector is no longer charging.');
                    this.driver.triggerCompleted( this, {
                        cardname:data.e.cardname,
                        carname:this.getStoreValue('car').name
                    }, {} );
                });
            }
            //A connector has started charging
            if(prev.e.charging < data.e.charging) {
                this.driver.ready().then(() => {
                    console.log('Trigger charging started event, a connector is now charging.');
                    this.driver.triggerCharging( this, {
                        cardname:data.e.cardname,
                        carname:this.getStoreValue('car').name
                    }, {} );
                });
            }
        } else {
            console.debug('no cached data available, so no events can be generated')
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

        if (data.e.charging === data.e.total)
            this.setIfHasCapability('active_card', data.e.cardname)
        else
            this.setIfHasCapability('active_card', null)

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

    myChargeCards() {
        console.log('user wants a list of cards');
        return new Promise(async (resolve) => {
            MNM.getAuthCookie(this.homey.settings.get('user_email'),this.homey.settings.get('user_password'))
            .then(token => {
                MNM.cards(token).then(function (cards) {
                    const mycards = cards.map((card) => {
                        card.formattedName = card.name +' ('+card.printedNumber+')';
                        return card;
                    });
                    return resolve(mycards);
                });
            })
        });
    }

    myCars() {
        console.log('user wants a list of cars');
        return new Promise(async (resolve) => {
            MNM.getAuthCookie(this.homey.settings.get('user_email'),this.homey.settings.get('user_password'))
            .then(token => {
                MNM.cars(token).then(function (cars) {
                    const mycars = cars.map((car) => {
                        car.formattedName = car.name+' ('+car.battery+' kW)';
                        return car;
                    });
                    return resolve(mycars);
                });
            })
        });        
    }

    setupConditionActiveChargeForCardCar(){
        this._conditionActiveChargeForCardCar
        .registerRunListener(async (args, state) => {
          console.log('is the session active for ('+args.car.name+') using card: '+args.card.name);
          return new Promise((resolve, reject) => {
              let isCharging= this.getCapabilityValue('charging');
              resolve(isCharging && this.getStoreValue('card').rfid==args.card.rfid && this.getStoreValue('car').name==args.car.name);
          });
        });
      this._conditionActiveChargeForCardCar
        .registerArgumentAutocompleteListener('card', async (query) => {
          return this.myChargeCards();
        });
      this._conditionActiveChargeForCardCar
        .registerArgumentAutocompleteListener('car' , async (query) => {
          return this.myCars();
        });
    }

    setupConditionActiveChargeForCard(){
        this._conditionActiveChargeForCard
        .registerRunListener(async (args, state) => {
          console.log('is the session active for the card: '+args.card.name);
          return new Promise((resolve, reject) => {
              let isCharging= this.getCapabilityValue('charging');
              resolve(isCharging && this.getStoreValue('card').rfid==args.card.rfid);
          });
        });
      this._conditionActiveChargeForCard
        .registerArgumentAutocompleteListener('card', async (query) => {
          return this.myChargeCards();
        });
    }

    setupConditionActiveCharge(){
        this._conditionActiveCharge
        .registerRunListener(async (args, state) => {
          console.log('is the session active ?');
          return new Promise((resolve, reject) => {
              let isCharging= this.getCapabilityValue('charging');
              resolve(isCharging);
          });
        });
    }

    setupStartGenericCharging() {
        this._startGenericCharging
          .registerRunListener(async (args, state) => {
            console.log('attempt to start charging the car ('+args.car.name+') using card: '+args.card.name);
            return new Promise((resolve, reject) => {
                console.log('store new linked car and card to device');
                this.setStoreValue('card',args.card);
                this.setStoreValue('car',args.car);
                console.log('update device settings');
                this.setSettings({
                    charge_card:args.card.formattedName,
                    connected_car:args.car.formattedName,
                    charge_capacity:args.chargespeed
                });
                console.log('now send the charge command');
                MNM.startSession(this.getData().id,args.card.rfid, this.homey.settings.get('user_email'),this.homey.settings.get('user_password')).then(() => {
                    resolve(true);
                }, (_error) => {
                  resolve(false);
                });
            });
          });
        this._startGenericCharging
          .registerArgumentAutocompleteListener('card', async (query) => {
            return this.myChargeCards();
          });
        this._startGenericCharging
          .registerArgumentAutocompleteListener('car' , async (query) => {
            return this.myCars();
          });
      }

      setupStopGenericCharging() {
        this._stopGenericCharging
          .registerRunListener(async (args, state) => {
            console.log('attempt to stop the active charge session');
            return new Promise((resolve, reject) => {
                MNM.stopSession(this.getData().id, this.homey.settings.get('user_email'),this.homey.settings.get('user_password')).then(() => {
                    resolve(true);
                }, (_error) => {
                  resolve(false);
                });
            });
          });
      }

}


module.exports = Chargepoint