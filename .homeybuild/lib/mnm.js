'use strict'
var htmlparser2 = require("htmlparser2")
//var formdata = require('form-data')
const http = require('http.min')
const cookie = require("cookie");
const HomeyCrypt = require('./homeycrypt')
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
        host: 'ui-chargepoints.shellrecharge.com',
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
    //1 hours ago
    let tokenage = new Date()
    tokenage.setHours(tokenage.getHours() - 1)
    //console.log('token was generated on '+auth_token.set_date+' lets see if it is stale by comparing with '+yesterday)
    if(auth_token.api_cookie!='' && auth_token.set_date > tokenage)
    {
        console.info('token is still valid')
        return auth_token.api_cookie
    }
    else{
        console.info('stale or invalid token, retrieve new one')
    }
    //Else refresh the cookie first
    let userEmail = cred_username;
    let userPwd = null;
    try {
        userPwd = await HomeyCrypt.decrypt(cred_secure_password,userEmail);
    } catch (err) {
        clearAuthCookie();
        console.info('could not decrypt using salt, network connection changed?');
        return;   
    }
    console.log('credentials retrieved from settings and decrypted')
    var requestOptions = {
        protocol: 'https:',
        host: 'account.shellrecharge.com',
        path: '/',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0'
        }     
      }
    //Get the new motion html body to get a serverside ajax control setup
    let formmesssage = (await http.get(requestOptions))
    let data = formmesssage.data
    //Lets store the session cookie
    let formresponse = formmesssage.response
    console.debug('Response code: '+JSON.stringify(formresponse.statusCode));
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
    console.debug('Will use form to post login attempt: session:'+sessioncookie+' loginEmail:'+loginElement+' -loginPwd:'+pwdElement+' -loginBool:'+boolElement)
    //Now post the new login request
    var requestOptions = {
        protocol: 'https:',
        host: 'account.shellrecharge.com',
        path: '/ajax_request/' + endpointid + '-00/',
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
          'Cookie': 'JSESSIONID='+sessioncookie+';'
        },
        form: formbody
    }
    let postresponse = (await http.post(requestOptions))
    //Now parse the response to get the real token we need
    let message = postresponse.response;
    console.debug('Response code: '+JSON.stringify(message.statusCode));
    console.debug('response received: '+message);

    try {
        auth_token.api_cookie=message.headers['set-cookie'].map(cookie.parse).filter(cookie => cookie['tnm_api'] !== undefined).pop()['tnm_api'];
        console.debug('new cookie length: '+auth_token.api_cookie.length);
        auth_token.set_date= new Date();
        console.info('new fresh token retrieved');
    } catch (err) {
        clearAuthCookie();
        console.info('site did not return an cookie, happends sometimes, will try again soon');
        console.debug('cookies that we did receive: '+message.headers['set-cookie']);
    }
    return auth_token.api_cookie
}

async function getMyChargeCards(token)
{
    var options = {
        protocol: 'https:',
        host: 'ui-chargepoints.shellrecharge.com',
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
        host: 'ui-mynm-my-vehicles.shellrecharge.com',
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
        host: 'ui-mynm-my-vehicles.shellrecharge.com',
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
                host: 'ui-chargepoints.shellrecharge.com',
                path: '/api/facade/v1/charge-points/' + id,
                headers: {
                'content-type': 'application/octet-stream',
                'Cookie': 'language.code.selection=en; tnm_api=\"' + token + '\"'
                }
            }
            let response = await http.get(options);
            console.log('chargepoint response: '+JSON.stringify(response.data));
            if(response.data==="Forbidden")
                reject("Forbidden")
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
        host: 'ui-chargepoints.shellrecharge.com',
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
            console.log('Error: Retrieving single point ['+point.name+'],'+err);
            return null;
        });
        return pointinfo;
    });
    return await Promise.all(promises)
}

//Retrieves the user id of the current user
async function getUserId(token)
{
    var options = {
        protocol: 'https:',
        host: 'ui-chargepoints.shellrecharge.com',
        path: '/api/facade/v1/me',
        headers: {
        'content-type': 'application/octet-stream',
        'Cookie': 'language.code.selection=en; tnm_api=\"' + token + '\"'
        }
    }
    console.info('Retrieving my user details')

    let data = JSON.parse((await http.get(options)).data)
    console.log('User details collected: '+data.id);
    return data.id;
}

//todo: Implement a get last charge session, when the session stops we can collect it for the logging
async function getChargeSessions(token, chargepointid, startdate, enddate)
{
    var body = JSON.stringify({
        "startDateTime": startdate.toISOString(),
        "endDateTime": enddate.toISOString(),
        "chargePointIds": [
            ""+chargepointid+""
        ],
        "limit": 10000,
        "offset": 0,
        "sortField": "startDateTime",
        "sortOrder": "desc"
      })
    var userid = await getUserId(token)
    var options = {
        protocol: 'https:',
        host: 'ui-charge-sessions.shellrecharge.com',
        path: '/api/facade/v1/customers/'+userid+'/charge-sessions',
        headers: {
        'content-type': 'application/json',
        'Cookie': 'language.code.selection=en; tnm_api=\"' + token + '\"'
        }
    }
    
    console.info('Retrieving my charge sessions from '+startdate.toISOString()+' till '+enddate.toISOString());
    var response = await http.post(options, body);

    let data = JSON.parse((response).data);
    console.log('All charge sessions retrieved');
    let sessions = data.results.map((session) => {
        return {
            id: session.sessionId,
            cardname: session.chargeTokenPrintedNumber,
            volume: session.volume,
            startdate: session.startDateTime,
            enddate: session.endDateTime
        }
        });
    return sessions;
}


module.exports = getSinglePoint
module.exports.list = getMyChargePoints
module.exports.cards = getMyChargeCards
module.exports.cars = getMyCars
module.exports.car = getMyCar
module.exports.startSession = startSession
module.exports.stopSession = stopSession
module.exports.getChargeSessions = getChargeSessions
module.exports.getAuthCookie = getAuthCookie
module.exports.clearAuthCookie = clearAuthCookie