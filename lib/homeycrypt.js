'use strict'
const os = require('os');
const crypto = require('crypto');

async function getsalts()
{
    var mac = await os.networkInterfaces().wlan0[0].mac.split(':');
    var macbuffer=Buffer.from(mac.join(''),'hex');
    let salt={
        prepend: macbuffer.slice(3,6),
        append: macbuffer.slice(0,3),
        iv: Buffer.concat([macbuffer,Buffer.from('00000000000000000000','hex')])
    }
    return salt;
}

module.exports.crypt = async function(str,key){
    console.log('creating device specifick salts');
    var salt = await getsalts();
    console.log('check on max key length: '+key.length)
    if(key.length>=17)
        key = key.substr(0,17);
    console.log('creating salted encryption key using key with length: '+key.length)
    var saltedKey = Buffer.concat([salt.prepend,Buffer.from(key),salt.append]);
    console.log('salted key length in total '+saltedKey.length)
    var paddinglength=24-saltedKey.length;
    var key = Buffer.concat([saltedKey, Buffer.alloc(paddinglength,paddinglength)]);
    var cipher = crypto.createCipheriv('aes-192-cbc',key,salt.iv).setAutoPadding(true);
    var crypteddata = cipher.update(str,null,'hex');
    crypteddata+=cipher.final('hex');
    return crypteddata.toString('hex');
}

module.exports.decrypt = async function(cryptedstr,key){
    var salt = await getsalts();
    if(key.length>=17)
        key = key.substr(0,17);
    var saltedKey = Buffer.concat([salt.prepend,Buffer.from(key),salt.append]);
    var paddinglength=24-saltedKey.length;
    var key = Buffer.concat([saltedKey, Buffer.alloc(paddinglength,paddinglength)]);
    var decipher = crypto.createDecipheriv('aes-192-cbc',key,salt.iv).setAutoPadding(true);
    var decrypteddata = decipher.update(cryptedstr,'hex','ascii');
    decrypteddata+=decipher.final('ascii');
    return decrypteddata;
}