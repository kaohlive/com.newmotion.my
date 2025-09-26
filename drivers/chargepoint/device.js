'use strict'

const Homey = require('homey')
const FF = require('../../lib/50five')
const CP = require('./chargepoint')

class Chargepoint extends Homey.Device {

    async onInit() {
        this.chargepointService = new FF.ChargePointService(this.getCredentials);

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
        
        if(!this.hasCapability('meter_consumedcurrent'))
            await this.addCapability('meter_consumedcurrent'); 
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

    getCredentials = () => {
        var cred_username = this.homey.settings.get('user_email');
        var cred_secure_password = this.homey.settings.get('user_password');
        var cred_url = this.homey.settings.get('user_url');

        if(!cred_url){
            cred_url = 'https://50five-snl.evc-net.com';
        }
        
        return {
            cred_username,
            cred_secure_password,
            cred_url
        }
    };

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


    // this method is called when the Device has requested a state change (turned on or off)
	async onCapabilityOnoff( value, opts ) {
        this.setIfHasCapability('evcharger_charging', value)
        console.info('turn charging '+value)
        if(value)
        {
            const printedNumber=this.getSetting('card_printedNumber')
            this.log('Start new charging session, using settings card: '+printedNumber.slice(0, -6).replace(/./g, '*') + printedNumber.slice(-6));
            const chargePoint = await this.getStoreValue('50five');
            await this.chargepointService.startSession(chargePoint, chargePoint.channel, this.getSetting('card_printedNumber'))
            this.pause_update_loop(20000)
        }
        else
        {
            this.log('End charging session');
            const chargePoint = await this.getStoreValue('50five');
            await this.chargepointService.stopSession(chargePoint, chargePoint.channel)
            this.pause_update_loop(10000)
        }
    }
    
    delay(t, val) {
        return new Promise(function(resolve) {
            setTimeout(function() {
                resolve(val);
            }, t);
        });
     }

    onAdded() {
        //Lets persist the printedNumber of the selected card during setup into a setting
        const point =this.getData();
        this.setSettings({
            card_printedNumber:point.card.printedNumber
        });
        Console.log('Stored selected card into device settings')
    }

    onDeleted() {
        if (this._timer) {
            clearInterval(this._timer)
        }
    }

    start_update_loop() {
        this._timer = setInterval(() => {
            this.updateDevice();
        }, 120000); //2 minute
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


    extractTransactionData(eventData) {
        const meterStopMatch = eventData.match(/Meter stop:\s*(\d+)\s*Wh/);
        const meterStartMatch = eventData.match(/Meter start:\s*(\d+)\s*Wh/);
        const reasonMatch = eventData.match(/Reason:\s*(\w+)/);
        const acceptedMatch = eventData.match(/Accepted:\s*(\w+)/);

        return {
            meterStopWh: meterStopMatch ? parseInt(meterStopMatch[1], 10) : null,
            meterStartWh: meterStartMatch ? parseInt(meterStartMatch[1], 10) : null,
            reason: reasonMatch ? reasonMatch[1] : null,
            accepted: acceptedMatch ? acceptedMatch[1] : null
        };
    }

    async getLogLinedetailsAndSetMeters(chargePoint) {
        console.info('🔍 Get active session power delivered')
        let lastEvent;
        try {
            console.log('✅ 0.10: Chargepoint power measurement details: ');
            let session_details = await this.chargepointService.SessionLog(chargePoint);
            //console.dir(session_details )
            console.log('✅ 0.11: Chargepoint session details retrieved: last '+session_details.length);
            //We need to analyze the last two lines, if state is ready
            let last_info = session_details.slice(0,2);
            console.dir(last_info )
            //Get the last event reason if available
            if(session_details.length>2)
            {
                lastEvent = this.extractTransactionData(session_details[2].EVENT_DATA);
                //Enrich with addition last info value
                lastEvent.info = last_info[0].EVENT_DATA.match(/Info:\s*(\w+)/);
                console.dir(lastEvent)
                console.log('✅ 0.11: Chargepoint session details retrieved: last '+session_details.length);
            } else {
                console.log('✅ 0.11: We could not find event data');
                lastEvent=null
            }
            if(last_info[0].STATUS=='10000')
            {
                let currentPowerDelivered=Math.max(...last_info.map(item => item.TRANS_ENERGY_DELIVERED_KWH || 0));
                //let currentPowerDelivered=last_info.TRANS_ENERGY_DELIVERED_KWH;
                if(currentPowerDelivered===null)
                    currentPowerDelivered=0;
                if(this.hasCapability('meter_consumedcurrent')) {
                    const preValue = await this.getCapabilityValue('meter_consumedcurrent');
                    //We only update it if it increased
                    if(preValue<currentPowerDelivered)
                        await this.setCapabilityValue('meter_consumedcurrent', currentPowerDelivered);
                }
                
                //Now add the delta of the current session to the status at the start of the session
                if(this.hasCapability('meter_power')) {
                    const startMeterValue = await this.getStoreValue('meter_power_cache');
                    if(startMeterValue!==null)
                    {
                        await this.setCapabilityValue('meter_power', (startMeterValue+currentPowerDelivered));
                        console.log('✅ 0.12: Updated power meter to, was on start ['+startMeterValue+'] '+(startMeterValue+currentPowerDelivered));
                    }
                    else
                    {
                        const meterPower = await this.getCapabilityValue('meter_power');
                        if(meterPower!==null){ 
                            await this.setStoreValue('meter_power_cache',meterPower);
                            console.log('✅ 0.12: Reset power meter cache to '+(meterPower));
                        } else {
                            await this.setCapabilityValue('meter_power', 0);
                            await this.setStoreValue('meter_power_cache',0);
                            console.log('✅ 0.12: Reset power meter cache to base 0');
                        }
                    }
                }
                if(this.hasCapability('measure_power')) {
                    let MeterValue_kW = Math.max(...last_info.map(item => item.MOM_POWER_KW || 0))
                    if(MeterValue_kW==null || MeterValue_kW ==0)
                    {
                        //In this case we estimate
                        const intervalMeterValue = await this.getStoreValue('meter_power_interval_cache');
                        let deltaDeliverd = currentPowerDelivered - intervalMeterValue;
                        if(deltaDeliverd==0)
                        {
                            console.log('✅ 0.13: No power deliverd, set usage to 0 ');
                            await this.setCapabilityValue('measure_power', 0);
                        } else {
                            if(deltaDeliverd>0){
                                let average_kW = deltaDeliverd / (2 / 60);
                                await this.setCapabilityValue('measure_power', (average_kW*1000));
                                //During charing we cant go backwards in our delivered power, so then its just a pauze state or other reading error
                                if(currentPowerDelivered>intervalMeterValue && currentPowerDelivered>=0)
                                    await this.setStoreValue('meter_power_interval_cache',currentPowerDelivered);
                                console.log('✅ 0.13: Updated power usage to '+(average_kW*1000)+' delta:'+deltaDeliverd+' based on prev:'+intervalMeterValue+' new:'+currentPowerDelivered);
                            } else {
                                console.log('✅ 0.13: Delta delivered was negative, cant really happen so skip this moment');
                            }
                        }
                    } else {
                        await this.setCapabilityValue('measure_power', (MeterValue_kW*1000));
                        await this.setStoreValue('meter_power_interval_cache',currentPowerDelivered);
                        console.log('✅ 0.13: Updated power usage to '+(MeterValue_kW*1000)+' collected from API');
                    }
                }                    
            } else {
                //Store the capability value of the meter_power in the cache so we can use it
                console.log('✅ 0.12: No active charging state '+(last_info[0].STATUS));
                //await this.setStoreValue('meter_power_interval_cache',0);
                await this.setStoreValue('meter_power_cache',await this.getCapabilityValue('meter_power'));
                if(this.hasCapability('measure_power')) {
                     await this.setCapabilityValue('measure_power', 0);
                }

            }
        } catch (err) {
            console.log('❌ 0.11: error getting power measurements: '+err.message);
            return null;
        }
        return lastEvent;
    }

    async updateDevice() {
        console.log('🔍 0.0: Lets update our charegepoint status');
        const settings = this.getSettings()
        let fresh_token = await this.chargepointService.getAuthCookie()
        if(fresh_token=='')
        {
            console.log('❌ 0.0: could not update device state due to no fresh token available');
            return;
        }
        const point =this.getData();
        console.log('🔍 0.1: Attempt to get status of chargepoint device ['+point.name+'] with serial '+point.serial);
        const id = point.id
        const serial = point.serial
        //Data contains the updated device status once our check is done
        let data = null;
        let chargePoint = null;
        try {
            console.log('✅ 0.2: Chargepoint details: ');
            let deviceVersion = await this.getStoreValue('deviceVersion');
            if(deviceVersion==='v2'){
                console.log('✅ 0.2.1: Chargepoint was 50five upgraded');
                chargePoint = await this.getStoreValue('50five');
            } else {
                console.log('✅ 0.2.1: Chargepoint needs 50five upgrade, lets locate its base: ');
                const point_base = await this.chargepointService.getSinglePointBySerial(serial);
                console.dir(point_base, { depth: null });
                if(point_base==null) {
                    console.log('⚠️ 0.2.1: No chargepoint data could be located in your account');
                    return;
                }
                this.setStoreValue('50five',point_base);
                this.setStoreValue('deviceVersion','v2');
                console.log('✅ 0.2.2: Chargepoint is upgraded ');
                chargePoint=point_base;
            }
            console.log('🔍 0.3: Attempt to get status of chargepoint device '+chargePoint.idx);
            await this.chargepointService.requestUpdate(chargePoint);
            let point_details = await this.chargepointService.pointDetails(chargePoint);
            if(point_details) {
                //Lets perform our pre-analysis on the status to fill our attributes
                data = CP.enhance(point_details);
                console.dir(data, { depth: null });
                this.setAvailable();
            }
            //We dont mark it available till we got the status at least once
        } catch (err) {
            console.log('❌ 0.2: error enhancing the api into our data model: '+err.message);
            this.setUnavailable(err.message);
            return;
        }
        let eventData = this.getLogLinedetailsAndSetMeters(chargePoint);
        console.log('✅ 0.3: Located chargepoints');
        console.debug('🔍 0.4: get previous status from cache');
        const prev = this.getStoreValue('cache')
        if (data!=null)
            await this.setStoreValue('cache', data)
        else
        {
            console.log('⚠️ 0.5: There is no new data, no need to trigger events ');
            return;                        
        }
        if(prev== null)
        {
            console.log('⚠️ 0.5: There is no cached data, no option to trigger events ');
            return; 
        }
        console.log('✅ 0.5: replace cache with new status, and alter device capabilities');
        if (prev.e.free !== null) {
            console.debug('free prev: '+prev.e.free+' new: '+data.e.free)
            console.debug('total prev: '+prev.e.total +' new: '+data.e.total)
            console.debug('charging prev: '+prev.e.charging +' new: '+data.e.charging)
            console.debug('active session prev:'+prev.e.activeSession +' new: '+data.e.activeSession)
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
            if(prev.e.activeSession&&!data.e.activeSession)
            {
                //When the charging session stops we can reset the current session awareness
                this.setStoreValue('meter_power_interval_cache',0);
                if(this.hasCapability('meter_consumedcurrent')) {
                    this.setCapabilityValue('meter_consumedcurrent', 0);
                }  
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
                    }, {} );
                });
            }
        } else {
            console.debug('no cached data available, so no events can be generated')
        }

        if (this.hasCapability('alarm_online')) {
            let oldOnlineState = await this.getCapabilityValue('alarm_online');
            this.setIfHasCapability('alarm_online',!data.e.latestOnlineStatus)
            if(!oldOnlineState && !data.e.latestOnlineStatus)
            {
                console.log('Trigger went offline event, charger is offline.');
                this.driver.triggerOffline( this, {}, {} );
            }
        }
        //console.log(JSON.stringify(data.e))
        this.setIfHasCapability('onoff',data.e.activeSession)
        this.setIfHasCapability('occupied', (data.e.free == 0))
        this.setIfHasCapability('charging', (data.e.charging > 0))
        this.setIfHasCapability('evcharger_charging', data.e.activeSession)
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
            else if (data.e.preparingEvses > 0)
                this.setIfHasCapability('evcharger_charging_state', 'plugged_in')
            else if (data.e.suspended > 0)
                this.setIfHasCapability('evcharger_charging_state', 'plugged_in_paused')
        } else {
            this.setIfHasCapability('active_card', null)
            this.setIfHasCapability('evcharger_charging_state', 'plugged_out')
        }
        console.info('✅ device capabilities updated')
        console.info('now retrieve the current months charge sessions')
        var date = new Date();
        date.setHours(23, 59, 59, 0); //End Of day
        //Get from the first of this month till now
        await this.chargepointService.TransactionHistory(new Date(date.getFullYear(), date.getMonth(), 1), date).then(sessions => {
            if(sessions.length>0)
            {
                //console.log('Update device loaded this month sessions:'+JSON.stringify(sessions));
                var sum = sessions.reduce((accumulator, currentsession) => {
                    //Ensure we use . comma separator for lcoales that use ,
                    const value = currentsession["6"].replace(',', '.');
                    return accumulator + Number(value)
                }, 0);
                
                
                // Step 2: Extract href using regex
                const match = sessions[0]["0"].match(/href\s*=\s*"([^"]+)"/);

                if (match && match[1]) 
                    console.log('Extracted hyperlink:', match[1]);
                else
                    console.log('Could not find session id:', sessions[0]["0"]);

                let lastsessionid = match[1];
                let previouslastsessionid = this.getStoreValue('lastsessionid');
                if(previouslastsessionid!=lastsessionid)
                {
                    this.setStoreValue('lastsessionid',lastsessionid);
                }
                console.log('Lastsession ['+lastsessionid+'] was '+sessions[0]["6"].replace(',', '.')+' kWh, This months session total is '+sum+' kWh')
                this.setIfHasCapability('meter_consumedlast', Number(sessions[0]["6"].replace(',', '.')));
                
                // Step 2: Extract text after </i>
                const cardmatch = sessions[0]["5"].match(/<\/i>\s*(.+)$/);

                if (cardmatch && cardmatch[1]) {
                    console.log('Extracted card value:', cardmatch[1].trim().slice(0, -6).replace(/./g, '*') + cardmatch[1].trim().slice(-6));
                } else {
                    console.log('No match found.');
                }

                this.setIfHasCapability('last_session_card', cardmatch[1].trim());
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
            this.chargepointService.cards().then(function (cards) {
                const mycards = cards.map((card) => {
                    card.formattedName = card.name +' ('+card.printedNumber.slice(0, -6).replace(/./g, '*') + card.printedNumber.slice(-6);+')';
                    card.printedNumber = card.printedNumber;
                    return card;
                });
                return resolve(mycards);
            });
        });
    }

    //Deprecated
    setupConditionActiveChargeForCardCar(){
        this._conditionActiveChargeForCardCar
        .registerRunListener(async (args, state) => {
          //console.log('is the session active for ('+args.car.name+') using card: '+args.card.name);
          console.log('is the session active for card: '+args.card.name);
          return new Promise((resolve, reject) => {
              let isCharging= this.getCapabilityValue('charging');
              resolve(isCharging && this.getCapabilityValue('active_card')==args.card.printedNumber);
          });
        });
      this._conditionActiveChargeForCardCar
        .registerArgumentAutocompleteListener('card', async (query) => {
          return this.myChargeCards();
        });
      this._conditionActiveChargeForCardCar
        .registerArgumentAutocompleteListener('car' , async (query) => {
          return null;
        });
    }
    
    setupConditionActiveChargeForCard(){
        this._conditionActiveChargeForCard
        .registerRunListener(async (args, state) => {
          console.log('is the session active for the card: '+args.card.name);
          return new Promise((resolve, reject) => {
              let isCharging= this.getCapabilityValue('charging');
              resolve(isCharging && this.getCapabilityValue('active_card')==args.card.printedNumber);
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

    //Deprecated
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
                console.log('now send the charge command');
                const chargePoint = this.getStoreValue('50five');
                this.chargepointService.startSession(chargePoint, chargePoint.channel, args.card.printedNumber).then(() => {
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
            console.log('attempt to start charging using card: '+args.card.name);
            return new Promise((resolve, reject) => {
                console.log('now send the charge command');
                const chargePoint = this.getStoreValue('50five');
                this.chargepointService.startSession(chargePoint, chargePoint.channel, args.card.printedNumber).then(() => {
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
                const chargePoint = this.getStoreValue('50five');
                this.chargepointService.stopSession(chargePoint, chargePoint.channel).then(() => {
                    resolve(true);
                }, (_error) => {
                  resolve(false);
                });
                this.pause_update_loop(10000)
            });
          });
      }

}


module.exports = Chargepoint