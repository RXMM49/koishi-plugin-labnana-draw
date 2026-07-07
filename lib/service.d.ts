import { Context, Session } from 'koishi';
import { LabnanaClient } from './client';
export declare class DrawService {
    private client;
    private ctx;
    constructor(ctx: Context, client: LabnanaClient);
    /**
     * 处理文生图命令
     */
    handleTextToImage(session: Session, prompt: string, options?: any): Promise<void>;
    /**
     * 处理图生图命令（文带图）
     */
    handleImageToImage(session: Session, prompt: string, imageUrl: string, options?: any): Promise<void>;
    /**
     * 解析消息中的图片
     */
    extractImageFromMessage(message: any): string | null;
}
