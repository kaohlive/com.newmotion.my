'use strict'

const http = require('http.min')
const cookie = require("cookie");
const cheerio = require('cheerio');
const HomeyCrypt = require('./homeycrypt')

//We store the active token in mem, it gets stale quick anyway
let auth_token = {
    api_cookie: '',
    set_date: new Date(),
    serverid: ''
}

async function startSession(point, channel, rfid, cred_username, cred_secure_password)
{
    return SessionAction(point.idx, channel, 'StartTransaction', rfid, cred_username, cred_secure_password, 0)
}
async function stopSession(point, channel, cred_username, cred_secure_password)
{
    return SessionAction(point.idx, channel, 'StopTransaction', '', cred_username, cred_secure_password,0)
}
async function requestUpdate(point, channel, cred_username, cred_secure_password)
{
    return SessionAction(point.idx, '', 'GetStatus', '', cred_username, cred_secure_password,1)
}
async function SessionAction(id, channel, action, printedNumber, cred_username, cred_secure_password, button)
{
    const querystring = require('querystring');
    const token = await getAuthCookie(cred_username, cred_secure_password);
    //Base request structure for actions
    const params = {
        action: action,
        rechargeSpotId: id,
        clickedButtonId: button
    };
    //Add the card and customer field if the card is passed
    if (channel!=='') {
        params.channel = channel
    }
    
    if (printedNumber!=='') {
        //convert the printedNumber in the 50five id
        const cardid = await CardAccess(id, printedNumber, token);
        //console.dir(cardid, { depth: null })
        params.customer = null,
        params.card = cardid.contractId;
    }

    const requestPayload = {
    "0": {
        handler: "\\LMS\\EV\\AsyncServices\\RechargeSpotsAsyncService",
        method: "action",
        params: params
        }
    }
    const requestString = querystring.stringify({
    requests: JSON.stringify(requestPayload),
    metricKey: "RechargeSpotDashboard_1021"
    })

    
    console.log('🔍 Sending action request: '+action);

    return await getApiData(token, requestString)
      .then(result => {
            console.log('✅ 4.1: command accepted: '+action);
            //console.dir(result, { depth: null })
            return result;
    })
      .catch(err => {
        console.error('❌ 4.1: command rejected:', err.message);
        return err;
    })
};

function normalizeDateString(dateStr) {
    const monthMap = {
        'jan.': 'Jan', 'feb.': 'Feb', 'mrt.': 'Mar', 'apr.': 'Apr',
        'mei':  'May', 'jun.': 'Jun', 'jul.': 'Jul', 'aug.': 'Aug',
        'sep.': 'Sep', 'okt.': 'Oct', 'nov.': 'Nov', 'dec.': 'Dec'
    };

    // Replace Dutch month with English equivalent
    for (const [dutch, english] of Object.entries(monthMap)) {
        if (dateStr.includes(dutch)) {
        return dateStr.replace(dutch, english);
        }
    }

    return dateStr; // fallback if no match
}

async function SessionLog(point, token)
{
    const querystring = require('querystring');
    //Base request structure for logs
    const params = {
        rechargeSpotId: point.idx,
        channel: point.channel,
        detailed: false,
        id: null,
        extend: false
    };

    const requestPayload = {
    "0": {
        handler: "\\LMS\\EV\\AsyncServices\\RechargeSpotsAsyncService",
        method: "log",
        params: params
        }
    }
    const requestString = querystring.stringify({
    requests: JSON.stringify(requestPayload),
    metricKey: "RechargeSpotDashboard_1431"
    })

    //const token = await getAuthCookie(cred_username, cred_secure_password);
    console.log('🔍 Sending session log request: ');

    return await getApiData(token, requestString)
      .then(result => {
            console.log('✅ 5.1: command accepted: ');
            
            const filteredData = result[0].filter(item => {
                return !item.EVENT_DATA?.toLowerCase().startsWith('info:');
            });

            // Descending Sort by parsed date
            const sortedData = filteredData.sort((a, b) => {
                const dateA = new Date(normalizeDateString(a.LOG_DATE));
                const dateB = new Date(normalizeDateString(b.LOG_DATE));
                return dateB - dateA;
            });
            //console.dir(sortedData, { depth: null })
            return sortedData.slice(0,10);
    })
      .catch(err => {
        console.error('❌ 5.1: command rejected:', err.message);
        return err;
    })
}

//Tries to retrieve the cardid from the api using the card number printed on the card
async function CardAccess(idx, printedNumber, token)
{
    const querystring = require('querystring');
    //Base request structure for logs
    const params = {
        rechargeSpotId: idx,
        customerId: null,
        input: printedNumber
    };

    const requestPayload = {
    "0": {
        handler: "\\LMS\\EV\\AsyncServices\\RechargeSpotsAsyncService",
        method: "cardAccess",
        params: params
        }
    }
    const requestString = querystring.stringify({
    requests: JSON.stringify(requestPayload),
    metricKey: "RechargeSpotDashboard_1431"
    })

    //const token = await getAuthCookie(cred_username, cred_secure_password);
    console.log('🔍 Sending card access request: '+printedNumber.slice(0, -6).replace(/./g, '*') + printedNumber.slice(-6));

    return await getApiData(token, requestString)
      .then(result => {
            console.log('✅ 6.1: command accepted: ');
            if (Array.isArray(result) && Array.isArray(result[0])) {
                console.log('✅ 6.2: Located card details:');
                //console.dir(result[0], { depth: null })
                return result[0][0];
            } else {
                console.log('⚠️ 6.2: Unexpected response structure');
                return null;
        }
    })
      .catch(err => {
        console.error('❌ 6.1: command rejected:', err.message);
        return err;
    })
}

function formatDate(date)
{
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const year = date.getFullYear();

    const formattedDate = `${day}-${month}-${year}`;
    return formattedDate
}

async function TransactionHistory(token, startDate, endDate)
{
    const querystring = require('querystring');

    const requestString = querystring.stringify({
    startDateField: formatDate(startDate),
    endDateField: formatDate(endDate),
    typeField:"TransactionsOwnSpot",
    employeeField:null,
    cardField:null,
    rechargeSpotField:null,
    invoiceField:null,
    showButton:"Show",
    searchTable_length:500
    })

    const payload = "draw=1&columns%5B0%5D%5Bdata%5D=0&columns%5B0%5D%5Bname%5D=&columns%5B0%5D%5Bsearchable%5D=true&columns%5B0%5D%5Borderable%5D=true&columns%5B0%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B0%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B1%5D%5Bdata%5D=1&columns%5B1%5D%5Bname%5D=&columns%5B1%5D%5Bsearchable%5D=true&columns%5B1%5D%5Borderable%5D=true&columns%5B1%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B1%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B2%5D%5Bdata%5D=2&columns%5B2%5D%5Bname%5D=&columns%5B2%5D%5Bsearchable%5D=true&columns%5B2%5D%5Borderable%5D=true&columns%5B2%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B2%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B3%5D%5Bdata%5D=3&columns%5B3%5D%5Bname%5D=&columns%5B3%5D%5Bsearchable%5D=true&columns%5B3%5D%5Borderable%5D=true&columns%5B3%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B3%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B4%5D%5Bdata%5D=4&columns%5B4%5D%5Bname%5D=&columns%5B4%5D%5Bsearchable%5D=true&columns%5B4%5D%5Borderable%5D=true&columns%5B4%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B4%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B5%5D%5Bdata%5D=5&columns%5B5%5D%5Bname%5D=&columns%5B5%5D%5Bsearchable%5D=true&columns%5B5%5D%5Borderable%5D=true&columns%5B5%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B5%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B6%5D%5Bdata%5D=6&columns%5B6%5D%5Bname%5D=&columns%5B6%5D%5Bsearchable%5D=true&columns%5B6%5D%5Borderable%5D=true&columns%5B6%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B6%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B7%5D%5Bdata%5D=7&columns%5B7%5D%5Bname%5D=&columns%5B7%5D%5Bsearchable%5D=true&columns%5B7%5D%5Borderable%5D=true&columns%5B7%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B7%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B8%5D%5Bdata%5D=8&columns%5B8%5D%5Bname%5D=&columns%5B8%5D%5Bsearchable%5D=true&columns%5B8%5D%5Borderable%5D=true&columns%5B8%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B8%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B9%5D%5Bdata%5D=9&columns%5B9%5D%5Bname%5D=&columns%5B9%5D%5Bsearchable%5D=true&columns%5B9%5D%5Borderable%5D=true&columns%5B9%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B9%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B10%5D%5Bdata%5D=10&columns%5B10%5D%5Bname%5D=&columns%5B10%5D%5Bsearchable%5D=true&columns%5B10%5D%5Borderable%5D=true&columns%5B10%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B10%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B11%5D%5Bdata%5D=11&columns%5B11%5D%5Bname%5D=&columns%5B11%5D%5Bsearchable%5D=true&columns%5B11%5D%5Borderable%5D=true&columns%5B11%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B11%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B12%5D%5Bdata%5D=12&columns%5B12%5D%5Bname%5D=&columns%5B12%5D%5Bsearchable%5D=true&columns%5B12%5D%5Borderable%5D=true&columns%5B12%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B12%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B13%5D%5Bdata%5D=13&columns%5B13%5D%5Bname%5D=&columns%5B13%5D%5Bsearchable%5D=true&columns%5B13%5D%5Borderable%5D=true&columns%5B13%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B13%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B14%5D%5Bdata%5D=14&columns%5B14%5D%5Bname%5D=&columns%5B14%5D%5Bsearchable%5D=true&columns%5B14%5D%5Borderable%5D=true&columns%5B14%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B14%5D%5Bsearch%5D%5Bregex%5D=false&order%5B0%5D%5Bcolumn%5D=0&order%5B0%5D%5Bdir%5D=desc&start=0&length=500&search%5Bvalue%5D=&search%5Bregex%5D=false"

    //const token = await getAuthCookie(cred_username, cred_secure_password);
    console.log('🔍 Sending TransactionLog request: ');

    return await postApiData(token, requestString, "/Transactions/List/json", payload)
      .then(result => {
            console.log('✅ 7.1: command accepted: ');
            if (result && result.data) {
                console.log('✅ 7.2: Transaction history:');
                //console.dir(result.data, { depth: null })
                return result.data;
            } else {
                console.log('⚠️ 7.2: Unexpected response structure');
                return null;
        }
    })
      .catch(err => {
        console.error('❌ 7.1: command rejected:', err.message);
        return err;
    })
}

function clearAuthCookie()
{
    auth_token.api_cookie='';
    auth_token.serverid='';
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
            const serverIDCookie = cookies.find(c => c.key === 'SERVERID');

            if (sessionCookie) {
                console.log('✅ Logged in successfully!');
                console.log('🍪 PHPSESSID:', sessionCookie.value);
                console.log('🍪 SERVERID:', serverIDCookie.value);

                auth_token.api_cookie=sessionCookie.value;
                auth_token.set_date= new Date();
                auth_token.serverid=serverIDCookie.value;
                getMyChargePoints(sessionCookie.value);
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

//This is now based on html parsing, not a very reliable method.
async function getMyChargeCards(token)
{
    const html = await (async () => {
        const axiosCookieJarSupport = await import('axios-cookiejar-support');
        const axios = require('axios').default;
        const tough = require('tough-cookie');

        const jar = new tough.CookieJar();
        const client = axiosCookieJarSupport.wrapper(axios.create({ jar }));

        jar.setCookieSync(
            `PHPSESSID=${token}; Path=/; Secure; HttpOnly`,
            'https://50five-snl.evc-net.com'
        );
        jar.setCookieSync(
            `SERVERID=${auth_token.serverid}; Path=/; Secure; HttpOnly`,
            'https://50five-snl.evc-net.com'
        );


        const url = `https://50five-snl.evc-net.com/Cards/List`;
        console.log(`⚠️ HTML page GET request builder, to get card list`);
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
    if(html==null) return null;
    //Lets parse the html and collect the card references
    const $ = cheerio.load(html);

    const tokens = $('#GenId1 tbody tr').toArray().map(row => {
        //console.log(row);
        const $row = $(row);
        const rfidText = $row.find('td').eq(0).text().trim();
        //console.log(rfidText);
        const printedNumber = rfidText.split(' ').pop().trim();

        const reference = $row.find('td').eq(2).find('span.card-reference').text().trim();
        //console.log(reference);

        return {
            rfid: printedNumber.slice(0, -6).replace(/./g, '*') + printedNumber.slice(-6),
            printedNumber: printedNumber,
            name: reference
        }
    });

    
    const maskedTokens = tokens.map(token => ({
    ...token,
    printedNumber: token.rfid
    }));


    console.dir(maskedTokens, { depth: null });
    return tokens
}

/**
 * Perform a GET request to 50five-snl API with session token
 * @param {string} token - PHPSESSID token value
 * @param {string} endpointQuery - URL query string after /api/ajax
 * @returns {Promise<any>} Parsed API response data
 */
async function postApiData(token, endpointQuery, endpoint = '/api/ajax', payload) {
    return await (async () => {
        const axiosCookieJarSupport = await import('axios-cookiejar-support');
        const axios = require('axios').default;
        const tough = require('tough-cookie');

        const jar = new tough.CookieJar();
        const client = axiosCookieJarSupport.wrapper(axios.create({ jar }));
        //console.log('⚠️ API GET request builder with token:'+token);
        jar.setCookieSync(
            `PHPSESSID=${token}; Path=/; Secure; HttpOnly`,
            'https://50five-snl.evc-net.com'
        );
        jar.setCookieSync(
            `SERVERID=${auth_token.serverid}; Path=/; Secure; HttpOnly`,
            'https://50five-snl.evc-net.com'
        );


        const url = `https://50five-snl.evc-net.com${endpoint}${endpointQuery.startsWith('?') ? '' : '?'}${endpointQuery}`;
        console.log(`⚠️ API GET request builder with payload:${endpoint}${endpointQuery.startsWith('?') ? '' : '?'}${endpointQuery}`);
        try {
            const response = await client.post(url, payload, {
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

/**
 * Perform a GET request to 50five-snl API with session token
 * @param {string} token - PHPSESSID token value
 * @param {string} endpointQuery - URL query string after /api/ajax
 * @returns {Promise<any>} Parsed API response data
 */
async function getApiData(token, endpointQuery, endpoint = '/api/ajax') {
    return await (async () => {
        const axiosCookieJarSupport = await import('axios-cookiejar-support');
        const axios = require('axios').default;
        const tough = require('tough-cookie');

        const jar = new tough.CookieJar();
        const client = axiosCookieJarSupport.wrapper(axios.create({ jar }));
        //console.log('⚠️ API GET request builder with token:'+token);
        jar.setCookieSync(
            `PHPSESSID=${token}; Path=/; Secure; HttpOnly`,
            'https://50five-snl.evc-net.com'
        );
        jar.setCookieSync(
            `SERVERID=${auth_token.serverid}; Path=/; Secure; HttpOnly`,
            'https://50five-snl.evc-net.com'
        );


        const url = `https://50five-snl.evc-net.com${endpoint}${endpointQuery.startsWith('?') ? '' : '?'}${endpointQuery}`;
        console.log(`⚠️ API GET request builder with payload:${endpoint}${endpointQuery.startsWith('?') ? '' : '?'}${endpointQuery}`);
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

async function getSinglePointByIDX(idx, token){
    console.log('🔍 1.0: Get all chargepoints to filter on the idx ['+idx+']');
    const myPoints = await getMyChargePoints(token);    
    if(myPoints==null || !Array.isArray(myPoints) || myPoints.length === 0) {
        console.log('⚠️ 1.1: No chargepoints found in your account, can also mean there are no new details');
        return null;
    }
    console.log('✅ 1.1: Collected my ChargePoints and their details');
    //console.dir(myPoints, { depth: null });
    console.log('🔍 1.2: Now match on the idx ['+idx+']');
    const match = myPoints.find(item => item.idx === idx);
    if (match) {
        console.log('✅ 1.3: Found matching chargepoint:', match.idx);
        return match;
    } else {
        console.log('⚠️ 1.3: No chargepoint found with that idx');
        return null;
    }
}

async function getSinglePointBySerial(serial, token){
    console.log('🔍 1.0: Get all chargepoints to filter on the serial ['+serial+']');
    const myPoints = await getMyChargePoints(token);    
    if(myPoints==null || !Array.isArray(myPoints) || myPoints.length === 0) {
        console.log('⚠️ 1.1: No chargepoints found in your account, can also mean there are no new details');
        return null;
    }
    console.log('✅ 1.1: Collected my ChargePoints and their details');
    //console.dir(myPoints, { depth: null });
    console.log('🔍 1.2: Now match on the serial ['+serial+']');
    const match = myPoints.find(item => item.serial === serial);
    if (match) {
        console.log('✅ 1.3: Found matching chargepoint:', match.serial);
        return match;
    } else {
        console.log('⚠️ 1.3: No chargepoint found with that serial');
        return null;
    }
}

async function getSinglePoint(id, token) {
    const encodedQuery = `requests=%7B"0"%3A%7B"handler"%3A"%5C%5CLMS%5C%5CEV%5C%5CAsyncServices%5C%5CRechargeSpotsAsyncService"%2C"method"%3A"overview"%2C"params"%3A%7B"rechargeSpotId"%3A"${id}"%7D%7D%7D&metricKey=RechargeSpotDashboard_149`;
    console.log('🔍 3.0: Attempt to retrieve chargepoint status');
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
    console.log('🔍 2.0: Get all chargepoints from the account');
    let chargePoints = await (async () => {
    try {
        const result = await getApiData(token, "requests=%7B%220%22%3A%7B%22handler%22%3A%22%5C%5CLMS%5C%5CEV%5C%5CAsyncServices%5C%5CDashboardAsyncService%22%2C%22method%22%3A%22networkOverview%22%2C%22params%22%3A%7B%22mode%22%3A%22id%22%7D%7D%7D&metricKey=EndUserRechargeSpotListView_99");
        console.log('✅ 2.1: Data received from Chargepoint list API:');
        console.dir(result, { depth: null });
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
    // 🔍 construct the base 50five point data
    console.log('✅ 2.3: All charge point collected, return structure');
    let promises = chargePoints.map((point) => {
        console.log(`🔌 IDX: ${point.IDX}`);
        console.log(`   Name: ${point.NAME}`);
        console.log(`   Address: ${point.ADDRESS}`);
        console.log(`   Channel: ${point.CHANNEL}`);
        const shell_id_raw = point.ADDRESS?.split(',')[0]?.trim();
        const shell_id = /^[0-9A-Za-z]+$/.test(shell_id_raw) ? shell_id_raw : null;
        console.log(`   Recharge IDX: ${shell_id}`);  
        const result = {
            serial: shell_id,
            idx: point.IDX,
            name: point.NAME,
            channel: point.CHANNEL
        };
        console.log('✅ 2.4: Located chargepoint with serial '+result.serial);
        console.dir(result, { depth: null });
        return result;
    });
    return (await Promise.all(promises)).filter(cp => cp !== null);
}

async function getMyChargePointDetails(point, token)
{  
    // 🔍 Attempt to parse into details per chargepoint
    console.log('🔍 4.0: Get chargepoint status details with idx: '+point.idx);

    var pointdetails = getSinglePoint(point.idx, token).then(cp => {
        if(cp==null) return null;
        cp.serial = point.serial;
        cp.idx = point.idx;
        cp.name = point.name;
        cp.channel = point.channel;
        console.log('✅ 2.5: Located chargepoint status for ['+cp.name+']');
        //console.dir(cp, { depth: null });
        return cp;
    },
    err => {
        console.log('❌ 2.5: Retrieving single point ['+point.name+'],'+err);
        return null;
    });
    return pointdetails;
}


module.exports = getSinglePointBySerial
module.exports.list = getMyChargePoints
module.exports.pointDetails = getMyChargePointDetails
module.exports.cards = getMyChargeCards
module.exports.startSession = startSession
module.exports.stopSession = stopSession
module.exports.requestUpdate = requestUpdate
module.exports.SessionLog = SessionLog
module.exports.TransactionHistory = TransactionHistory
module.exports.getAuthCookie = getAuthCookie
module.exports.clearAuthCookie = clearAuthCookie