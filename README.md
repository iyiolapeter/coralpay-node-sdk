# coralpay-node-sdk

Coral Pay NodeJS SDK

## Installation

coralpay-node-sdk requires gpg to be installed on the environment to run.

```sh
npm install --save coralpay-node-sdk
```

## Usage

### Import

```typescript
import { CoralPay } from "coralpay-node-sdk";
```

or

```javascript
const { CoralPay } = require("coralpay-node-sdk")
```

### Instantiate

```typescript
const myPrivateKey = fs.readFileSync("/path/to/privateKey", "uft8");

const client = new CoralPay({
 privateKey: myPrivateKey,
 //isInsecureTwoByteHashPrivateKey: true // if privateKey is a legacy pgp private key generated using a two byet hash
 // passphrase: "...", // private key passphrase if protected
 // coralPublicKey: "...", // custom CGATE public key, will override sdk's inbuilt keys 
 userName: "Skibo", // cgate userName
 password: "1014054fgh@0", // cgate password
 merchantId: "1057FS010000021", // cgate merchantId
 terminalId: "1057FS01", // cgate terminalId
 trace: false, /* set true to emit debug logs(uses console.log by default) or pass your custom logging fuction of this form (...args[]) => void */
 env: "test" // or prod for live environment
 // baseUrl: "http://10.14.0.1", // custom baseUrl that will proxy cgate requests (For proxies or gateways whose IP has been whitelisted on CGATE) 
});
```

### Invoke Reference

```typescript
const invokeReferenceResponse = await client.invokeReference({ 
    Amount: 1200, // Amount to charge 
    Channel: "WEB", // Channel (WEB, USSD, POS)
    TraceID: "1234567890" // Optional TraceID
    // TransactionType: "0", // TransactionType(0 = purchase, 30=Cashout, 35=Cashin, 50= Bill Payment)
    // TerminalId: "...", // new TerminalId to use for this request only (overrides terminalId passed during instantiation)
    // SubMerchantName: "..." // SubMerchantName to use for this request
});
```

### Status Query

```typescript
const verificationResponse = await client.queryTransaction({ Amount: 1200, TransactionID: "19051403000000004299" });
```

### Decrypt Payload

```typescript
const testResponse =
 "85010C0363B256F42F0382020108009EA68E0FECCA50539E34D51ED22232D2C3CD16E7C70CBD928A09EF7FFEE928E47BFC4455E3C83FF7B8BE533A88BAB554246B75C1C94C22073B2EBA392C187F9DEC4B3B10DB9C0272C9969DE96B3E0D6EA70919B80843491E99BEC2D7033FE53DB471838CF3D01FFEBA2F9F12102049C63F1F168BCE7E69C406ED56957841F41102738314A3F23191A768A53CA1DF6A3A063F5E8DE38E1733F4965C028A309242E0391DEB0B27AF79E170E0161D2A405D82BEDDB93A4885C181C4C298F1505F0232A1403EA3BE61009DEB65F6B777778BC238871B196A3BC21033EF0D59BF5EA899379C66D3F39CA93694D26F275090F642F71DFD4D4A8C4C5B2E926220D6BC15C9A3587B91FD054705D4AA026054DDF66923EAB1233C68DE15F97B26E6B0933DB4067B34EA510E22AF25E6FDF78CCEDB99E0785D3A90523948C671687889034F6DCE18809C3683004039DFAB19EFF02CAA6A3AF19AA81F2FB8BAD54D33441904A7CED65D73ACE83F4CB869ABC6534A6949C1962F70046F399EAA1A2209A58921BAD5F86F0BFE5638722BA081462C74E9B1F34D4485A474595D1B62F8E35D0DA2BD4719895D";
const asJson = true; /* (attempts JSON.parse on result before returning) or  set false if encrypted data is not a json object */
const decrypted = await client.encryption.decrypt(testResponse, asJson);
```

### Fetch USSD Banks

```typescript

const banks = client.bankUtil.list;
/*
returns

[
 {
  bankName: "Access Bank",
  bankCode: "access",
  bankUssd: `*901*000*{{REFERENCE}}#`,
 },
 {
  bankName: "Eco Bank",
  bankCode: "eco",
  bankUssd: `*326*000*{{REFERENCE}}#`,
 },
 {
  bankName: "FCMB",
  bankCode: "fcmb",
  bankUssd: `*329*000*{{REFERENCE}}#`,
 },
 {
  bankName: "Fidelity Bank",
  bankCode: "fidelity",
  bankUssd: `*770*000*{{REFERENCE}}#`,
 },
 {
  bankName: "First Bank",
  bankCode: "fbn",
  bankUssd: `*894*000*{{REFERENCE}}#`,
 },
 ...
 ]
 */
```

### Get Complete Bank USSD String  

```typescript
const bankCode = "gtb";
const reference = "1234";
const bankString = client.bankUtil.interpolate(bankCode, reference); // returns *737*000*1234#

```
