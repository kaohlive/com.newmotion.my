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
    var salt = await getsalts();
    var saltedKey = Buffer.concat([salt.prepend,Buffer.from(key),salt.append]);
    var paddinglength=24-saltedKey.length;
    var key = Buffer.concat([saltedKey, Buffer.alloc(paddinglength,paddinglength)]);
    var cipher = crypto.createCipheriv('aes-192-cbc',key,salt.iv).setAutoPadding(true);
    var crypteddata = cipher.update(str,null,'hex');
    crypteddata+=cipher.final('hex');
    return crypteddata.toString('hex');
}

module.exports.decrypt = async function(cryptedstr,key){
    var salt = await getsalts();
    var saltedKey = Buffer.concat([salt.prepend,Buffer.from(key),salt.append]);
    var paddinglength=24-saltedKey.length;
    var key = Buffer.concat([saltedKey, Buffer.alloc(paddinglength,paddinglength)]);
    var decipher = crypto.createDecipheriv('aes-192-cbc',key,salt.iv).setAutoPadding(true);
    var decrypteddata = decipher.update(cryptedstr,'hex','ascii');
    decrypteddata+=decipher.final('ascii');
    return decrypteddata;
}