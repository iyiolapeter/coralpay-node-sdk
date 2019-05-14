import fs from "fs";
import { IncomingHttpHeaders } from "http";
import * as openpgp from "openpgp";
import path from "path";
import { RequestAPI, RequiredUriUrl } from "request";
import request from "request-promise";
import keymanager = require("../keymanager");

openpgp.config.ignore_mdc_error = true;
openpgp.config.use_native = true;

const STAGING_URL = "https://testdev.coralpay.com/cgateproxy/";
const PROD_URL = "";

const INVOKE_REFERENCE_API = "api/invokereference";
const QUERY_TRANSACTION_API = "api/statusquery";

const CORAL_ENCRYPTION_KEY = fs.readFileSync(path.resolve(__dirname, "./../assets/coral.pub.key"), "utf8");

type Logger = (...args: any) => any;
export interface CoralConfig {
	privateKeyPath: string;
	coralEncryptionKey?: string;
	merchantId: string;
	terminalId: string;
	userName: string;
	password: string;
	passphrase?: string;
	live?: boolean;
	trace?: boolean | Logger;
}

interface CoralKeyStore {
	init: boolean;
	encryptionKey: any;
	decryptionKey: any;
	decryptionKeyPublic: any;
}

interface ApiResponse {
	statusCode: number;
	headers: IncomingHttpHeaders;
	body: any;
}

export interface InvokeReferenceRequest {
	Channel: string;
	Amount: number;
	TraceID?: string;
}

export interface StatusQueryRequest {
	Amount: number;
	TransactionID: string;
}

export enum METHOD {
	POST = "POST",
	GET = "GET",
}

const readFile = (file: string) => {
	if (fs.existsSync(file)) {
		return fs.readFileSync(file, "utf8");
	}
	throw new Error(`${file} does not exist`);
};

const validateExistence = (obj: object, ...keys: string[]) => {
	const invalid = [];
	for (const key of keys) {
		if (!(obj as any)[key]) {
			invalid.push(key);
		}
	}
	if (invalid.length > 0) {
		throw new Error(`${invalid.join(", ")} not provided`);
	}
	return true;
};

export class CoralPay {
	private get baseUrl() {
		return this.config.live ? PROD_URL : STAGING_URL;
	}

	public keyStore: Partial<CoralKeyStore> = { init: false };
	private trace: boolean;
	// tslint:disable-next-line: no-console
	private logger: Logger = console.log;
	private baseRequest: RequestAPI<request.RequestPromise, request.RequestPromiseOptions, RequiredUriUrl>;
	constructor(private config: CoralConfig) {
		validateExistence(config, "privateKeyPath", "merchantId", "terminalId", "userName", "password");
		if (this.config.live === undefined) {
			this.config.live = false;
		}
		if (this.config.passphrase === undefined) {
			this.config.passphrase = "";
		}
		if (this.config.coralEncryptionKey === undefined) {
			this.config.coralEncryptionKey = CORAL_ENCRYPTION_KEY;
		}
		if (this.config.trace === true) {
			this.trace = true;
		} else if (typeof this.config.trace === "function") {
			this.trace = true;
			this.logger = this.config.trace;
		} else {
			this.trace = false;
		}
		this.baseRequest = request.defaults({
			baseUrl: this.baseUrl,
			simple: false,
			resolveWithFullResponse: true,
		});
	}

	public async decryptResponse(body: string) {
		await this.init();
		if (!body || body === "") {
			return body;
		}
		const binaryEncryptedResponse = Buffer.from(body, "hex").toString("binary");
		const armored = keymanager.enarmor(binaryEncryptedResponse, "PGP MESSAGE");
		const msgObj = await openpgp.message.readArmored(armored);
		const decrypted = await openpgp
			.decrypt({
				message: msgObj,
				privateKeys: this.keyStore.decryptionKey,
			})
			.then(plaintext => {
				return plaintext.data;
			});
		try {
			return JSON.parse(decrypted as string);
		} catch (error) {
			this.log("Response is not valid JSON");
			return decrypted as string;
		}
	}

	public async encryptRequest(payload: object) {
		return await keymanager.encryptRequest(JSON.stringify(payload), this.keyStore.encryptionKey, { format: "hex", debug: false, showVersion: false });
	}

	public async customRequest(method: METHOD, uri: string, data?: object) {
		await this.init();
		let body: string = "";
		const headers = {
			"Content-Type": "text/plain",
		};
		this.log("Base URL: ", this.baseUrl);
		this.log("URI: ", uri);
		this.log("Method: ", method);
		this.log("Headers: ", headers);
		if (data && method === METHOD.POST) {
			this.log("Data: ", JSON.stringify(data, null, 2));
			body = await this.encryptRequest(data);
		}
		this.log("Encrypted Form: ", body);
		const self = this;
		const response = await this.baseRequest({
			method,
			uri,
			body,
			headers,
			transform: async (resbody, res) => {
				self.log("Raw Response: ", resbody);
				return {
					statusCode: res.statusCode,
					headers: res.headers,
					body: await self.decryptResponse(resbody),
				};
			},
		});
		this.log("Response from CGATE", response);
		return response as ApiResponse;
	}

	public async invokeReference(payload: InvokeReferenceRequest) {
		validateExistence(payload, "Channel", "Amount");
		const { Channel, Amount, TraceID } = payload;
		const { userName: UserName, password: Password, terminalId: TerminalId, merchantId: MerchantId } = this.config;
		const body = {
			RequestHeader: {
				UserName,
				Password,
			},
			RequestDetails: {
				TerminalId,
				Channel,
				Amount,
				MerchantId,
			},
		};
		if (TraceID) {
			(body.RequestDetails as any).TraceID = TraceID;
		}
		return await this.customRequest(METHOD.POST, INVOKE_REFERENCE_API, body);
	}

	public async queryTransaction(payload: StatusQueryRequest) {
		validateExistence(payload, "Amount", "TransactionID");
		const { Amount, TransactionID } = payload;
		const { userName: UserName, password: Password, terminalId: TerminalId, merchantId: MerchantId } = this.config;
		const body = {
			RequestHeader: {
				UserName,
				Password,
			},
			RequestDetails: {
				TerminalId,
				MerchantId,
				Amount,
				TransactionID,
			},
		};
		return await this.customRequest(METHOD.POST, QUERY_TRANSACTION_API, body);
	}

	private async init() {
		if (this.keyStore.init === true) {
			return true;
		}
		this.keyStore.encryptionKey = await keymanager.importKeys(this.config.coralEncryptionKey!, { format: "hex", debug: false, showVersion: false }); // (await openpgp.key.readArmored(CORAL_ENCRYPTION_KEY)).keys;
		this.keyStore.decryptionKey = (await openpgp.key.readArmored(readFile(this.config.privateKeyPath))).keys[0];
		await this.keyStore.decryptionKey.decrypt(this.config.passphrase);
		this.keyStore.init = true;
		return true;
	}

	private log(...args: any) {
		if (this.trace) {
			this.logger(...args);
		}
	}
}
