'use strict'

const Homey = require('homey')
const MNM = require('../../lib/50five')
const CP = require('./chargepoint')
const HomeyCrypt = require('../../lib/homeycrypt')

function mobile() {
    return
}

class ChargepointDriver extends Homey.Driver {

    onInit() {
        this.chargepointService = new MNM.ChargePointService(this.getCredentials);

        this._flowTriggerSessionStart = this.homey.flow.getDeviceTriggerCard('sessionstart').registerRunListener(async ( args, state ) => {
			return true;
		  });
        this._flowTriggerChargeCompleted = this.homey.flow.getDeviceTriggerCard('chargecompleted').registerRunListener(async ( args, state ) => {
			return true;
		  });
        this._flowTriggerChargingStarted = this.homey.flow.getDeviceTriggerCard('chargingstarted').registerRunListener(async ( args, state ) => {
			return true;
		  });
        this._flowTriggerSessionStop = this.homey.flow.getDeviceTriggerCard('sessionstop').registerRunListener(async ( args, state ) => {
			return true;
		  });
        this._flowTriggerChanged = this.homey.flow.getDeviceTriggerCard('changed').registerRunListener(async ( args, state ) => {
			return true;
		  });
        this._flowTriggerOccupied = this.homey.flow.getDeviceTriggerCard('occupied').registerRunListener(async ( args, state ) => {
			return true;
		  });
        this._flowTriggerOffline = this.homey.flow.getDeviceTriggerCard('offline').registerRunListener(async ( args, state ) => {
			return true;
		  });
        this._flowTriggerFree = this.homey.flow.getDeviceTriggerCard('free').registerRunListener(async ( args, state ) => {
			return true;
		  });
        //Deprecated triggers
        this._flowTriggerStart = this.homey.flow.getDeviceTriggerCard('start').registerRunListener(async ( args, state ) => {
			return true;
		  });
        this._flowTriggerCompleted = this.homey.flow.getDeviceTriggerCard('charge_completed').registerRunListener(async ( args, state ) => {
			return true;
		  });
        this._flowTriggerStop = this.homey.flow.getDeviceTriggerCard('stop').registerRunListener(async ( args, state ) => {
			return true;
		  });
        this._flowTriggerCharging = this.homey.flow.getDeviceTriggerCard('charging').registerRunListener(async ( args, state ) => {
			return true;
		  });  
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

   async onRepair(session, device) {
        // Argument session is a PairSocket, similar to Driver.onPair
        // Argument device is a Homey.Device that's being repaired
    
        session.setHandler("showView", async (data) => {
            console.log('Login page of repair is showing, send credentials');
            //Send the stored credentials to the 
            var username = this.homey.settings.get('user_email');
            var cryptedpassword = this.homey.settings.get('user_password');            
            var cred_url = this.homey.settings.get('user_url');

            try {
                plainpass = await HomeyCrypt.decrypt(cryptedpassword,username);
                session.emit('loadaccount', {'username': username,'password': plainpass, 'url': cred_url});
            } catch (err) {
                session.emit('loadaccount', {'username': username,'password': '', 'url': cred_url})
            }
        });

        session.setHandler('testlogin', async ( data ) => {
            console.log('Test login and provide feedback, username length: '+data.username.length+' password length: '+data.password.length);
            //Store the provided credentials, but hash and salt it first
            this.homey.settings.set('user_email',data.username);
            HomeyCrypt.crypt(data.password,data.username).then(cryptedpass => {
                //console.log(JSON.stringify(cryptedpass));
                this.homey.settings.set('user_password',cryptedpass);
            }) 
            console.log('password encrypted, credentials stored. Clear existing tokens.');            
            this.homey.settings.set('user_url', data.url);     
            //Now we have the encrypted password stored we can start testing the info
            this.chargepointService.clearAuthCookie();
            console.log('Test new credentials and get a fresh token.');               
            var testresult = await this.chargepointService.getAuthCookie()
            .then(token => {
                if(token==='')
                {
                    console.log('no token recieved, stay here and inform the user');
                    return false;
                }
                else
                {
                    console.log('valid token received, progress to next view');
                    return true;
                }
            })
            .catch(err => {
                console.log(err);
                return false;
            })
            console.log('credential test ok: '+testresult);
            return testresult;
        });
    
      }

   async onPair(session) {
        let mydevices;

        session.setHandler('showView', async (viewId)=>{
            //These actions send data to the custom views
            
            if(viewId === 'login') {
                console.log('Login page of pairing is showing, send credentials');
                //Send the stored credentials to the 
                var username = this.homey.settings.get('user_email');
                var cryptedpassword = this.homey.settings.get('user_password');
                var cred_url = this.homey.settings.get('user_url');

                try {
                    plainpass = await HomeyCrypt.decrypt(cryptedpassword,username);
                    session.emit('loadaccount', {'username': username,'password': plainpass, 'url': cred_url});
                } catch (err) {
                    session.emit('loadaccount', {'username': username,'password': '', 'url': cred_url})
                }
            };
            if(viewId === 'device_settings') {
                console.log('Allow the user to select card');
                this.chargepointService.cards().then(function (cards) {
                    const mycards = cards.map((card) => {
                        return card;
                    });
                    session.emit('loadcards', mycards);
                });
            };
        });

        session.setHandler('testlogin', async ( data ) => {
            console.log('Test login and provide feedback, username length: '+data.username.length+' password length: '+data.password.length);
            //Store the provided credentials, but hash and salt it first
            this.homey.settings.set('user_email',data.username);
            HomeyCrypt.crypt(data.password,data.username).then(cryptedpass => {
                //console.log(JSON.stringify(cryptedpass));
                this.homey.settings.set('user_password',cryptedpass);
            }) 
            console.log('password encrypted, credentials stored. Clear existing tokens.');
            this.homey.settings.set('user_url', data.url);           
            //Now we have the encrypted password stored we can start testing the info
            this.chargepointService.clearAuthCookie();
            console.log('Test new credentials and get a fresh token.');               
            var testresult = await this.chargepointService.getAuthCookie()
            .then(token => {
                if(token==='')
                {
                    console.log('no token recieved, stay here and inform the user');
                    return false;
                }
                else
                {
                    console.log('valid token received, progress to next view');
                    return true;
                }
            })
            .catch(err => {
                console.log(err);
                return false;
            })
            console.log('credential test ok: '+testresult);
            return testresult;
        });


        session.setHandler('discover_chargepoints', async ( data ) => {
            console.log('Now find all our chargepoints from my account');
            session.showView('discover_chargepoints');
            try{
                this.chargepointService.list()
                    .then(function (points) {
                        //A charge point that we could not get details for might be returned as null
                        const devices = points.filter(function(device) {
                            if (device === null) {
                              return false; // skip
                            }
                            return true;
                          }).map((point) => {
                            try{
                                console.log('Located a device response, lets convert it into a cp');
                                var enhancedpoint = CP.enhance(point);
                                console.log('Now setup a basic device for ['+enhancedpoint.name+']');
                                let devicedev = {
                                    name: enhancedpoint.name,
                                    data: { idx: enhancedpoint.idx, serial: enhancedpoint.serial },
                                    store: { cache: enhancedpoint },
                                    mobile: mobile()
                                }
                                try{
                                    console.log('building cp ['+enhancedpoint.name+']');
                                    var device=CP.buildDevice(devicedev, enhancedpoint);
                                    console.log('device built:'+device.name)
                                    return device;
                                }catch(err){
                                    console.log(err);
                                    return err;
                                }
                            }catch(err){
                                console.log(err);
                                return err;
                            }
                        })
                        console.log('back with my devices:'+devices.length);
                        //So we are done here, let the user choose
                        //console.log(JSON.stringify(devices));
                        mydevices=devices;
                        session.showView('list_devices');
                    })
                    .catch((err) => { console.log('Get chargepoints, '+err); session.showView('error');})
                
                .catch((err) => { console.log('Get token, '+err); session.showView('error');})
            }catch(err){
                console.log('Generic error:'+err);
                session.showView('error');
            }
        });

        session.setHandler('list_devices', async (data) => {
            console.log('Provide user list of chargepoints to choose from.');
            return mydevices;
        });
          
        session.setHandler('add_devices', async (data) => {
            session.showView('add_devices');
            if(data.length>0)
                console.log('chargepoint ['+data[0].name+'] added');
            else
                console.log('no chargepoint added');
      	});

 
    }

    triggerSessionStart(device, tokens, state) {
        console.log('Car connected trigger')
        this._flowTriggerSessionStart
            .trigger(device, tokens, state)
            .then(this.log)
            .catch(this.error)
    }

    triggerSessionStop(device, tokens, state) {
        console.log('Car disconnected trigger')
        this._flowTriggerSessionStop
            .trigger(device, tokens, state)
            .then(this.log)
            .catch(this.error)
    }

    triggerChargeCompleted(device, tokens, state) {
        console.log('Completed session trigger')
        this._flowTriggerChargeCompleted
            .trigger(device, tokens, state)
            .then(this.log)
            .catch(this.error)
    }

    triggerChanged(device, tokens, state) {
        console.log('State changed trigger')
        this._flowTriggerChanged
            .trigger(device, tokens, state)
            .then(this.log)
            .catch(this.error)
    }

    triggerOccupied(device) {
        console.log('Charger occupied trigger')
        this._flowTriggerOccupied
            .trigger(device, {}, {})
            .then(this.log)
            .catch(this.error)
    }

    triggerOffline(device) {
        console.log('Charger offline trigger')
        this._flowTriggerOffline
            .trigger(device, {}, {})
            .then(this.log)
            .catch(this.error)
    }

    triggerChargingStarted(device, tokens, state){
        console.log('Start charging trigger')
        this._flowTriggerChargingStarted
            .trigger(device, tokens, state)
            .then(this.log)
            .catch(this.error)
    }

    triggerFree(device) {
        console.log('Charger is free trigger')
        this._flowTriggerFree
            .trigger(device, {}, {})
            .then(this.log)
            .catch(this.error)
    }

    //Deprecated ones
    triggerStart(device, tokens, state) {
        console.log('Car connected trigger')
        this._flowTriggerStart
            .trigger(device, tokens, state)
            .then(this.log)
            .catch(this.error)
    }

    triggerStop(device, tokens, state) {
        console.log('Car disconnected trigger')
        this._flowTriggerStop
            .trigger(device, tokens, state)
            .then(this.log)
            .catch(this.error)
    }

    triggerCompleted(device, tokens, state) {
        console.log('Completed session trigger')
        this._flowTriggerCompleted
            .trigger(device, tokens, state)
            .then(this.log)
            .catch(this.error)
    }

    triggerCharging(device, tokens, state){
        console.log('Start charging trigger')
        this._flowTriggerCharging
            .trigger(device, tokens, state)
            .then(this.log)
            .catch(this.error)
    }


}

module.exports = ChargepointDriver