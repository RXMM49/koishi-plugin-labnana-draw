"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrawService = void 0;
const koishi_1 = require("koishi");
const logger = new koishi_1.Logger('labnana-draw-service');
class DrawService {
    client;
    ctx;
    constructor(ctx, client) {
        this.ctx = ctx;
        this.client = client;
    }
    /**
     * 处理文生图命令
     */
    async handleTextToImage(session, prompt, options = {}) {
        const startTime = Date.now();
        try {
            // 发送等待消息
            await session.send('🎨 正在生成图片，请稍候...');
            // 构建参数
            const params = {
                prompt,
                negativePrompt: options.negativePrompt,
                width: options.width || 512,
                height: options.height || 512,
                steps: options.steps || 20,
                cfgScale: options.cfgScale || 7,
                seed: options.seed ? parseInt(options.seed) : undefined,
                model: options.model,
            };
            logger.info(`开始文生图: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`);
            // 调用API
            const imageBuffer = await this.client.textToImage(params);
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            logger.info(`文生图成功，耗时 ${elapsed}s`);
            // 发送生成的图片
            await session.send(koishi_1.h.image(imageBuffer, 'image/png'));
            // 发送参数信息
            const infoLines = [
                `✅ 图片生成成功 (耗时: ${elapsed}s)`,
                `模型: ${options.model || 'gemini-3-pro-image'}`,
                `尺寸: ${params.width}x${params.height}`,
                options.seed ? `种子: ${options.seed}` : '',
                options.negativePrompt ? `负面提示词: ${options.negativePrompt}` : '',
            ].filter(Boolean);
            await session.send(infoLines.join('\n'));
        }
        catch (error) {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            logger.error(`文生图失败 (耗时 ${elapsed}s):`, error.message);
            await session.send(`❌ 图片生成失败: ${error.message}`);
        }
    }
    /**
     * 处理图生图命令（文带图）
     */
    async handleImageToImage(session, prompt, imageUrl, options = {}) {
        const startTime = Date.now();
        try {
            // 发送等待消息
            await session.send('🎨 正在基于参考图生成图片，请稍候...');
            // 构建参数
            const params = {
                prompt,
                imageUrl,
                negativePrompt: options.negativePrompt,
                width: options.width || 512,
                height: options.height || 512,
                steps: options.steps || 20,
                cfgScale: options.cfgScale || 7,
                seed: options.seed ? parseInt(options.seed) : undefined,
                model: options.model,
                imageStrength: options.strength ? parseFloat(options.strength) : 0.75,
            };
            logger.info(`开始图生图: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`);
            // 调用API
            const imageBuffer = await this.client.imageToImage(params);
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            logger.info(`图生图成功，耗时 ${elapsed}s`);
            // 发送生成的图片
            await session.send(koishi_1.h.image(imageBuffer, 'image/png'));
            // 发送参数信息
            const infoLines = [
                `✅ 图片生成成功 (耗时: ${elapsed}s)`,
                `模型: ${options.model || 'gemini-3-pro-image'}`,
                `参考图强度: ${params.imageStrength}`,
                `尺寸: ${params.width}x${params.height}`,
                options.seed ? `种子: ${options.seed}` : '',
                options.negativePrompt ? `负面提示词: ${options.negativePrompt}` : '',
            ].filter(Boolean);
            await session.send(infoLines.join('\n'));
        }
        catch (error) {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            logger.error(`图生图失败 (耗时 ${elapsed}s):`, error.message);
            await session.send(`❌ 图片生成失败: ${error.message}`);
        }
    }
    /**
     * 解析消息中的图片
     */
    extractImageFromMessage(message) {
        if (!message || !message.elements) {
            return null;
        }
        for (const element of message.elements) {
            if (element.type === 'image' && element.data?.url) {
                return element.data.url;
            }
        }
        return null;
    }
}
exports.DrawService = DrawService;
