declare module "keymanager" {

}

export const importKeys: (key: string, options?: object) => Promise<string>;
export const encryptRequest: (data: string, publicKeyId: string, options?: object) => Promise<string>;
export const enarmor: (data: any, marker?: string, headers?: object) => string;