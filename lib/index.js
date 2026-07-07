"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.name = void 0;
exports.apply = apply;
const koishi_1 = require("koishi");
const client_1 = require("./client");
const service_1 = require("./service");
exports.name = 'labnana-draw';
// 常量定义
const DEFAULT_CONFIG = {
    baseUrl: 'https://api.labnana.com',
    timeout: 600000,
    proxyEnabled: false,
};
const MODELS = [
    { name: 'gemini-3-pro-image', label: 'Gemini 3 Pro Image (默认)' },
    { name: 'gpt-image-2', label: 'GPT Image 2' },
    { name: 'nano-banana-pro', label: 'Nano Banana Pro' },
    { name: 'nano-banana-2', label: 'Nano Banana 2' },
    { name: 'wan2.7-image-pro', label: 'Wan 2.7 Image Pro' },
    { name: 'wan2.7-image', label: 'Wan 2.7 Image' },
];
const RATIOS = [
    { value: '1:1', label: '1:1 (正方形)' },
    { value: '2:3', label: '2:3 (竖版)' },
    { value: '3:2', label: '3:2 (横版)' },
    { value: '3:4', label: '3:4 (竖版)' },
    { value: '4:3', label: '4:3 (横版)' },
    { value: '9:16', label: '9:16 (手机竖屏)' },
    { value: '16:9', label: '16:9 (横屏)' },
    { value: '21:9', label: '21:9 (超宽屏)' },
];
const RESOLUTIONS = [
    { value: '1k', label: '1K (1024px)', size: 1024 },
    { value: '2k', label: '2K (2048px)', size: 2048 },
    { value: '4k', label: '4K (4096px)', size: 4096 },
];
exports.Config = koishi_1.Schema.object({
    apiKey: koishi_1.Schema.string()
        .required()
        .description('Labnana API密钥'),
    baseUrl: koishi_1.Schema.string()
        .default('https://api.labnana.com')
        .description('API基础URL'),
    timeout: koishi_1.Schema.number()
        .default(600000)
        .description('请求超时时间（毫秒），默认10分钟'),
    proxyEnabled: koishi_1.Schema.boolean()
        .default(false)
        .description('是否启用代理'),
    proxyUrl: koishi_1.Schema.string()
        .default('')
        .description('代理服务器地址（例如：http://127.0.0.1:7890）'),
});
function apply(ctx, config) {
    // 创建Labnana客户端
    const client = new client_1.LabnanaClient(ctx, {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl || DEFAULT_CONFIG.baseUrl,
        timeout: config.timeout || DEFAULT_CONFIG.timeout,
        proxyEnabled: config.proxyEnabled || DEFAULT_CONFIG.proxyEnabled,
        proxyUrl: config.proxyUrl || '',
    });
    // 创建绘图服务
    const drawService = new service_1.DrawService(ctx, client);
    // 辅助函数：根据比例和分辨率计算宽高
    function calculateDimensions(ratio, resolution) {
        // 查找分辨率基准值
        const resConfig = RESOLUTIONS.find(r => r.value === resolution.toLowerCase()) || RESOLUTIONS[0];
        const baseSize = resConfig.size;
        // 查找比例
        const ratioConfig = RATIOS.find(r => r.value === ratio);
        const [ratioW, ratioH] = ratioConfig ? ratioConfig.value.split(':').map(Number) : [1, 1];
        // 计算宽高，确保是8的倍数（很多AI模型要求）
        let width, height;
        if (ratioW >= ratioH) {
            // 横向或正方形
            width = Math.round(baseSize * (ratioW / ratioH) / 8) * 8;
            height = Math.round(baseSize / 8) * 8;
        }
        else {
            // 纵向
            width = Math.round(baseSize / 8) * 8;
            height = Math.round(baseSize * (ratioH / ratioW) / 8) * 8;
        }
        return { width, height };
    }
    // 文生图命令
    ctx.command('文生图 <prompt:text> [model:text] [ratio:text] [resolution:text]', 'AI文生图')
        .option('negativePrompt', '-n <negativePrompt:text> 负面提示词')
        .option('width', '-w <width:number> 图片宽度')
        .option('height', '--height <height:number> 图片高度')
        .option('steps', '-s <steps:number> 生成步数')
        .option('cfgScale', '-c <cfgScale:number> CFG比例')
        .option('seed', '--seed <seed:string> 随机种子')
        .action(async ({ session, options }, prompt, model = 'gemini-3-pro-image', ratio = '1:1', resolution = '1k') => {
        if (!prompt) {
            return '请提供提示词';
        }
        // 如果提供了比例和分辨率，自动计算宽高
        let finalOptions = { ...options, model };
        if (ratio && resolution && !options.width && !options.height) {
            const { width, height } = calculateDimensions(ratio, resolution);
            finalOptions.width = width;
            finalOptions.height = height;
            await session.send(`🎨 正在生成图片...\n模型: ${model}\n比例: ${ratio}\n分辨率: ${resolution}\n尺寸: ${width}x${height}`);
        }
        await drawService.handleTextToImage(session, prompt, finalOptions);
    });
    // 图文混合命令（文带图）
    ctx.command('图文混合 <prompt:text> [model:text] [ratio:text] [resolution:text]', 'AI图文混合（需要附带图片）')
        .option('negativePrompt', '-n <negativePrompt:text> 负面提示词')
        .option('width', '-w <width:number> 图片宽度')
        .option('height', '--height <height:number> 图片高度')
        .option('steps', '-s <steps:number> 生成步数')
        .option('cfgScale', '-c <cfgScale:number> CFG比例')
        .option('seed', '--seed <seed:string> 随机种子')
        .option('strength', '--strength <strength:number> 参考图强度(0-1)')
        .action(async ({ session, options }, prompt, model = 'gemini-3-pro-image', ratio = '1:1', resolution = '1k') => {
        if (!prompt) {
            return '请提供提示词';
        }
        // 从消息中提取图片
        const imageUrl = session.elements?.find((el) => el.type === 'image')?.data?.url;
        if (!imageUrl) {
            return '请发送一张图片作为参考，或使用 文生图 命令进行文生图';
        }
        // 如果提供了比例和分辨率，自动计算宽高
        let finalOptions = { ...options, model };
        if (ratio && resolution && !options.width && !options.height) {
            const { width, height } = calculateDimensions(ratio, resolution);
            finalOptions.width = width;
            finalOptions.height = height;
            await session.send(`🎨 正在基于参考图生成图片...\n模型: ${model}\n比例: ${ratio}\n分辨率: ${resolution}\n尺寸: ${width}x${height}`);
        }
        await drawService.handleImageToImage(session, prompt, imageUrl, finalOptions);
    });
    // 验证API密钥命令
    ctx.command('检查API', '检查Labnana API连接')
        .action(async ({ session }) => {
        const isValid = await client.validateApiKey();
        if (isValid) {
            return '✅ API连接正常，可以开始使用文生图和图文混合功能';
        }
        else {
            return '❌ API密钥无效，请检查配置中的apiKey是否正确';
        }
    });
    // 帮助信息
    ctx.command('绘图帮助', '查看Labnana绘图帮助')
        .action(() => {
        const modelList = MODELS.map(m => `  - ${m.name}`).join('\n');
        const ratioList = RATIOS.map(r => `  - ${r.value}`).join('\n');
        const resList = RESOLUTIONS.map(r => `  - ${r.value} (${r.size}px)`).join('\n');
        return [
            '🎨 Labnana AI绘图插件',
            '',
            '📝 可用命令：',
            'AI绘图 - 交互式AI绘图向导（推荐新手使用）',
            '文生图 <提示词> [模型] [比例] [分辨率] - AI文生图',
            '  选项：',
            '    -n <负面提示词>  负面提示词',
            '    -w <宽度>       图片宽度',
            '    --height <高度> 图片高度',
            '    -s <步数>       生成步数（默认20）',
            '    -c <CFG>        CFG比例（默认7）',
            '    --seed <种子>   随机种子',
            '',
            '图文混合 <提示词> [模型] [比例] [分辨率] - AI图文混合（需要附带图片）',
            '  选项：同上，额外支持：',
            '    --strength <强度> 参考图强度0-1（默认0.75）',
            '',
            '检查API - 检查API连接',
            '绘图帮助 - 显示此帮助信息',
            '',
            '💡 使用示例：',
            'AI绘图 （启动交互式向导）',
            '文生图 一只可爱的猫咪',
            '文生图 风景画 gpt-image-2 16:9 4k -n 模糊',
            '文生图 深海少女 gpt-image-2 3:4 4k',
            '图文混合 变成动漫风格 gpt-image-2 1:1 2k [附带图片]',
            '',
            '📌 支持的模型：',
            modelList,
            '',
            '📐 支持的比例：',
            ratioList,
            '',
            '📊 支持的分辨率：',
            resList,
        ].join('\n');
    });
    // 交互式绘图命令（傻瓜式）
    ctx.command('AI绘图', '交互式AI绘图向导')
        .alias('智能绘图')
        .action(async ({ session }) => {
        // 第一步：选择绘图类型
        await session.send('🎨 欢迎使用 AI 绘图向导！\n' +
            '请选择绘图类型：\n' +
            '1. 文生图 - 根据文字描述生成图片\n' +
            '2. 图文混合 - 基于参考图和文字生成图片');
        // 等待用户输入类型
        const typeResponse = await session.prompt(30000); // 30秒超时
        if (!typeResponse) {
            return '⏰ 超时，已取消操作';
        }
        const isImageToImage = typeResponse.includes('2') || typeResponse.toLowerCase().includes('图文') || typeResponse.toLowerCase().includes('混合');
        // 第二步：输入提示词
        await session.send('✍️ 请输入您的提示词（描述您想要生成的图片内容）：');
        const promptResponse = await session.prompt(60000); // 60秒超时
        if (!promptResponse) {
            return '⏰ 超时，已取消操作';
        }
        const prompt = promptResponse.trim();
        // 第三步：选择模型
        await session.send('🤖 请选择要使用的模型：\n' +
            MODELS.map((m, i) => `${i + 1}. ${m.label}`).join('\n'));
        const modelResponse = await session.prompt(30000);
        if (!modelResponse) {
            return '⏰ 超时，已取消操作';
        }
        // 解析模型选择
        let selectedModel = MODELS[0].name; // 默认
        const modelNum = parseInt(modelResponse);
        if (!isNaN(modelNum) && modelNum >= 1 && modelNum <= MODELS.length) {
            selectedModel = MODELS[modelNum - 1].name;
        }
        else {
            // 尝试匹配名称
            const matched = MODELS.find(m => modelResponse.toLowerCase().includes(m.name.toLowerCase()) ||
                modelResponse.toLowerCase().includes(m.label.toLowerCase()));
            if (matched) {
                selectedModel = matched.name;
            }
        }
        // 第四步：选择分辨率
        await session.send('📊 请选择分辨率：\n' +
            RESOLUTIONS.map((r, i) => `${i + 1}. ${r.label}`).join('\n'));
        const resResponse = await session.prompt(30000);
        if (!resResponse) {
            return '⏰ 超时，已取消操作';
        }
        // 解析分辨率选择
        let selectedResolution = RESOLUTIONS[0].value; // 默认
        const resNum = parseInt(resResponse);
        if (!isNaN(resNum) && resNum >= 1 && resNum <= RESOLUTIONS.length) {
            selectedResolution = RESOLUTIONS[resNum - 1].value;
        }
        else {
            // 尝试匹配值
            const matched = RESOLUTIONS.find(r => resResponse.toLowerCase().includes(r.value) ||
                resResponse.toLowerCase().includes(r.label.toLowerCase()));
            if (matched) {
                selectedResolution = matched.value;
            }
        }
        // 如果是图文混合，需要获取图片
        if (isImageToImage) {
            await session.send('🖼️ 请发送一张参考图片：');
            // 等待图片消息
            const imageMessage = await new Promise((resolve) => {
                const dispose = ctx.middleware(async (session, next) => {
                    const imageUrl = session.elements?.find((el) => el.type === 'image')?.data?.url;
                    if (imageUrl) {
                        dispose();
                        resolve({ imageUrl });
                        return;
                    }
                    return next();
                }, true);
                // 30秒超时
                setTimeout(() => {
                    dispose();
                    resolve(null);
                }, 30000);
            });
            if (!imageMessage || !imageMessage.imageUrl) {
                return '⏰ 超时或未收到图片，已取消操作';
            }
            // 计算尺寸
            const ratio = '1:1'; // 图文混合默认正方形
            const { width, height } = calculateDimensions(ratio, selectedResolution);
            await session.send(`✅ 参数确认：\n` +
                `类型: 图文混合\n` +
                `模型: ${selectedModel}\n` +
                `分辨率: ${selectedResolution}\n` +
                `尺寸: ${width}x${height}\n` +
                `\n🎨 正在生成中，请稍后...`);
            await drawService.handleImageToImage(session, prompt, imageMessage.imageUrl, {
                model: selectedModel,
                width,
                height,
            });
        }
        else {
            // 文生图
            const ratio = '1:1'; // 默认正方形
            const { width, height } = calculateDimensions(ratio, selectedResolution);
            await session.send(`✅ 参数确认：\n` +
                `类型: 文生图\n` +
                `模型: ${selectedModel}\n` +
                `分辨率: ${selectedResolution}\n` +
                `尺寸: ${width}x${height}\n` +
                `\n🎨 正在生成中，请稍后...`);
            await drawService.handleTextToImage(session, prompt, {
                model: selectedModel,
                width,
                height,
            });
        }
    });
}
