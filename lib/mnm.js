'use strict'
var htmlparser2 = require("htmlparser2")
var formdata = require('form-data')
const http = require('http.min')
const HS = require('./haversine')
const { ManagerSettings } = require('homey');

//We store the active token in mem, it gets stale quick anyway
let auth_token = {
    api_cookie: '',
    set_date: new Date()
}

async function startSession(id, rfid)
{
    return SessionAction(id,'start', rfid)
}
async function stopSession(id)
{
    return SessionAction(id,'stop', '')
}
async function SessionAction(id, action, rfid)
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
          'Cookie': 'language.code.selection=en; tnm_api=\"' + (await getAuthCookie()) + '\"',
          'accept': 'text/html'
        }
    }
    console.info(action+' charge session with card '+rfid)
    let response = (await http.post(options, body))
    return response.data
}

function getSessionCookie(setcookie)
{
    var cookie=''
    setcookie.split('; ').map(
        function (val) { 
            var cookiename = val.split('=')[0]
            if(cookiename==='JSESSIONID')
                cookie=val
        });
    return cookie
}

function parseAuthCookie(setcookie)
{
    var cookie=''
    setcookie.split('; ').map(
        function (val) { 
            var cookiename = val.split('=')[0]
            if(cookiename==='tnm_api')
                cookie=val.split('=')[1]
        });
    return cookie.substr(1)+'='
}

async function getAuthCookie()
{
    //24 hours ago
    let yesterday = (new Date().getDate() - 1)

    if(auth_token.api_cookie!='' && auth_token.set_date > yesterday)
    {
        console.info('token is still valid')
        return auth_token.api_cookie
    }
    else{
        console.info('stale or invalid token, retrieve new one')
    }
    //Else refresh the cookie first
    let userEmail = ManagerSettings.get('user_email')
    let userPwd = ManagerSettings.get('user_password')

    var options = {
        protocol: 'https:',
        host: 'my.newmotion.com',
        path: '/'
      }
    //Get the new motion html body to get a serverside ajax control setup
    let formmesssage = (await http.get(options))
    let data = formmesssage.data
    //Lets store the session cookie
    let formresponse = formmesssage.response
    let setcookies = formresponse.headers['set-cookie']
    var sessioncookie = getSessionCookie(setcookies[0])
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
    endpointid = data.substr(pos,19)
    //Now create the post message to get the auth cookie
    let formbody = { }
    formbody[loginElement]=userEmail
    formbody[pwdElement]=userPwd
    formbody[boolElement]='true'

    //Now post the new login request
    var options = {
        protocol: 'https:',
        host: 'my.newmotion.com',
        path: '/ajax_request/' + endpointid + '-00/',
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Cookie': ''+sessioncookie+';'
        },
        form: formbody
    }
    let postresponse = (await http.post(options))

    //Now parse the response to get the real token we need
    let message = postresponse.response
    setcookies = message.headers['set-cookie']
    auth_token.api_cookie=parseAuthCookie(setcookies[0])
    auth_token.set_date= new Date()
    console.info('new fresh token retrieved')
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

async function getSinglePoint(id) {

    var options = {
        protocol: 'https:',
        host: 'ui-chargepoints.newmotion.com',
        path: '/api/facade/v1/charge-points/' + id,
        headers: {
          'content-type': 'application/octet-stream',
          'Cookie': 'language.code.selection=en; tnm_api=\"' + (await getAuthCookie()) + '\"'
        }
      }
    let data = JSON.parse((await http.get(options)).data)
    return data
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
    let promises = data.chargePoints.map((point) => getSinglePoint(point.uuid))

    return await Promise.all(promises)
}

module.exports = getSinglePoint
module.exports.list = getMyChargePoints
module.exports.cards = getMyChargeCards
module.exports.startSession = startSession
module.exports.stopSession = stopSession
module.exports.getAuthCookie = getAuthCookie