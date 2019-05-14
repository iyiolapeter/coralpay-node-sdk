/**
 * Created by osemeodigie on 13/05/2018.
 * objective: building to scale
 *
 * @package CoralPayPGPLibrary
 */

const fs = require('fs');
const GPG = require('gpg');
const shelljs = require('shelljs');
const misc = require('locutus/php/misc');




/**
 * GPG status output file descriptor. The status file descriptor outputs
 * detailed information for many GPG commands. See the second section of
 * the file <b>doc/DETAILS</b> in the
 * {@link http://www.gnupg.org/download/ GPG package} for a detailed
 * description of GPG's status output.
 */
const FD_STATUS = 3;

/**
 * Command input file descriptor. This is used for methods requiring
 * passphrases.
 */
const FD_COMMAND = 4;


const defaultArguments = [
 // '--status-fd ' + FD_STATUS,
 // '--command-fd ' + FD_COMMAND,
 '--exit-on-status-write-error',
 '--no-permission-warning',
  '--no-secmem-warning',
  '--no-tty',
  '--no-default-keyring', // ignored if keying files are not specified
  '--no-options'          // prevent creation of ~/.gnupg directory
];


/**
 * Used to import a key into the GPG keychain.
 * 
 * @param {*} keyContentToImport 
 * @param {*} importOptions 
 */
const importKeys = async (keyContentToImport, importOptions = {}) => {
  const argOptions = importOptions || {
      debug: false
  };
  return new Promise((resolve, reject) => {
    GPG.importKey(keyContentToImport, function(importError, result, fingerprint) {
      if(!importError) {
        if((argOptions.debug != undefined) && argOptions.debug) {
          console.log(`\n\nSuccesfully imported the key!!! \n\nImported Key Data: \n${result} \n\n`);
        }

        const keyId = (fingerprint != null && fingerprint != undefined) ? fingerprint : null;
        return resolve(keyId);
      }

      if((argOptions.debug != undefined) && argOptions.debug) {
        console.log(`\nError occurred while importing key!\n`);
      }
      return reject(new Error(`Error occurred while importing key!`));
    });
  });
};

exports.importKeys = importKeys;


/**
 * This method is used to encrypt the request to be sent to Cgate.
 * 
 * @param {*} plainMessage - the plain request to encrypt
 * @param {*} keyIdForPublicKey - the Long/Short ID for the imported public key
 * @param {*} encryptOptions - options to control how the output is generated
 */
const _encryptRequest = async (plainMessage, keyIdForPublicKey, encryptOptions = {}) => {
  const argOptions = encryptOptions || {
      homedir: null,
      armor: true,
      debug: false,
      format: 'binary', // binary , hex or armor
      showVersion: false
  };

  if(keyIdForPublicKey == undefined || keyIdForPublicKey == null) {
    if((argOptions.debug != undefined) && argOptions.debug) {
      console.log(`Error: Key Not Found with Id`);
    }
    throw new Error(`Error: Key Not Found with Id`);
    return;
  }

  let optionArgs = [
    '--default-key', keyIdForPublicKey,
    '--recipient', keyIdForPublicKey,
    '--trust-model', 'always' // so we don't get "no assurance this key belongs to the given user"
  ];

  if((argOptions.homedir != undefined) && (argOptions.homedir != null) && argOptions.homedir) {
    optionArgs.push('--homedir').push(argOptions.homedir);
  }

  if(((argOptions.armor != undefined) && argOptions.armor) || 
    ((argOptions.format != undefined) && argOptions.format.toLowerCase() === 'armor')) {
    optionArgs.push('--armor');
  }

  // Add the default options
  optionArgs = optionArgs.concat(defaultArguments);

  if((argOptions.debug != undefined) && argOptions.debug) {
    console.log(`\nCalling GPG with options: \n${JSON.stringify(optionArgs)}\n`);
  }

  return new Promise((resolve, reject) => {
    GPG.encrypt(plainMessage, optionArgs, function(error, encryptedBuffer) {
        if(error) {
          if((argOptions.debug != undefined) && argOptions.debug) {
            console.log(`\nError occurred while encrypting request with GPG. Error: \n${error}\n`);
          }
          reject(error);
        }
        const outputString = ((argOptions.format != undefined) && argOptions.format.toLowerCase() === 'hex') ? 
          encryptedBuffer.toString("hex") : 
          encryptedBuffer.toString();
    
        if((argOptions.debug != undefined) && argOptions.debug) {
          console.log(`\nSuccessfully Encrypted With GPG: \n\n${outputString}\n`);
        }
    
        resolve(outputString);
      });
  })
};

exports.encryptRequest = _encryptRequest;



/**
 * This method is used to decrypt the response that is received from Cgate.
 * 
 * @param {*} encryptedResponse - the encrypted response to decrypt
 * @param {*} keyIdForPrivateKey - the Long/Short ID for the imported public key 
 * @param {*} passphrase - the passphrase associated with the Private key
 * @param {*} decryptOptions - options to control how the decryption process flows
 */
const _decryptRequest = async (encryptedResponse, keyIdForPrivateKey, passphrase, decryptOptions = {}) => {
  const argOptions = decryptOptions || {
      homedir: null,
      armor: true,
      debug: false,
      format: 'binary', // plain, hex, or armor
      showVersion: false
  };

  if(keyIdForPrivateKey == undefined || keyIdForPrivateKey == null) {
    if((argOptions.debug != undefined) && argOptions.debug) {
      console.log(`Error: Key Not Found with Id`);
    }
    throw new Error(`Error: Key Not Found with Id`);
    return;
  }

  let optionArgs = [
    '--skip-verify',
    '--ignore-mdc-error',
   // '--options /dev/null', // ignore any saved options
    //'--pinentry-mode loopback', // Since 2.1.13 we can use "loopback mode" instead of gpg-agent
    '--default-key', keyIdForPrivateKey,
    '-u', keyIdForPrivateKey,
    '--trust-model', 'always', // so we don't get "no assurance this key belongs to the given user"
    // 'echo your_password | gpg --batch --yes --passphrase-fd 0',
    '--batch',// '--quiet',
    '--yes', 
    // '--passphrase-file <(echo password)',
    '--passphrase', passphrase
  ];

  if((argOptions.homedir != undefined) && (argOptions.homedir != null) && argOptions.homedir) {
    optionArgs.push('--homedir').push(argOptions.homedir);
  }

  if(((argOptions.armor != undefined) && argOptions.armor) || 
    ((argOptions.format != undefined) && argOptions.format.toLowerCase() === 'armor')) {
    optionArgs.push('--armor');
  }

  // Add the default options
  optionArgs = optionArgs.concat(defaultArguments);

  if((argOptions.debug != undefined) && argOptions.debug) {
    console.log(`\nCalling GPG with options: \n${JSON.stringify(optionArgs)}\n`);
  }

  const binaryEncryptedResponse = Buffer.from(encryptedResponse, "hex").toString('binary');
  const armoredBinMessage = enarmor(binaryEncryptedResponse, 'PGP MESSAGE');
  // console.log("\n\nThe Armored Message:\n\n", armoredBinMessage, '\n\n')
  // return;

  // -u ${keyIdForPrivateKey} --batch --passphrase-fd 0`
  // const decryptCommand = `echo "password" | gpg --decrypt`;
  // shelljs.exec(decryptCommand, function(code, stdout, stderr) {
  //   console.log('Exit Code: ', code);
  //   console.log('Program Output: ', stdout);
  //   console.log('Program stderr: ', stderr);

  // });
  // return;
  return new Promise((resolve, reject)=> {
    GPG.decrypt(armoredBinMessage, optionArgs, function(error, decryptedBuffer) {
        if(error) {
          if((argOptions.debug != undefined) && argOptions.debug) {
            console.log(`\nError occurred while decrypting response with GPG.\n${error}\n`);
          }
          reject(error);
        }
        const outputString = ((argOptions.format != undefined) && argOptions.format.toLowerCase() === 'hex') ? 
          decryptedBuffer.toString("hex") : 
          decryptedBuffer.toString();
    
        if((argOptions.debug != undefined) && argOptions.debug) {
          console.log(`\nSuccessfully Decrypted With GPG: \n\n${outputString}\n`);
        }
    
        resolve(outputString);
      });
  })
};

exports.decryptRequest = _decryptRequest;


/**
 * Utility function to convert Uint8 array to a binary string.
 * 
 * @param {*} u8Array 
 */
const convertUint8ArrayToBinaryString = (u8Array) => {
	var i, len = u8Array.length, binaryString = "";
	for (i=0; i<len; i++) {
		binaryString += String.fromCharCode(u8Array[i]);
	}
	return binaryString;
}

/**
 * Utility function to convert from a binary string to an Uint8 array.
 * 
 * @param {*} binaryString 
 */
const convertBinaryStringToUint8Array = (binaryString) => {
	var i, len = binaryString.length, u8_array = new Uint8Array(len);
	for (var i = 0; i < len; i++) {
		u8_array[i] = binaryString.charCodeAt(i);
	}
	return u8_array;
}

  /**
   * Ord function
   * @param {*} str 
   */
  const ord = (str) => {
    return str.charCodeAt(0);
  }


  /**
   * @see http://tools.ietf.org/html/rfc4880#section-6.2
   */
  const header = (marker) => {
      return '-----BEGIN ' + marker.toUpperCase() + '-----';
  }

  /**
   * @see http://tools.ietf.org/html/rfc4880#section-6.2
   */
  const footer = (marker) => {
      return '-----END ' + marker.toUpperCase() + '-----';
  }

  /**
   * @see http://tools.ietf.org/html/rfc4880#section-6
   * @see http://tools.ietf.org/html/rfc4880#section-6.1
   */
  const crc24 = (data) => {
      crc = 0x00b704ce;
      for (i = 0; i < data.length; i += 1) {
          crc ^= (ord(data[i]) & 255) << 16;
          for (j = 0; j < 8; j += 1) {
              crc <<= 1;
              if (crc & 0x01000000) {
                  crc ^= 0x01864cfb;
              }
          }
      }
      return crc & 0x00ffffff;
  }


  const wordwrap = (word, width, breakChar, shouldCut) => {
    breakChar = breakChar || 'n';
    width = width || 76;
    shouldCut = shouldCut || false;

    if(!word) {
      return word;
    }

    const wordLength = word.length;
    let startIndex = 0;
    let wrappedWordLines = [];
    while(startIndex < wordLength) {
      const acceptableWidth = ((startIndex + width) > wordLength) ? (wordLength - startIndex) : width;
      wrappedWordLines.push(word.substr(startIndex, acceptableWidth));
      startIndex += width;
    }
    return wrappedWordLines.join(breakChar);
  }

  /**
   * @see http://tools.ietf.org/html/rfc4880#section-6
   * @see http://tools.ietf.org/html/rfc4880#section-6.2
   * @see http://tools.ietf.org/html/rfc2045
   */
  const enarmor = (data, marker = 'MESSAGE', headers = {}) => {
    text = header(marker) + "\n";
    const headerKeys = Object.keys(headers);
    for (i = 0; i < headerKeys.length; i += 1) {
      text += headerKeys[i] + ': ' + headers[headerKeys[i]] + "\n";
    }
    
    const base64Data = Buffer.from(data, 'binary').toString('base64');
    const packDataToUInt32BE = misc.pack('N', crc24(data)); // pack line here
    // console.log("\n\ndgdfgfd ", subStringOfPackedData, "\n\n")

    const base64PackedData = Buffer.from(packDataToUInt32BE.substr(1), 'binary').toString('base64');

    // const base64PackedData = new Buffer(substr(pack('N', crc24(data)), 1), 'binary').toString('base64');

    text += "\n" + wordwrap(base64Data, 76, "\n", true);
    text += "\n" + '=' + base64PackedData + "\n";
    text += footer(marker) + "\n";
    return text;
  }

  exports.enarmor = enarmor;






// TEST BEGINS HERE...

const publickey = `-----BEGIN PGP PUBLIC KEY BLOCK-----
Version: BCPG C# v1.6.1.0

mQENBFwvufwBCAC9ZI0h5DejqbbTuJeSVeizkYZVmGxYFwX80MVyBi0xVs6gDLiw
YhfksNjHRs93wl3+n+9c23XxtqXlXfUDJ0J+pyprDmF+yiU/b2Le52oMPiYYvUt0
vYgVh65/IBzm0WK/HNyTjXH2a8AZuS29xvtDSahqW8UOm3i7W+jwBFrpc1f+Lsok
KFPEKvtAmQ8NI3W7bGfu0RDOa5JQwpYsfAselkyor9Az6o+Xt+3/xXF4otAfi57r
u4TOo+3CnRt16XdoKM+4/isAQj9Pq7YTj1SN83wO8454/l2Ye5chh7P5lNiNpDrk
VdMGr1PAokQMfn/KNrc5TONWi3sZDX0i0QA7ABEBAAG0GHRvYmlha2ludGFyb0B5
YWhvby5jby51a4kBHAQQAQIABgUCXC+5/AAKCRBCsCk8ucAGnFvsCACOj81XnaCg
azRw8O6gLupcx70F1N8E0PoAvrYA5fkPCRm9OCb1HiMI4iF3ms2cHj3TNR5XJzNy
a/r/CZRIG9wyeNwALhyw/Ik47LM3hN3ow7qOXtGTSnT/tfsgdqIK6jl2yK/oTt7N
OKGZzyxSTBappykQupqinxol4KjbATP2WWLyc51PEE08TQZZdFnq9UN3CTlzKitV
9ITAO5LU9LN0WciSAXYJOO6ux/z9aqKsGzWRaAdpb3bpR6GjWKAoutjonixWjQOF
2+2J99HkeirYI4jWEgx5BruNwsDh2YE8ATrUqOfn8gmdAYGdx329OyJepLowhKYM
nzAdlEM9n0zv
=/i/9
-----END PGP PUBLIC KEY BLOCK-----`;

const privatekey = `-----BEGIN PGP PRIVATE KEY BLOCK-----
Version: BCPG C# v1.6.1.0

lQOsBFxS25YBCACMSURWWiw6VSVkY/xZTAU9+zhNnTm3BA3Qj3h4yVKz2EKTKJr8
iHHgtSjS2xhjrB6KQuW3S7pHBim5t1w4gTU8g6o/wKiG8xlHzQgF/2xBVYlvKjwf
HIhl72ELXiIYt8yVMctmtLvqhlKt3ELDBkcBlFkQjKhfcOVBs0Dt5u7XBl7mH8yj
CUMCzxF1WpTLZyIZ4Mpi5P/yOjSDadaFI2kdgII+toPyblEsgy03P6VbPEOTNkK+
7Ur3fCACJ/KpjmmRKpPPjnl6tO0RqhidDURkjkazCxryRWjBwSF+/rQJew2Ip78w
PxYq34YrnCEvN3r9y3cVB5fMFPv22U310hoDABEBAAH/AwMCXH0Z5dD29dNgloG7
SiNiXbd11CGF7T2SAnAGIXfVKBfOAQe5Yb41XVYYBXyLWcc+Tq1+vaNI6NcV8adp
Lpp5k79OQvnaif091CEf1yJ7W07xn4IayKUjBpNJUXkN6v3bf4Q2v2+Dlimaz38Y
zXBlvCcOddZvAKOJljjk57dCidNSQiPN5/owSJmw6RjrsBQULlMMTByv38FaLtK8
MXx7SSNxvZPSz8t2KBCfe2ttjD6pkXb9GZj74AfKi3keVlmCf0c/B0grwKthnRLI
MFuh4yHtZA7h1zxcYaC+EVTZg3CxlXG2FBDbqywgmwQY/uGOdunNKx1xU1ObXbpU
uFWSpAkHFoC4PNxYVRgJDZdLnY81gpWesi6LDp3xS3gesdoa3TjTM+tYgasAx2ru
ns3O8Svvnf4pnTYqgSem43oUcaW76uMoxqSrQICIabRqT3FXfwyins30mb2NjEKQ
PlEqC4x3owrf/xEB/ceAQl/WdoOCCzY76zKAbDu2MkXkgM/gHUelx3NEivNJEsJZ
qMi//ZGPg3sZeJYZP9/pHMs5vUppEgEZX1leth4jlVxn63fISteeRHDx8/8lUBHq
Gnw4+31xEmQEjmBaiSvlO4B2SfCdX2ftsAD8wgPJTQt0JDoBjJvuE2Jodt/4kW88
GTwao8yfZ0IcSzBIYwoBagafFdotNZSoZTMnu+5dCiw3/noiSGo6SHKJN3qrEZj3
WW+2X2HXzFwto1SvbgNfDoWwujhjVJ490BBTqeIygnSmN1SIWcbi+RaL8G/42igc
w2c/YE4bJPBR5dx6o+2PBUXB83Aan0MVxtjfjD3PCntIHmwnLpOeCyqmTH9iyJwI
9/v0NYaCUwi8mJIeQHJXjmBeNGOTVs2Rd51XK7XP9LQSc2FtcGxlQGV4YW1wbGUu
Y29tiQEcBBABAgAGBQJcUtuWAAoJEMacGee9+JGPzdwH/iVWYIe3Ul4CGiLR2oFw
wt/4hIucgRQ8xTMInEFm/i5rxGdSCbNdsVqaUiMgmAXLZyihnwjaCAU/w7fcafuP
JE7HnHjUgYvqMNGAer4Ze/j27o7pCMkpItdM86JM3SXTiMAsoaTuIEBbEWZPDa0a
I4rtwfw3AkwCZywfOCjmNQVm83nidcrWHeoZVyngXT7a1/KoiQ4t1sXZmXcxGV6s
4t4OeTYFy+9xnF2Il865r6w1E5KPzkZKIegCG72lofVgLrhEpCXHQvDWn5vN7PCk
P6HmDSwF/cVR8wRw/9VfVZ6CASKIipb0v8rxnNKDtAeroWm01OMf5vyapTBNGLLb
jlY=
=HpL9
-----END PGP PRIVATE KEY BLOCK-----`;

const passphraseToUse = `password`; // `yourPassphrase`; //what the privKey is encrypted with


/**
 * Used to Test the Encryption part
 */
const testEncrypt = async () => {
  const extraOptions = {
      format: 'hex', // binary , hex or armor
      // armor: true,
      debug: true,
      showVersion: false
  };

  //const jsonRequest = '{"message":"Hello, World shdfsdjf uggfukdsug fkdsug!"}';
  const jsonRequest = '{"RequestHeader":{"UserName":"FishBone","Password":"1014051219@0"},"RequestDetails":{"TerminalId":"1057FS01","Channel":"WEB","Amount":1200,"MerchantId":"1057FS010000001","TraceID":"1234567890"}}';
  const publicKeyId = await importKeys(publickey, extraOptions); // import the public key
  console.log("PUBLIC ID TO USE: ",publicKeyId);
  // const publicKeyId = '7EA3EF3213F1648886FC41FD3F575986824BB3BA';

  return _encryptRequest(jsonRequest, publicKeyId, extraOptions);
};


/**
 * Used to Test the Decryption part
 */
const testDecrypt = async () => {
  const extraOptions = {
      format: 'plain', // plain , hex or armor
      // armor: true,
      debug: true,
      showVersion: false
  };

  const encryptedResponse = '85010c03c69c19e7bdf8918f0107ff4cb8025da89fe936e1a01e3643e484a4d7a2b2edfa5554c71d7ced38761e6d3617acb14a088d1afdca0e31febe08819d443693be1e7e789c1372b65f8517cf2e7b1392aecd38b27ef3b7059b723cfdf35f95d449bd23a3bd8985a745aa91ab4ca2b3266a4d5ab351291bfb7b19fd77592cbf36b390f88376e98c0ef278e74efd8c20bdd493eb3ac5bcc283dbebe537767b6e7ed8e022b16e7ab0005be1ab7bba3b1e8d394d68f2d351e420fa3cb126be021660ca51afa4a59fd83bf6871d3e91d02ffadf81b9f733688d1a678dc2f6bc02f6abc14cf6b810739473dab9f91606fa0a8d096932fbf18e4539e131e785e301e26388424805ceb97e26693c129822d26001d92be8beca334b45009504b291f673648797c3776476510ad1846d3adf192e7bc0b0ab6a2c16be9de486bd78c21becaa82aa0c64e13b5cb851d5ffde9c8d515fcedcf6d1121949a168229ab0119184e47e7961932aa20f373202673cdbbca3';
  // const privateKeyId = await importKeys(privatekey, extraOptions); // import the private key
  const privateKeyId = 'sample@example.com';
  // const privateKeyId = '7EA3EF3213F1648886FC41FD3F575986824BB3BA';
  const passphrase = passphraseToUse;

  return _decryptRequest(encryptedResponse, privateKeyId, passphrase, extraOptions);
};



/*
* The Call To The Actual Tests Here
*/

// testEncrypt().then((data)=>{
//     console.log("Encrypted: ",data);
// });
// testDecrypt().then((data)=>{
//     console.log("Decrypted: ",data);
// });

