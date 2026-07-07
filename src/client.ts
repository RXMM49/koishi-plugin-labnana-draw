import axios from 'axios'
import FormData from 'form-data'
import { Context, Logger } from 'koishi'
import { HttpsProxyAgent } from 'https-proxy-agent'

const logger = new Logger('labnana-draw')

export interface LabnanaConfig {
  apiKey: string
  baseUrl: string
  timeout: number
  proxyEnabled?: boolean
  proxyUrl?: string
}

export interface ImageGenerationParams {
  prompt: string
  negativePrompt?: string
  width?: number
  height?: number
  steps?: number
  cfgScale?: number
  seed?: number
  model?: string
}

export interface ImageWithImageParams extends ImageGenerationParams {
  imageUrl: string
  imageStrength?: number
}

export class LabnanaClient {
  private config: LabnanaConfig
  private ctx: Context

  constructor(ctx: Context, config: LabnanaConfig) {
    this.ctx = ctx
    this.config = config
  }

  /**
   * 创建axios请求配置（包含代理支持）
   */
  private createAxiosConfig(additionalConfig: any = {}) {
    const config: any = {
      timeout: this.config.timeout || 600000,
      ...additionalConfig,
    }

    // 如果启用了代理，添加代理配置
    if (this.config.proxyEnabled && this.config.proxyUrl) {
      const proxyAgent = new HttpsProxyAgent(this.config.proxyUrl)
      config.httpsAgent = proxyAgent
      config.httpAgent = proxyAgent
      logger.debug('使用代理:', this.config.proxyUrl)
    }

    return config
  }
  
  /**
   * 根据宽高计算 imageSize（1K, 2K, 4K）
   */
  private calculateImageSize(width?: number, height?: number): string {
    const maxDimension = Math.max(width || 1024, height || 1024)
    if (maxDimension <= 1024) return '1K'
    if (maxDimension <= 2048) return '2K'
    return '4K'
  }
  
  /**
   * 根据宽高计算 aspectRatio
   */
  private calculateAspectRatio(width?: number, height?: number): string {
    const w = width || 1024
    const h = height || 1024
    
    // 常见比例映射
    const ratio = w / h
    
    if (Math.abs(ratio - 1) < 0.1) return '1:1'
    if (Math.abs(ratio - 2/3) < 0.1) return '2:3'
    if (Math.abs(ratio - 3/2) < 0.1) return '3:2'
    if (Math.abs(ratio - 3/4) < 0.1) return '3:4'
    if (Math.abs(ratio - 4/3) < 0.1) return '4:3'
    if (Math.abs(ratio - 9/16) < 0.1) return '9:16'
    if (Math.abs(ratio - 16/9) < 0.1) return '16:9'
    if (Math.abs(ratio - 21/9) < 0.1) return '21:9'
    
    // 默认返回最接近的比例
    return '1:1'
  }

  /**
   * 检查是否应该重试请求
   */
  private shouldRetry(error: any, retryCount: number): boolean {
    const maxRetries = 3
    if (retryCount >= maxRetries) return false
    
    // 可重试的错误类型
    const retryableCodes = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ERR_PROXY_CONNECTION_FAILED',
      'EAI_AGAIN',
    ]
    
    // HTTP状态码5xx也可以重试
    const statusCode = error.response?.status
    const isServerError = statusCode && statusCode >= 500 && statusCode < 600
    
    return retryableCodes.includes(error.code) || isServerError
  }

  /**
   * 计算退避延迟时间（指数退避 + 抖动）
   */
  private calculateBackoffDelay(attempt: number): number {
    const baseDelay = 1000 // 基础延迟1秒
    const maxDelay = 10000 // 最大延迟10秒
    
    // 指数退避: 1s, 2s, 4s
    const exponentialDelay = Math.pow(2, attempt - 1) * baseDelay
    
    // 添加随机抖动 (0-1秒)，避免多个请求同时重试
    const jitter = Math.random() * 1000
    
    return Math.min(exponentialDelay + jitter, maxDelay)
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 带重试的请求执行器
   */
  private async executeWithRetry<T>(
    requestFn: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: any
    const maxRetries = 3
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn()
      } catch (error: any) {
        lastError = error
        
        if (!this.shouldRetry(error, attempt)) {
          throw error
        }
        
        // 计算退避延迟
        const delayMs = this.calculateBackoffDelay(attempt)
        logger.warn(`${operationName} 第${attempt}/${maxRetries}次尝试失败 (${error.code || error.response?.status}), ${Math.round(delayMs/1000)}s后重试...`)
        await this.delay(delayMs)
      }
    }
    
    throw lastError
  }

  /**
   * 文生图
   */
  async textToImage(params: ImageGenerationParams): Promise<Buffer> {
    return this.executeWithRetry(async () => {
      try {
        logger.debug('开始文生图请求', { prompt: params.prompt })
        
        // 根据宽高比和分辨率计算 imageSize 和 aspectRatio
        const imageSize = this.calculateImageSize(params.width, params.height)
        const aspectRatio = this.calculateAspectRatio(params.width, params.height)

        const axiosConfig = this.createAxiosConfig({
          headers: {
            'Authorization': `Bearer ${this.config.apiKey.trim()}`,
            'Content-Type': 'application/json',
          },
          responseType: 'json',
        })
        
        const payload = {
          provider: 'google',
          model: params.model || 'gemini-3-pro-image',
          prompt: params.prompt,
          imageConfig: {
            imageSize: imageSize,
            aspectRatio: aspectRatio,
          },
          seed: params.seed || undefined,
        }
        
        logger.debug('请求URL:', `${this.config.baseUrl}/openapi/v1/images/generation`)
        logger.debug('请求参数:', JSON.stringify(payload))

        const response = await axios.post(
          `${this.config.baseUrl}/openapi/v1/images/generation`,
          payload,
          axiosConfig
        )

        logger.debug('文生图请求成功')
        
        // 解析响应数据
        const candidates = response.data.candidates || []
        const parts = candidates[0]?.content?.parts || []
        
        let imageData = null
        let mimeType = null
        
        for (const part of parts) {
          if (part.inlineData) {
            imageData = part.inlineData.data
            mimeType = part.inlineData.mimeType
            break
          }
        }
        
        if (!imageData) {
          throw new Error('未找到图片数据')
        }
        
        return Buffer.from(imageData, 'base64')
      } catch (error: any) {
        logger.error('文生图请求失败:', error)
        logger.error('错误代码:', error.code)
        logger.error('错误信息:', error.message)
        logger.error('请求URL:', `${this.config.baseUrl}/v1/images/generations`)
        if (this.config.proxyEnabled) {
          logger.error('代理状态: 已启用')
          logger.error('代理地址:', this.config.proxyUrl)
        } else {
          logger.error('代理状态: 未启用')
        }
        
        const errorMsg = error.response?.data?.message || 
                       error.response?.data?.error || 
                       error.message || 
                       '未知错误'
        const statusCode = error.response?.status || '无状态码'
        
        // 提供更详细的错误提示
        let detailedError = `Labnana API错误 (${statusCode}): ${errorMsg}`
        if (error.code === 'ETIMEDOUT') {
          detailedError += '\n提示: 连接超时，请检查网络连接或配置代理'
        } else if (error.code === 'ECONNREFUSED') {
          detailedError += '\n提示: 连接被拒绝，请检查服务器是否可访问'
        } else if (error.code === 'ENOTFOUND') {
          detailedError += '\n提示: DNS解析失败，请检查baseUrl配置'
        } else if (error.code === 'ERR_PROXY_CONNECTION_FAILED') {
          detailedError += '\n提示: 代理连接失败，请检查代理配置'
        } else if (error.code === 'ECONNRESET') {
          detailedError += '\n提示: 连接被重置，可能是网络波动或代理不稳定，已自动重试'
        }
        
        throw new Error(detailedError)
      }
    }, '文生图')
  }

  /**
   * 图生图(文带图)
   */
  async imageToImage(params: ImageWithImageParams): Promise<Buffer> {
    return this.executeWithRetry(async () => {
      try {
        logger.debug('开始图生图请求', { 
          prompt: params.prompt,
          imageUrl: params.imageUrl 
        })
  
        // 下载参考图片
        const imageData = await this.downloadImage(params.imageUrl)
          
        // 创建FormData
        const formData = new FormData()
        formData.append('prompt', params.prompt)
        formData.append('image', imageData, {
          filename: 'reference.png',
          contentType: 'image/png',
        })
          
        if (params.negativePrompt) {
          formData.append('negative_prompt', params.negativePrompt)
        }
          
        formData.append('width', params.width?.toString() || '512')
        formData.append('height', params.height?.toString() || '512')
        formData.append('steps', params.steps?.toString() || '20')
        formData.append('cfg_scale', params.cfgScale?.toString() || '7')
        formData.append('image_strength', params.imageStrength?.toString() || '0.75')
          
        if (params.seed) {
          formData.append('seed', params.seed.toString())
        }
          
        if (params.model) {
          formData.append('model', params.model)
        }
  
        const axiosConfig = this.createAxiosConfig({
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            ...formData.getHeaders(),
          },
          responseType: 'arraybuffer',
        })
  
        const response = await axios.post(
          `${this.config.baseUrl}/openapi/v1/images/image-to-image`,
          formData,
          axiosConfig
        )
  
        logger.debug('图生图请求成功')
        return Buffer.from(response.data as ArrayBuffer)
      } catch (error: any) {
        logger.error('图生图请求失败:', error)
        const errorMsg = error.response?.data?.message || 
                       error.response?.data?.error || 
                       error.message || 
                       '未知错误'
        const statusCode = error.response?.status || '无状态码'
        throw new Error(`Labnana API错误 (${statusCode}): ${errorMsg}`)
      }
    }, '图生图')
  }

  /**
   * 下载图片
   */
  private async downloadImage(url: string): Promise<Buffer> {
    try {
      logger.debug('下载图片', { url })
      
      const axiosConfig = this.createAxiosConfig({
        responseType: 'arraybuffer',
      })
      
      const response = await axios.get(url, axiosConfig)
      
      return Buffer.from(response.data as ArrayBuffer)
    } catch (error: any) {
      logger.error('下载图片失败:', error.message)
      throw new Error(`无法下载图片: ${error.message}`)
    }
  }

  /**
   * 验证API密钥
   */
  async validateApiKey(): Promise<boolean> {
    try {
      // 尝试发送一个简单的文生图请求来验证API
      const axiosConfig = this.createAxiosConfig({
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      })

      const response = await axios.post(
        `${this.config.baseUrl}/openapi/v1/images/generations`,
        {
          prompt: 'test',
          width: 64,
          height: 64,
          steps: 1,
        },
        axiosConfig
      )
      // 如果请求成功（即使返回的是测试图片），说明API密钥有效
      return response.status === 200
    } catch (error: any) {
      logger.error('API密钥验证失败:', error)
      const statusCode = error.response?.status
      const errorCode = error.code
      
      // 401/403 表示密钥无效
      if (statusCode === 401 || statusCode === 403) {
        logger.error('API密钥无效，请检查配置')
        return false
      }
      
      // 网络错误（超时、连接失败等）
      if (errorCode === 'ETIMEDOUT' || errorCode === 'ECONNREFUSED' || errorCode === 'ENOTFOUND') {
        logger.error(`网络连接失败 (${errorCode})`)
        logger.error(`请检查:`)
        logger.error(`1. baseUrl 配置是否正确: ${this.config.baseUrl}`)
        logger.error(`2. 网络连接是否正常`)
        logger.error(`3. 防火墙或代理设置`)
        // 网络问题，返回true让用户可以继续尝试使用功能
        return true
      }
      
      // 其他错误
      logger.warn('未知错误，请查看详细日志')
      return true
    }
  }
}
