import { Context } from 'koishi';
export interface LabnanaConfig {
    apiKey: string;
    baseUrl: string;
    timeout: number;
    proxyEnabled?: boolean;
    proxyUrl?: string;
}
export interface ImageGenerationParams {
    prompt: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    steps?: number;
    cfgScale?: number;
    seed?: number;
    model?: string;
}
export interface ImageWithImageParams extends ImageGenerationParams {
    imageUrl: string;
    imageStrength?: number;
}
export declare class LabnanaClient {
    private config;
    private ctx;
    constructor(ctx: Context, config: LabnanaConfig);
    /**
     * 创建axios请求配置（包含代理支持）
     */
    private createAxiosConfig;
    /**
     * 根据宽高计算 imageSize（1K, 2K, 4K）
     */
    private calculateImageSize;
    /**
     * 根据宽高计算 aspectRatio
     */
    private calculateAspectRatio;
    /**
     * 检查是否应该重试请求
     */
    private shouldRetry;
    /**
     * 计算退避延迟时间（指数退避 + 抖动）
     */
    private calculateBackoffDelay;
    /**
     * 延迟函数
     */
    private delay;
    /**
     * 带重试的请求执行器
     */
    private executeWithRetry;
    /**
     * 文生图
     */
    textToImage(params: ImageGenerationParams): Promise<Buffer>;
    /**
     * 图生图(文带图)
     */
    imageToImage(params: ImageWithImageParams): Promise<Buffer>;
    /**
     * 下载图片
     */
    private downloadImage;
    /**
     * 验证API密钥
     */
    validateApiKey(): Promise<boolean>;
}
