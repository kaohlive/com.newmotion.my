'use strict'

//const axios = require('axios').default;
//const tough = require('tough-cookie');
//const { wrapper } = require('axios-cookiejar-support');


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

    return await (async () => {
        const axiosCookieJarSupport = await import('axios-cookiejar-support');
        const axios = require('axios').default;
        const tough = require('tough-cookie');

        const jar = new tough.CookieJar();
        const client = axiosCookieJarSupport.wrapper(axios.create({ jar }));

        const loginUrl = 'https://50five-snl.evc-net.com/Login/Login'; // Replace with actual login endpoint

        const payload = new URLSearchParams();

        payload.append('emailField', userEmail);
        payload.append('passwordField', userPwd);
        payload.append('Login', 'Log in'); // Button value

        try {
            const response = await client.post(loginUrl, payload.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'accept-encoding': 'gzip, deflate, br, zstd',
                'accept-language': 'en-GB,en;q=0.9,en-US;q=0.8,nl;q=0.7',
                'cache-control': 'max-age=0',
                'dnt': '1',
                'priority': 'u=0, i',
                'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Microsoft Edge";v="138"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'same-origin',
                'sec-fetch-user': '?1',
                'upgrade-insecure-requests': '1',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0',
                'Referer': loginUrl
            },
            maxRedirects: 0, // To catch the session immediately
            validateStatus: status => status < 500 // Let us inspect 3xx responses
            });

            const cookies = jar.getCookiesSync(loginUrl);
            const sessionCookie = cookies.find(c => c.key === 'PHPSESSID');

            if (sessionCookie) {
                console.log('✅ Logged in successfully!');
                console.log('🍪 PHPSESSID:', sessionCookie.value);
                getMyChargePoints(sessionCookie.value);
                auth_token.api_cookie=sessionCookie.value;
                auth_token.set_date= new Date();
                return auth_token.api_cookie                
            } else {
                clearAuthCookie();
                console.log('❌ Login failed or no session cookie returned.');
            }
        } catch (error) {
            clearAuthCookie();
            console.error('⚠️ Login error:', error.message);
        }
        return '';
    })();

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

/**
 * Perform a GET request to 50five-snl API with session token
 * @param {string} token - PHPSESSID token value
 * @param {string} endpointQuery - URL query string after /api/ajax
 * @returns {Promise<any>} Parsed API response data
 */
async function getApiData(token, endpointQuery) {
    return await (async () => {
        const axiosCookieJarSupport = await import('axios-cookiejar-support');
        const axios = require('axios').default;
        const tough = require('tough-cookie');

        const jar = new tough.CookieJar();
        const client = axiosCookieJarSupport.wrapper(axios.create({ jar }));

        jar.setCookieSync(
            `PHPSESSID=${token}; Path=/; Secure; HttpOnly`,
            'https://50five-snl.evc-net.com'
        );

        const url = `https://50five-snl.evc-net.com/api/ajax${endpointQuery.startsWith('?') ? '' : '?'}${endpointQuery}`;

        try {
            const response = await client.get(url, {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept-Language': 'en-GB,en;q=0.9,en-US;q=0.8,nl;q=0.7',
                'Cache-Control': 'max-age=0',
                'DNT': '1',
                'Priority': 'u=0, i',
                'Sec-CH-UA': '"Not)A;Brand";v="8", "Chromium";v="138", "Microsoft Edge";v="138"',
                'Sec-CH-UA-Mobile': '?0',
                'Sec-CH-UA-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0'
            }
            });
            //console.dir(response.data, { depth: null });
            return response.data;
        } catch (error) {
            console.error('❌ API GET request failed:', error.response?.status);
            console.error('🧾 Response:', error.response?.data || error.message);
            return null;
        }
    })();  
}

async function getSinglePointBySerial(serial, token){
    console.log('🔍 1.1: Get all chargepoints to filter on the serial ['+serial+']');
    const myPoints = await getMyChargePoints(token);    
    if(myPoints==null) {
        console.log('❌ 1.2: No chargepoints found in your account');
        return [];
    }
    console.log('✅ 1.2: Collected my ChargePoints and their details');
    console.dir(myPoints, { depth: null });
    const match = myPoints.find(item => item.serial === serial);
    if (match) {
        console.log('✅ 1.3: Found matching chargepoint:', match.serial);
        return match;
    } else {
        console.log('❌ 1.3: No chargepoint found with that serial');
        return [];
    }
}

async function getSinglePoint(id, token) {
    const encodedQuery = `requests=%7B"0"%3A%7B"handler"%3A"%5C%5CLMS%5C%5CEV%5C%5CAsyncServices%5C%5CRechargeSpotsAsyncService"%2C"method"%3A"overview"%2C"params"%3A%7B"rechargeSpotId"%3A"${id}"%7D%7D%7D&metricKey=RechargeSpotDashboard_149`;
    return await getApiData(token, encodedQuery)
      .then(result => {
        if (Array.isArray(result) && Array.isArray(result[0])) {
            console.log('✅ 3.1: Located chargepoint status');
            const point = result[0][0];
            console.log('✅ 3.2: Data received from Chargepoint status API:');
            console.log(`🔌 CONNECTOR: ${point.CONNECTOR}`);
            console.log(`   Cardid: ${point.CARDID}`);
            console.log(`   Status: ${point.STATUS}`);
            console.log(`   Notification: ${point.NOTIFICATION}`);
            //console.dir(result[0], { depth: null });
            return point;
        } else {
            console.warn('⚠️ 3.2: Unexpected response structure');
            return null;
        }
    })
      .catch(err => {
        console.error('❌ 3.1: Failed to fetch chargepoint overview:', err.message);
        return err;
    })
}

async function getMyChargePoints(token)
{  
    let chargePoints = await (async () => {
    try {
        const result = await getApiData(token, "requests=%7B%220%22%3A%7B%22handler%22%3A%22%5C%5CLMS%5C%5CEV%5C%5CAsyncServices%5C%5CDashboardAsyncService%22%2C%22method%22%3A%22networkOverview%22%2C%22params%22%3A%7B%22mode%22%3A%22id%22%7D%7D%7D&metricKey=EndUserRechargeSpotListView_99");
        console.log('✅ 2.1: Data received from Chargepoint list API:');
        //console.dir(result, { depth: null });
        // The response contains a double array nesting
        // not seen any results that has more than one (the real array) elements in the first level
        if (Array.isArray(result) && Array.isArray(result[0])) {
            console.log('✅ 2.2: Located chargepoints:');
            return result[0];
        } else {
            console.log('⚠️ 2.2: Unexpected response structure');
            return null;
        }
    } catch (error) {
        console.error('❌ 2.2: Request failed:', error.response?.status);
        console.error('🧾 2.2: Response:', error.response?.data || error.message);
        return null;
    }
    })();
    if(chargePoints==null)
        return null;
    // 🔍 Attempt to parse into details per chargepoint
    console.log('🔍 2.3: All charge point collected, get details');
    let promises = chargePoints.map((point) => {
        console.log(`🔌 IDX: ${point.IDX}`);
        console.log(`   Name: ${point.NAME}`);
        console.log(`   Channel: ${point.CHANNEL}`);
        const shell_id_raw = point.ADDRESS?.split(',')[0]?.trim();
        const shell_id = /^\d+$/.test(shell_id_raw) ? shell_id_raw : null;
        console.log(`   Recharge IDX: ${shell_id}`);
        console.log('🔍 2.4: Get point data for point, attempt to get details ['+point.NAME+']');
        var pointdetails = getSinglePoint(point.IDX, token).then(cp => {
            if(cp==null) return null;
            cp.serial = shell_id;
            cp.id = point.IDX;
            cp.name = point.NAME;
            cp.channel = point.CHANNEL;
            console.log('✅ 2.5: Located chargepoint with serial '+cp.serial);
            //console.dir(cp, { depth: null });
            return cp;
        },
        err => {
            console.log('❌ 2.5: Retrieving single point ['+point.NAME+'],'+err);
            return null;
        });
        return pointdetails;
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


module.exports = getSinglePointBySerial
module.exports.list = getMyChargePoints
module.exports.cards = getMyChargeCards
module.exports.cars = getMyCars
module.exports.car = getMyCar
module.exports.startSession = startSession
module.exports.stopSession = stopSession
module.exports.getChargeSessions = getChargeSessions
module.exports.getAuthCookie = getAuthCookie
module.exports.clearAuthCookie = clearAuthCookie