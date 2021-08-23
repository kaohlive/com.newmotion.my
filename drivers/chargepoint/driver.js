'use strict'

const Homey = require('homey')
const MNM = require('../../lib/mnm')
const CP = require('./chargepoint')

function mobile() {
    return
}

class ChargepointDriver extends Homey.Driver {

    onInit() {
        this._flowTriggerStart = this.homey.flow.getDeviceTriggerCard('start').registerRunListener(async ( args, state ) => {
			return true;
		  });
        this._flowTriggerCompleted = this.homey.flow.getDeviceTriggerCard('charge_completed').registerRunListener(async ( args, state ) => {
			return true;
		  });
        this._flowTriggerCharging = this.homey.flow.getDeviceTriggerCard('charging').registerRunListener(async ( args, state ) => {
			return true;
		  });
        this._flowTriggerStop = this.homey.flow.getDeviceTriggerCard('stop').registerRunListener(async ( args, state ) => {
			return true;
		  });
        this._flowTriggerChanged = this.homey.flow.getDeviceTriggerCard('changed').registerRunListener(async ( args, state ) => {
			return true;
		  });
        this._flowTriggerOccupied = this.homey.flow.getDeviceTriggerCard('occupied').registerRunListener(async ( args, state ) => {
			return true;
		  });
        this._flowTriggerFree = this.homey.flow.getDeviceTriggerCard('free').registerRunListener(async ( args, state ) => {
			return true;
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
                require('../../lib/homeycrypt').decrypt(cryptedpassword,username).then(plainpass =>{
                    session.emit('loadaccount', {'username': username,'password': plainpass});
                })
            };
            if(viewId === 'device_settings') {
                console.log('Allow the user to select card and car');
                MNM.getAuthCookie(this.homey.settings.get('user_email'),this.homey.settings.get('user_password')).then(token => {
                    MNM.cards(token).then(function (cards) {
                        const mycards = cards.map((card) => {
                            return card;
                        });
                        session.emit('loadcards', mycards);
                    });
                    MNM.cars(token).then(function (cars) {
                        const mycars = cars.map((car) => {
                            return car;
                        });
                        session.emit('loadcars', mycars);
                    });
                });
            };
        });

        session.setHandler('testlogin', async ( data ) => {
            console.log('Test login and provide feedback, username length: '+data.username.length+' password length: '+data.password.length);
            //Store the provided credentials, but hash and salt it first
            this.homey.settings.set('user_email',data.username);
            require('../../lib/homeycrypt').crypt(data.password,data.username).then(cryptedpass => {
                //console.log(JSON.stringify(cryptedpass));
                this.homey.settings.set('user_password',cryptedpass);
            }) 
            console.log('password encrypted, credentials stored. Clear existing tokens.');               
            //Now we have the encrypted password stored we can start testing the info
            MNM.clearAuthCookie();
            console.log('Test new credentials and get a fresh token.');               
            var testresult = await MNM.getAuthCookie(this.homey.settings.get('user_email'),this.homey.settings.get('user_password'))
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
            MNM.getAuthCookie(this.homey.settings.get('user_email'),this.homey.settings.get('user_password'))
              .then(token => {
                MNM.list(token)
                    .then(function (points) {
                        const devices = points.map((point) => {
                            try{
                                console.log('Located a device response, lets convert it into a cp');
                                var enhancedpoint = CP.enhance(point);
                                console.log('Now setup a basic device for ['+enhancedpoint.name+']');
                                let devicedev = {
                                    name: enhancedpoint.name,
                                    data: { name: enhancedpoint.name, id: enhancedpoint.id, serial: enhancedpoint.serial },
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
                })
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
    triggerCharging(device, tokens, state){
        console.log('Start charging trigger')
        this._flowTriggerCharging
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

}

module.exports = ChargepointDriver