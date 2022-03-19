'use strict'
var htmlparser2 = require("htmlparser2")
//var formdata = require('form-data')
const http = require('http.min')
const cookie = require("cookie");
//const HS = require('./haversine')
//const { ManagerSettings } = require('homey');

//We store the active token in mem, it gets stale quick anyway
let auth_token = {
    api_cookie: '',
    set_date: new Date()
}

async function startSession(id, rfid, cred_username, cred_secure_password)
{
    return SessionAction(id,'start', rfid, cred_username, cred_secure_password)
}
async function stopSession(id, cred_username, cred_secure_password)
{
    return SessionAction(id,'stop', '', cred_username, cred_secure_password)
}
async function SessionAction(id, action, rfid, cred_username, cred_secure_password)
{
    var body = {
        "rfid": '' + rfid + '',
        "evseNo": 0
    }
    var options = {
        protocol: 'https:',
        host: 'ui-chargepoints.newmotion.com',
        path: '/api/facade/v1/charge-points/' + id + '/remote-control/' + action,
        headers: {
          'content-type': 'application/json',
          'Cookie': 'language.code.selection=en; tnm_api=\"' + (await getAuthCookie(cred_username, cred_secure_password)) + '\"',
          'accept': 'text/html'
        }
    }
    console.info(action+' charge session')
    let response = (await http.post(options, body))
    return response.data
}

function clearAuthCookie()
{
    auth_token.api_cookie='';
}

async function getAuthCookie(cred_username, cred_secure_password)
{
    //24 hours ago
    let yesterday = new Date()
    yesterday.setHours(yesterday.getHours() - 24)
    //console.log('token was generated on '+auth_token.set_date+' lets see if it is stale by comparing with '+yesterday)
    if(auth_token.api_cookie!='' && auth_token.set_date > yesterday)
    {
        console.info('token is still valid')
        return auth_token.api_cookie
    }
    else{
        console.info('stale or invalid token, retrieve new one')
    }
    //Else refresh the cookie first
    let userEmail = cred_username
    let userPwd = await require('../../lib/homeycrypt').decrypt(cred_secure_password,userEmail);
    console.log('credentials retrieved from settings and decrypted')
    var options = {
        protocol: 'https:',
        host: 'account.shellrecharge.com',
        path: '/'
      }
    //Get the new motion html body to get a serverside ajax control setup
    let formmesssage = (await http.get(options))
    let data = formmesssage.data
    //Lets store the session cookie
    let formresponse = formmesssage.response
    let setcookies = cookie.parse(formresponse.headers['set-cookie'][0])
    console.debug('first cookies received: '+JSON.stringify(setcookies))
    var sessioncookie = setcookies.JSESSIONID

    //Get the elements we need for the authentication post
    var endpointid = ''
    var loginElement = ''
    var pwdElement = ''
    var boolElement = ''
    const parser = new htmlparser2.Parser({
            onopentag(name, attribs, value) {
                if (name === "input" && attribs.id === 'login-email') {
                    loginElement = attribs.name
                }
                if (name === "input" && attribs.id === 'login-pwd') {
                    pwdElement = attribs.name
                }
                if (name === "input" && attribs.type === 'hidden') {
                    boolElement = attribs.name
                }
            }
        },{ decodeEntities: true })
        parser.write(data)
        parser.end()

    var pos = data.indexOf('var lift_page = ')+'var lift_page = '.length+1
    endpointid = data.substr(pos).split('"')[0]

    //Now create the post message to get the auth cookie
    let formbody = { }
    formbody[loginElement]=userEmail
    formbody[pwdElement]=userPwd
    formbody[boolElement]='true'

    //Now post the new login request
    var options = {
        protocol: 'https:',
        host: 'account.shellrecharge.com',
        path: '/ajax_request/' + endpointid + '-00/',
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Cookie': 'JSESSIONID='+sessioncookie+';'
        },
        form: formbody
    }
    let postresponse = (await http.post(options))
    //Now parse the response to get the real token we need
    let message = postresponse.response
    setcookies = cookie.parse(message.headers['set-cookie'][0])

    console.debug('second cookies received: '+JSON.stringify(setcookies))
    auth_token.api_cookie=setcookies.tnm_api;
    console.log('token value: '+JSON.stringify(auth_token.api_cookie))
    if(auth_token.api_cookie === undefined)
    {
        auth_token.api_cookie = ''
        console.info('could not retriev the token for this session, try again later')
    } else {
        auth_token.set_date= new Date()
        console.info('new fresh token retrieved')
    }
    return auth_token.api_cookie
}

async function getMyChargeCards(token)
{
    var options = {
        protocol: 'https:',
        host: 'ui-chargepoints.newmotion.com',
        path: '/api/facade/v1/me/asset-overview',
        headers: {
          'content-type': 'application/octet-stream',
          'Cookie': 'language.code.selection=en; tnm_api=\"' + token + '\"'
        }
      }
    console.info('Retrieving my charge cards')
    let data = JSON.parse((await http.get(options)).data)
    let tokens = data.chargeTokens.map((token) => {
        return {
            rfid: token.rfid,
            printedNumber: token.printedNumber,
            name: token.name
        }
    })
    return tokens
}

async function getMyCars(token)
{
    var options = {
        protocol: 'https:',
        host: 'ui-mynm-my-vehicles.newmotion.com',
        path: '/api/facade/v1/me/vehicles',
        headers: {
          'content-type': 'application/octet-stream',
          'Cookie': 'language.code.selection=en; tnm_api=\"' + token + '\"'
        }
      }
    console.info('Retrieving my cars')
    let data = JSON.parse((await http.get(options)).data);
    //console.log(JSON.stringify(data));
    let cars = data._embedded.vehicles.map((vehicle) => {
        return {
            id: vehicle.id,
            battery: vehicle.edition.batteryCapacity,
            name: vehicle.name
        }
    })
    return cars
}

async function getMyCar(token, carid)
{
    var options = {
        protocol: 'https:',
        host: 'ui-mynm-my-vehicles.newmotion.com',
        path: '/api/facade/v1/me/vehicles/'+carid,
        headers: {
          'content-type': 'application/octet-stream',
          'Cookie': 'language.code.selection=en; tnm_api=\"' + token + '\"'
        }
      }
    console.info('Retrieving a car')
    let data = JSON.parse((await http.get(options)).data);
    console.log(JSON.stringify(data));
    let cars = data.map((vehicle) => {
        return {
            id: vehicle.id,
            battery: vehicle.edition.batteryCapacity,
            name: vehicle.name
        }
    })
    return cars
}

function getSinglePoint(id, token) {
    var promise = new Promise(async function (resolve, reject)
    {
        try{
            var options = {
                protocol: 'https:',
                host: 'ui-chargepoints.newmotion.com',
                path: '/api/facade/v1/charge-points/' + id,
                headers: {
                'content-type': 'application/octet-stream',
                'Cookie': 'language.code.selection=en; tnm_api=\"' + token + '\"'
                }
            }
            let response = await http.get(options);
            console.log('chargepoint response: '+JSON.stringify(response.data));
            let data = JSON.parse(response.data);
            resolve(data);
        } catch (err) {
            reject(err);
        }
    })
    return promise;
}

async function getMyChargePoints(token)
{  
    var options = {
        protocol: 'https:',
        host: 'ui-chargepoints.newmotion.com',
        path: '/api/facade/v1/me/asset-overview',
        headers: {
        'content-type': 'application/octet-stream',
        'Cookie': 'language.code.selection=en; tnm_api=\"' + token + '\"'
        }
    }
    console.info('Retrieving my charge points')

    let data = JSON.parse((await http.get(options)).data)
    console.log('All charge point collected');
    let promises = data.chargePoints.map((point) => {
        console.log('point data for point, attempt to get details ['+point.name+'], '+JSON.stringify(point));
        var pointinfo = getSinglePoint(point.uuid, token).then(cp => {
            return cp;
        },
        err => {
            throw Error('Retrieving single point ['+point.name+'],'+err);
        });
        return pointinfo;
    });
    return await Promise.all(promises)
}



//todo: Implement a get last charge session, when the session stops we can collect it for the logging
async function getChargeSessions(token,userid,chargepointid)
{
    /*
     url: 'https://ui-chargepoints.newmotion.com/api/facade/v1/me',
{
    "externalId": "001w000001eorAAA",
    "email": "v----@v----.--",
    "country": "Netherlands",
    "locale": "en_NL",
    "lastName": "B---",
    "firstName": "------t",
    "id": "690000-407a-4000-9fea-26ae0000e4e",
    "countryCode": "nl",
    "status": "active",
    "_links": {
        "self": {
            "href": "690000-407a-4000-9fea-26ae0000e4e"
        },
        "charge-session-history": {
            "href": "/v1/charge-session-history?jwt={}}"
        },
        "mailing-lists": {
            "href": "/v1/customers/690000-407a-4000-9fea-26ae0000e4e/mailing-lists"
        }
    }
}
     */

    /*
    var request = require("request");

var options = { method: 'POST',
  url: 'https://ui-charge-sessions.newmotion.com/api/facade/v1/user-sessions/charge-points',
  headers: 
   { 
     'Content-Type': 'application/json',
     Cookie: 'language.code.selection=en; tnm_api=\"' + (await getAuthCookie()) + '\"' },
  body: 
   { userId: ''+userid+'',
     startDateTime: '2019-09-08T00:00:00+02:00',
     endDateTime: '2019-10-07T23:59:59+02:00',
     chargePointSerials: [ ''+chargepointid+'' ],
     limit: 1
     offset: 0,
     sortField: 'startDateTime',
     sortOrder: 'desc' },
  json: true };

request(options, function (error, response, body) {
  if (error) throw new Error(error);

  console.log(body);
});

{
    "total": 39,
    "results": [
        {
            "sessionId": "03012200_484",
            "operator": "TheNewMotion",
            "chargePointSerial": "0------00",
            "chargePointReference": "0------00",
            "authId": "04----0",
            "contractId": "NL-TNM-000000-1",
            "startDateTime": "2019-10-06T22:59:56+02:00",
            "endDateTime": "2019-10-07T06:44:42+02:00",
            "duration": "PT27886S",
            "volume": 8.341,
            "chargePointAddress": "Burg----------",
            "chargePointPostalCode": "-----",
            "chargePointCity": "Bo-----",
            "chargePointCountry": "NLD",
            "sessionType": "Reimbursed"
        }
    ]
}
    */
}

module.exports = getSinglePoint
module.exports.list = getMyChargePoints
module.exports.cards = getMyChargeCards
module.exports.cars = getMyCars
module.exports.car = getMyCar
module.exports.startSession = startSession
module.exports.stopSession = stopSession
module.exports.getAuthCookie = getAuthCookie
module.exports.clearAuthCookie = clearAuthCookie