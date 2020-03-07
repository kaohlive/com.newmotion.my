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
        this._flowTriggerStart = new Homey.FlowCardTriggerDevice('start').registerRunListener(( args, state ) => {
			return Promise.resolve( true );
		  }).register()
        this._flowTriggerCompleted = new Homey.FlowCardTriggerDevice('completed').registerRunListener(( args, state ) => {
			return Promise.resolve( true );
		  }).register()
        this._flowTriggerCharging = new Homey.FlowCardTriggerDevice('charging').registerRunListener(( args, state ) => {
			return Promise.resolve( true );
		  }).register()
        this._flowTriggerStop = new Homey.FlowCardTriggerDevice('stop').registerRunListener(( args, state ) => {
			return Promise.resolve( true );
		  }).register()
        this._flowTriggerChanged = new Homey.FlowCardTriggerDevice('changed').registerRunListener(( args, state ) => {
			return Promise.resolve( true );
		  }).register()
        this._flowTriggerOccupied = new Homey.FlowCardTriggerDevice('occupied').registerRunListener(( args, state ) => {
			return Promise.resolve( true );
		  }).register()
        this._flowTriggerFree = new Homey.FlowCardTriggerDevice('free').registerRunListener(( args, state ) => {
			return Promise.resolve( true );
		  }).register()
    }

    onPair( socket ) {
        let mydevices;

        socket.on('showView', (viewId, callback)=>{
            //These actions send data to the custom views
            callback();
            if(viewId === 'login') {
                console.log('Login page of pairing is showing, send credentials');
                //Send the stored credentials to the 
                var username = ManagerSettings.get('user_email');
                var cryptedpassword = ManagerSettings.get('user_password');
                require('../../lib/homeycrypt').decrypt(cryptedpassword,username).then(plainpass =>{
                    socket.emit('loadaccount', {'username': username,'password': plainpass});
                })
            };
            if(viewId === 'device_settings') {
                console.log('Allow the user to select card and car');
                MNM.getAuthCookie().then(token => {
                    MNM.cards(token).then(function (cards) {
                        const mycards = cards.map((card) => {
                            return card;
                        });
                        socket.emit('loadcards', mycards);
                    });
                    MNM.cars(token).then(function (cars) {
                        const mycars = cars.map((car) => {
                            return car;
                        });
                        socket.emit('loadcars', mycars);
                    });
                });
            };
        });

        socket.on('testlogin', ( data, callback ) => {
            console.log('Test login and provide feedback');
            //Store the provided credentials, but hash and salt it first
            ManagerSettings.set('user_email',data.username);
            require('../../lib/homeycrypt').crypt(data.password,data.username).then(cryptedpass => {
                //console.log(JSON.stringify(cryptedpass));
                ManagerSettings.set('user_password',cryptedpass);
                //Now we have the encrypted password stored we can start testing the info
                MNM.getAuthCookie()
                .then(token => {
                    if(token==='')
                    {
                        console.log('no token recieved, stay here and inform the user');
                        callback( 'Login failed, no token received', false);
                    }
                    else
                    {
                        console.log('valid token received, progress to next view');
                        callback( null, true);
                    }
                })
                .catch(err => {
                    callback(err);
                });
            })

            
        });


        socket.on('discover_chargepoints', ( data, callback ) => {
            console.log('Now find all our chargepoints from my account');
            socket.showView('discover_chargepoints');
            try{
            MNM.getAuthCookie()
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
                                    console.log('device build:'+device.name)
                                    return device;
                                }catch(err){
                                    console.log(err);
                                    callback(err, null);
                                }
                            }catch(err){
                                console.log(err);
                                callback(err, null);
                            }

                        })
                        console.log('back with my devices:'+devices.length);
                        //So we are done here, let the user choose
                        //console.log(JSON.stringify(devices));
                        mydevices=devices;
                        socket.showView('list_devices');
                    })
                    .catch((err) => { console.log('Get chargepoints, '+err); socket.showView('error');})
                })
                .catch((err) => { console.log('Get token, '+err); socket.showView('error');})
            }catch(err){
                console.log('Generic error:'+err);
                socket.showView('error');
            }
        });

        socket.on('list_devices', ( data, callback ) => {
            console.log('Provide user list of chargepoints to choose from.');
            callback(null, mydevices);
        });
          
        socket.on('add_devices', ( data, callback ) => {
            socket.showView('add_devices');
            if(data.length>0)
                console.log('chargepoint ['+data[0].name+'] added');
            else
                console.log('no chargepoint added');
      	});

 
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

    triggerCompleted(device) {
        this._flowTriggerCompleted
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

    triggerOccupied(device) {
        this._flowTriggerOccupied
            .trigger(device, {}, {})
            .then(this.log)
            .catch(this.error)
    }
    triggerCharging(device){
        this._flowTriggerCharging
            .trigger(device, {}, {})
            .then(this.log)
            .catch(this.error)
    }

    triggerFree(device) {
        this._flowTriggerFree
            .trigger(device, {}, {})
            .then(this.log)
            .catch(this.error)
    }

}

module.exports = ChargepointDriver