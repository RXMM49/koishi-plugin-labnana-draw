import { Context, Schema } from 'koishi';
export declare const name = "labnana-draw";
export interface Config {
    apiKey: string;
    baseUrl?: string;
    timeout?: number;
    proxyEnabled?: boolean;
    proxyUrl?: string;
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;
