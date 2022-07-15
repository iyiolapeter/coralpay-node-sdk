export interface CoralPayUssdBank {
	bankName: string;
	bankCode: string;
	bankUssd: string;
}

const BANKS: CoralPayUssdBank[] = [
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
	{
		bankName: "Globus",
		bankCode: "globus",
		bankUssd: `*989*000*{{REFERENCE}}#`,
	},
	{
		bankName: "GTB",
		bankCode: "gtb",
		bankUssd: `*737*000*{{REFERENCE}}#`,
	},
	{
		bankName: "Heritage Bank",
		bankCode: "heritage",
		bankUssd: `*745*000*{{REFERENCE}}#`,
	},
	{
		bankName: "Keystone Bank",
		bankCode: "keystone",
		bankUssd: `*7111*000*{{REFERENCE}}#`,
	},
	{
		bankName: "Rubies (Highstreet) MFB",
		bankCode: "highstreet",
		bankUssd: `*7797*000*{{REFERENCE}}#`,
	},
	{
		bankName: "Stanbic IBTC",
		bankCode: "stanbic",
		bankUssd: `*909*000*{{REFERENCE}}#`,
	},
	{
		bankName: "Sterling Bank",
		bankCode: "sterling",
		bankUssd: `*822*000*{{REFERENCE}}#`,
	},
	{
		bankName: "UBA",
		bankCode: "uba",
		bankUssd: `*919*000*{{REFERENCE}}#`,
	},
	{
		bankName: "Union Bank",
		bankCode: "union",
		bankUssd: `*826*000*{{REFERENCE}}#`,
	},
	{
		bankName: "Unity Bank",
		bankCode: "unity",
		bankUssd: `*7799*000*{{REFERENCE}}#`,
	},
	{
		bankName: "VFD MFB",
		bankCode: "vfd",
		bankUssd: `*5037*000*{{REFERENCE}}#`,
	},
	{
		bankName: "Wema Bank",
		bankCode: "wema",
		bankUssd: `*945*000*{{REFERENCE}}#`,
	},
	{
		bankName: "Zenith Bank",
		bankCode: "zenith",
		bankUssd: `*966*000*{{REFERENCE}}#`,
	},
	{
		bankName: "9pay",
		bankCode: "9pay",
		bankUssd: `*500*000*{{REFERENCE}}#`,
	},
];

export class BankUtil {
	#keyed = BANKS.reduce((agg, bank) => {
		agg[bank.bankCode] = bank;
		return agg;
	}, {} as Record<string, CoralPayUssdBank>);

	get list() {
		return JSON.parse(JSON.stringify(BANKS)) as CoralPayUssdBank[];
	}

	interpolate(bankCode: string, reference: string) {
		const bank = this.#keyed[bankCode];
		if (!bank || !bank.bankUssd.includes("{{REFERENCE}}")) {
			throw new Error("Invalid Bank Code" + bankCode);
		}
		return String(bank.bankUssd).replace("{{REFERENCE}}", reference);
	}
}
