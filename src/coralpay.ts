import fs from "fs";
import path from "path";
import { IncomingHttpHeaders } from "http";
import axios, { AxiosInstance } from "axios";
import { PGPEncryption } from "./encryption";
import { BankUtil } from "./bank-util";

const SANDBOX_URL = "https://testdev.coralpay.com/cgateproxy/";
const PRODUCTION_URL = "https://cgateweb.coralpay.com:567/";

const INVOKE_REFERENCE_API = "api/invokereference";
const QUERY_TRANSACTION_API = "api/statusquery";
const REFUND_PAYMENT_API = "api/refund";

const CORAL_TEST_ENCRYPTION_KEY = fs.readFileSync(path.resolve(__dirname, "./../assets/coral.test.pub.key"), "utf8");
const CORAL_PROD_ENCRYPTION_KEY = fs.readFileSync(path.resolve(__dirname, "./../assets/coral.prod.pub.key"), "utf8");

type Logger = (...args: any) => any;
export interface CoralConfig {
	privateKey: string;
	coralPublicKey?: string;
	merchantId: string;
	terminalId: string;
	userName: string;
	password: string;
	passphrase?: string;
	env: "test" | "prod";
	baseUrl?: string;
	trace?: boolean | Logger;
	isInsecureTwoByteHashPrivateKey?: boolean;
}

interface ApiResponse<T = Record<string, any>> {
	statusCode: number;
	statusMessage: string;
	headers: IncomingHttpHeaders;
	body: T | null;
}

export interface CoralPayResponse<T = Record<string, any>> {
	ResponseHeader: {
		ResponseCode: string;
		ResponseMessage: string;
	};
	ResponseDetails: T;
}

export interface InvokeReferenceRequest {
	Channel: string;
	Amount: number;
	TraceID?: string;
	TransactionType?: string;
	SubMerchantName?: string;
	TerminalId?: string;
}

export interface InvokeReferenceResponse {
	Reference: string;
	Amount: string;
	TransactionID: string;
	TraceID?: string;
}

export interface StatusQueryRequest {
	Amount: number;
	TransactionID: string;
	TerminalId?: string;
}

export interface StatusQueryResponse {
	responseCode: string;
	responsemessage: string;
	reference: string;
	amount: number;
	terminalId: string;
	merchantId: string;
	retrievalReference: string;
	institutionCode: string;
	shortName: string;
	customer_mobile: string;
	SubMerchantName: string;
	TransactionID: string;
	UserID: string;
	TraceID: string;
}

export interface RefundPaymentRequest {
	Reference: string;
	Amount: number;
	TransactionID: string;
	TerminalId?: string;
}

export interface RefundPaymentResponse {
	MerchantId: string;
	TerminalId: string;
	Amount: number;
	Reference: string;
	TransactionID: string;
}

export enum METHOD {
	POST = "POST",
	GET = "GET",
}

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
	#http: AxiosInstance;

	public encryption: PGPEncryption;
	public bankUtil: BankUtil;
	private trace: boolean;
	// tslint:disable-next-line: no-console
	private logger: Logger = console.log.bind(console);
	constructor(private config: CoralConfig) {
		validateExistence(config, "privateKey", "merchantId", "terminalId", "userName", "password", "env");
		if (this.config.trace === true) {
			this.trace = true;
		} else if (typeof this.config.trace === "function") {
			this.trace = true;
			this.logger = this.config.trace;
		} else {
			this.trace = false;
		}
		this.encryption = new PGPEncryption({
			privatekey: this.config.privateKey,
			publickey: this.config.coralPublicKey ?? this.config.env === "prod" ? CORAL_PROD_ENCRYPTION_KEY : CORAL_TEST_ENCRYPTION_KEY,
			passphrase: this.config.passphrase,
			logger: this.log.bind(this),
			isInsecureTwoByteHashPrivateKey: this.config.isInsecureTwoByteHashPrivateKey,
		});
		this.bankUtil = new BankUtil();
		this.#http = axios.create({
			baseURL: this.config.baseUrl ?? this.config.env === "prod" ? PRODUCTION_URL : SANDBOX_URL,
			validateStatus: () => {
				return true;
			},
		});
	}

	public async sendEncryptedRequest<T = Record<string, any>>(
		method: METHOD,
		uri: string,
		payload?: Record<string, any>,
		params?: Record<string, any>,
	) {
		let data = "";
		const headers = {
			"Content-Type": "text/plain",
		};
		this.log("URI: ", uri);
		this.log("Method: ", method);
		this.log("Headers: ", headers);
		if (payload && method === METHOD.POST) {
			this.log("Payload: ", JSON.stringify(payload, null, 2));
			data = await this.encryption.encrypt(JSON.stringify(payload));
		}
		//this.log("Encrypted Form: ", data);
		const response = await this.#http
			.request({
				method,
				url: uri,
				data,
				headers,
				params,
			})
			.then(async (response) => {
				const { status, statusText, headers, data } = response;
				this.log("Raw Response:", { status, statusText, headers, data });
				return {
					statusCode: status,
					statusMessage: statusText,
					headers,
					body: String(data).length ? ((await this.encryption.decrypt(data, true)) as T) : null,
				} as ApiResponse<T>;
			});

		this.log("Response from CGATE", response);
		return response;
	}

	public async invokeReference(payload: InvokeReferenceRequest) {
		validateExistence(payload, "Channel", "Amount");
		const { Channel, Amount, TraceID, TransactionType, SubMerchantName, TerminalId } = payload;
		const { userName: UserName, password: Password, terminalId: DefaultTerminalId, merchantId: MerchantId } = this.config;
		const body = {
			RequestHeader: {
				UserName,
				Password,
			},
			RequestDetails: {
				TerminalId: TerminalId ?? DefaultTerminalId,
				Channel,
				Amount,
				MerchantId,
				TransactionType,
				SubMerchantName,
				TraceID,
			},
		};
		return await this.sendEncryptedRequest<CoralPayResponse<InvokeReferenceResponse>>(METHOD.POST, INVOKE_REFERENCE_API, body);
	}

	public async queryTransaction(payload: StatusQueryRequest) {
		validateExistence(payload, "Amount", "TransactionID");
		const { Amount, TransactionID, TerminalId } = payload;
		const { userName: UserName, password: Password, terminalId: DefaultTerminalId, merchantId: MerchantId } = this.config;
		const body = {
			RequestHeader: {
				UserName,
				Password,
			},
			RequestDetails: {
				TerminalId: TerminalId ?? DefaultTerminalId,
				MerchantId,
				Amount,
				TransactionID,
			},
		};
		return await this.sendEncryptedRequest<StatusQueryResponse>(METHOD.POST, QUERY_TRANSACTION_API, body);
	}

	public async refundPayment(payload: RefundPaymentRequest) {
		validateExistence(payload, "Amount", "TransactionID", "Reference");
		const { Amount, TransactionID, Reference, TerminalId } = payload;
		const { userName: UserName, password: Password, terminalId: DefaultTerminalId, merchantId: MerchantId } = this.config;
		const body = {
			RequestHeader: {
				UserName,
				Password,
			},
			ReversalDetails: {
				MerchantId,
				TerminalId: TerminalId ?? DefaultTerminalId,
				Reference,
				Amount,
				TransactionID,
			},
		};
		return await this.sendEncryptedRequest<RefundPaymentResponse>(METHOD.POST, REFUND_PAYMENT_API, body);
	}

	private log(...args: any) {
		if (this.trace) {
			this.logger(...args);
		}
	}
}
