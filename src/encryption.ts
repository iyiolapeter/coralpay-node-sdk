import * as keymanager from "../keymanager";
import * as openpgp from "openpgp";
import * as openpgpLegacy from "openpgp-legacy";

openpgpLegacy.config.ignore_mdc_error = true;
openpgpLegacy.config.use_native = true;

interface PGPEncryptionConfig {
	publickey: string;
	privatekey: string;
	passphrase?: string;
	isInsecureTwoByteHashPrivateKey?: boolean;
	logger: (...args: any[]) => void;
}

const loadInsecureTwoByteHashPrivateKey = async (text: string, passphrase?: string) => {
	const key = (await openpgpLegacy.key.readArmored(text)).keys[0];
	if (!key.isDecrypted()) {
		await key.decrypt(passphrase ?? "");
	}
	return key;
};

export class PGPEncryption {
	#decryptionKey!: openpgp.PrivateKey | openpgpLegacy.key.Key;
	#encryptionKey!: string;
	#init = false;
	#useLegacyOpenPGP = false;
	constructor(private config: PGPEncryptionConfig) {}

	async readPrivateKey() {
		if (this.config.isInsecureTwoByteHashPrivateKey === true) {
			this.#useLegacyOpenPGP = true;
			return loadInsecureTwoByteHashPrivateKey(this.config.privatekey, this.config.passphrase);
		}
		return openpgp
			.readPrivateKey({
				armoredKey: this.config.privatekey,
			})
			.then((key) => {
				if (key.isDecrypted()) {
					return key;
				}
				return openpgp.decryptKey({
					privateKey: key,
					passphrase: this.config.passphrase,
				});
			})
			.catch((error: Error) => {
				if (error.message.includes("Encrypted private key is authenticated using an insecure two-byte hash")) {
					console.warn("WARNING: Private key was created using an insecure two-byte hash! Suggest to upgrade to a newer format");
					this.#useLegacyOpenPGP = true;
					return loadInsecureTwoByteHashPrivateKey(this.config.privatekey, this.config.passphrase);
				}
				throw error;
			});
	}

	async init() {
		const [encryptionKey, decryptionKey] = await Promise.all([
			keymanager.importKeys(this.config.publickey, { debug: true, showVersion: false }),
			this.readPrivateKey(),
		]);
		this.#encryptionKey = encryptionKey;
		this.#decryptionKey = decryptionKey;
		this.#init = true;
	}

	async encrypt(data: string) {
		if (!this.#init) {
			await this.init();
		}
		this.config.logger("Encrypting Data ===>", data);
		const result = await keymanager.encryptRequest(data, this.#encryptionKey, { format: "hex", debug: false, showVersion: false });
		this.config.logger("Encryption Result ===>", result);
		return result;
	}

	async decrypt<T = Record<string, any>>(text: string, json: true): Promise<T>;
	async decrypt(text: string, json?: false): Promise<string>;
	async decrypt(text: string, json = false) {
		if (!this.#init) {
			await this.init();
		}
		this.config.logger("Decrypting Text ===>", text, "Possibly JSON ===>", json);
		const buffer = Buffer.from(text, "hex");
		const result = await Promise.resolve(this.#useLegacyOpenPGP).then(async (legacy) => {
			if (legacy) {
				return openpgpLegacy
					.decrypt({
						message: await openpgpLegacy.message.read(buffer),
						privateKeys: this.#decryptionKey as openpgpLegacy.key.Key,
					})
					.then((result) => result.data);
			}

			return openpgp
				.decrypt({
					message: await openpgp.readMessage({
						binaryMessage: buffer,
					}),
					decryptionKeys: this.#decryptionKey as openpgp.PrivateKey,
				})
				.then((result) => result.data);
		});
		this.config.logger("Decryption Result ===>", result);
		if (json) {
			return JSON.parse(result);
		}
		return result;
	}
}
