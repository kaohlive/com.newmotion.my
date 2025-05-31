'use strict'

const Homey = require('homey')
const MNM = require('../../lib/mnm')
const CP = require('./chargepoint')

class Chargepoint extends Homey.Device {

    async onInit() {
        await this.setupDeviceSettings();
        // register a capability listener
        //this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));

        this.updateDevice();
        this.start_update_loop();
        this.setAvailable();
        //register flow cards
        this._startGenericChargingCard = this.homey.flow.getActionCard('start_charge_generic_card');
        this.setupStartGenericChargingCard();        
        this._stopGenericCharging = this.homey.flow.getActionCard('stop_charge_generic');
        this.setupStopGenericCharging();   
        this._conditionActiveCharge = this.homey.flow.getConditionCard('charging_state');
        this.setupConditionActiveCharge();   
        this._conditionActiveChargeForCard = this.homey.flow.getConditionCard('charging_state_card');
        this.setupConditionActiveChargeForCard();   
        this._conditionActiveChargeForCardCar = this.homey.flow.getConditionCard('charging_state_generic');
        this.setupConditionActiveChargeForCardCar();
        this._UpdateChargeSpeedCard = this.homey.flow.getActionCard('update_charge_speed');
        this.setupUpdateChargespeed();
        //Deprecated
        this._startGenericCharging = this.homey.flow.getActionCard('start_charge_generic');
        this.setupStartGenericCharging(); 
        //This version introduces the active card capability so add it to existing devices
        if(this.hasCapability('onoff'))
            await this.removeCapability('onoff');
        if(!this.hasCapability('active_card'))
            await this.addCapability('active_card'); 
        //New capabilities to add
        if(!this.hasCapability('last_session_card'))
            await this.addCapability('last_session_card');  
        if(!this.hasCapability('meter_consumedlast'))
            await this.addCapability('meter_consumedlast');  
        if(!this.hasCapability('meter_consumedmonth'))
            await this.addCapability('meter_consumedmonth');
        if(!this.hasCapability('evcharger_charging_state'))
            await this.addCapability('evcharger_charging_state');
        if(!this.hasCapability('evcharger_charging'))
            await this.addCapability('evcharger_charging');
        else
            this.registerCapabilityListener('evcharger_charging', this.onCapabilityOnoff.bind(this));
        if(this.getSetting('include_power')){
            this.log('Power is included, check capabilities');
            if(!this.hasCapability('measure_power'))
                await this.addCapability('measure_power'); 
            if(!this.hasCapability('meter_power'))
                await this.addCapability('meter_power'); 
        } else {
            this.log('Power is excluded, check capabilities');
            if(this.hasCapability('measure_power'))
                await this.removeCapability('measure_power');
            if(this.hasCapability('meter_power'))
                await this.removeCapability('meter_power');
        }
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        if(changedKeys.find(function(str) { return str == 'include_power'}))
            if(newSettings['include_power']) {
                if(!this.hasCapability('measure_power'))
                    await this.addCapability('measure_power');
                if(!this.hasCapability('meter_power'))
                    await this.addCapability('meter_power'); 
            } else {
                if(this.hasCapability('measure_power'))
                    await this.removeCapability('measure_power');
                if(this.hasCapability('meter_power'))
                    await this.removeCapability('meter_power');
            }
      }

    setupDeviceSettings()
    {
        let storedCard = this.getStoreValue('card');
        console.log('known card: '+JSON.stringify(storedCard))
        if(storedCard == null)
        {
            console.log('The store did not hold a card yet, grab it from device data');
            this.setStoreValue('card',this.getData().deviceSettings.card);
            //this.setStoreValue('car',this.getData().deviceSettings.car);
            storedCard = this.getStoreValue('card');
            console.log('now known card: '+JSON.stringify(storedCard))
        }
        this.setSettings({
            charge_card:this.getStoreValue('card').formattedName
            //,
            //connected_car:this.getStoreValue('car').formattedName
        });
    }


    // this method is called when the Device has requested a state change (turned on or off)
	async onCapabilityOnoff( value, opts ) {
        this.setIfHasCapability('evcharger_charging', value)
        console.info('turn charging '+value)
        if(value)
        {
            this.log('Start new charging session');
            await MNM.startSession(this.getData().id,this.getStoreValue('card').rfid, this.homey.settings.get('user_email'),this.homey.settings.get('user_password'))
            this.pause_update_loop(10000)
        }
        else
        {
            this.log('End charging session');
            await MNM.stopSession(this.getData().id, this.homey.settings.get('user_email'),this.homey.settings.get('user_password'))
            this.pause_update_loop(4000)
        }
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
        }, 60000); //1 minute
    }

    
    pause_update_loop(delay) {
        //Clear the timer to ensure we dont hit one to soon
        if (this._timer) {
            this.log('pausing update interval for '+delay)
            clearInterval(this._timer);
            this._timer = null;
        }
        setTimeout(() => {
            this.updateDevice()
            this.start_update_loop()
        }, delay); // custom delay
    }


    async updateDevice() {
        const settings = this.getSettings()
        const id = this.getData().id
        const serial = this.getData().serial
        let fresh_token = await MNM.getAuthCookie(this.homey.settings.get('user_email'),this.homey.settings.get('user_password'))
        if(fresh_token=='')
        {
            console.log('could not update device state due to no fresh token available');
            return;
        }
        let data = null;
        try {
            data = CP.enhance(await MNM(id, fresh_token));
            this.setAvailable();
        } catch (err) {
            if(err=='Forbidden')
            {
                this.setUnavailable(err);
                return;
            }
        }

        //console.log(JSON.stringify(data));
        console.debug('get previous status from cache');
        const prev = this.getStoreValue('cache')
        console.debug('replace cache');
        await this.setStoreValue('cache', data)
        if(prev== null)
            return;
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
                    this.driver.triggerSessionStart( this, {
                        cardname:data.e.cardname ?? ''
                    }, {} );
                    //Deprecated
                    this.driver.triggerStart( this, {
                        cardname:data.e.cardname ?? '',
                        carname: 'deprecated'
                        //,
                        //carname:this.getStoreValue('car').name
                    }, {} );
                });
            } else if (prev.e.free<prev.e.total && data.e.total == data.e.free) {
                this.driver.ready().then(() => {
                    console.log('Trigger stop event, all connectors are now free.');
                    //Grab the used carge card from our prev object, the current non chargting state has no longer an card object
                    this.driver.triggerSessionStop( this, {
                        cardname:prev.e.cardname ?? ''
                    }, {} );
                    //Deprecated
                    this.driver.triggerStop( this, {
                        cardname:prev.e.cardname ?? '',
                        carname: 'deprecated'
                        //,
                        //carname:this.getStoreValue('car').name
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
                    //Grab the used carge card from our prev object, the current non chargting state has no longer an card object
                    this.driver.triggerChargeCompleted( this, {
                        cardname:prev.e.cardname ?? ''
                    }, {} );
                    //Deprecated
                    this.driver.triggerCompleted( this, {
                        cardname:prev.e.cardname ?? '',
                        carname: 'deprecated'
                        //carname:this.getStoreValue('car').name
                    }, {} );
                });
            }
            //A connector has started charging
            if(prev.e.charging < data.e.charging) {
                this.driver.ready().then(() => {
                    console.log('Trigger charging started event, a connector is now charging.');
                    this.driver.triggerChargingStarted( this, {
                        cardname:data.e.cardname ?? ''
                    }, {} );
                    //Deprecated
                    this.driver.triggerCharging( this, {
                        cardname:data.e.cardname ?? '',
                        carname: 'deprecated'
                        //carname:this.getStoreValue('car').name
                    }, {} );
                });
            }
        } else {
            console.debug('no cached data available, so no events can be generated')
        }

        if (this.hasCapability('alarm_online')) {
            let oldOnlineState = await this.getCapabilityValue('alarm_online');
            this.setIfHasCapability('alarm_online',!data.latestOnlineStatus.online)
            if(!oldOnlineState && !data.latestOnlineStatus.online)
            {
                console.log('Trigger went offline event, charger is offline.');
                this.driver.triggerOffline( this, {}, {} );
            }
        }
        //console.log(JSON.stringify(data.e))
        this.setIfHasCapability('onoff', (data.e.free == 0))
        this.setIfHasCapability('occupied', (data.e.free == 0))
        this.setIfHasCapability('charging', (data.e.charging > 0))
        this.setIfHasCapability('evcharger_charging', (data.e.charging > 0))
        this.setIfHasCapability('connectors.total', data.e.total)
        this.setIfHasCapability('connectors.free', data.e.free)
        if(data.e.availablepower>0)
            this.setIfHasCapability('power.max', (data.e.availablepower/1000))
        else
            this.setIfHasCapability('power.max', 0)
        //If our port is occupied we want to use the cardname
        if (data.e.free == 0)
        {
            this.setIfHasCapability('active_card', data.e.cardname)
            if(data.e.charging > 0)
                this.setIfHasCapability('evcharger_charging_state', 'plugged_in_charging')
            else if (data.e.preparing > 0)
                this.setIfHasCapability('evcharger_charging_state', 'plugged_in')
            else
                this.setIfHasCapability('evcharger_charging_state', 'plugged_in_paused')
        } else {
            this.setIfHasCapability('active_card', null)
            this.setIfHasCapability('evcharger_charging_state', 'plugged_out')
        }
        if(settings.charge_capacity>0 && data.e.charging > 0) {
            // this.setIfHasCapability('measure_power.current', (this.getSettings().charge_capacity*1000))
            this.setIfHasCapability('measure_power', (this.getSettings().charge_capacity*1000))
        } else {
            // this.setIfHasCapability('measure_power.current', 1)
            this.setIfHasCapability('measure_power', 1)
        }

        console.info('device updated')

        console.info('now retrieve the current months charge sessions')
        var date = new Date();
        date.setHours(23, 59, 59, 0); //End Of day
        //Get from the first of this month till now
        await MNM.getChargeSessions(fresh_token,id, new Date(date.getFullYear(), date.getMonth(), 1), date).then(sessions => {
            if(sessions.length>0)
            {
                //console.log('Update device loaded this month sessions:'+JSON.stringify(sessions));
                var sum = sessions.reduce((accumulator, currentsession) => accumulator + currentsession.volume, 0);
                //console.log(JSON.stringify(sessions[0]));
                let lastsessionid = sessions[0].id;
                let previouslastsessionid = this.getStoreValue('lastsessionid');
                if(previouslastsessionid!=lastsessionid)
                {
                    this.setStoreValue('lastsessionid',lastsessionid);
                    if(this.hasCapability('meter_power')) {
                        this.setCapabilityValue('meter_power', (this.getCapabilityValue('meter_power')+sessions[0].volume));
                    }
                }
                console.log('Lastsession ['+sessions[0].id+'] was '+sessions[0].volume+' kWh, This months session total is '+sum+' kWh')
                this.setIfHasCapability('meter_consumedlast', sessions[0].volume);
                this.setIfHasCapability('last_session_card', sessions[0].cardname);
                this.setIfHasCapability('meter_consumedmonth', sum);
            } else {
                this.setIfHasCapability('meter_consumedlast', 0);
                this.setIfHasCapability('last_session_card', null);
                this.setIfHasCapability('meter_consumedmonth', 0);
            }
        });
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

    setupConditionActiveChargeForCardCar(){
        this._conditionActiveChargeForCardCar
        .registerRunListener(async (args, state) => {
          //console.log('is the session active for ('+args.car.name+') using card: '+args.card.name);
          console.log('is the session active for card: '+args.card.name);
          return new Promise((resolve, reject) => {
              let isCharging= this.getCapabilityValue('charging');
              //resolve(isCharging && this.getStoreValue('card').rfid==args.card.rfid && this.getStoreValue('car').name==args.car.name);
              resolve(isCharging && this.getStoreValue('card').rfid==args.card.rfid);
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

    setupUpdateChargespeed() {
        this._UpdateChargeSpeedCard
          .registerRunListener(async (args, state) => {
            console.log('update the charge speed: '+args.chargespeed);
            return new Promise((resolve, reject) => {
                //console.log('store new card to device');
                console.log('update device settings');
                this.setSettings({
                    charge_capacity:args.chargespeed
                });
                resolve(true);
            });
          });
      }

    setupStartGenericChargingCard() {
        this._startGenericChargingCard
          .registerRunListener(async (args, state) => {
            console.log('attempt to start charging using card: '+args.card.name);
            return new Promise((resolve, reject) => {
                //console.log('store new card to device');
                console.log('store new linked card to device');
                this.setStoreValue('card',args.card);
                console.log('update device settings');
                this.setSettings({
                    charge_card:args.card.formattedName,
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
        this._startGenericChargingCard
          .registerArgumentAutocompleteListener('card', async (query) => {
            return this.myChargeCards();
          });
      }

//Deprecated
    setupStartGenericCharging() {
        this._startGenericCharging
          .registerRunListener(async (args, state) => {
            //console.log('attempt to start charging the car ('+args.car.name+') using card: '+args.card.name);
            console.log('attempt to start charging using card: '+args.card.name);
            return new Promise((resolve, reject) => {
                //console.log('store new linked car and card to device');
                console.log('store new linked card to device');
                this.setStoreValue('card',args.card);
                //this.setStoreValue('car',args.car);
                console.log('update device settings');
                this.setSettings({
                    charge_card:args.card.formattedName,
                   // connected_car:args.car.formattedName,
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