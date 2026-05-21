const {
  AuthorizationType,
  FieldExecuteCode,
  FieldType,
  FormItemComponent,
  fieldDecoratorKit,
}: typeof import('dingtalk-docs-cool-app') = require('dingtalk-docs-cool-app/dist-node/module/fields/index.js');
import { existsSync, readFileSync } from 'fs';

const { t } = fieldDecoratorKit;

const GEMINI_MODEL = 'gemini-3-pro-preview';
const GEMINI_API_BASE = 'https://aivip.link';
const CHARGE_API = 'https://aivip.link/api/interface/plugin/invoke';
const AUTH_ID = 'aify_auth';

type DingTalkContext = {
  fetch: (url: string, options: any, authId?: string) => Promise<any>;
  baseId?: string;
  sheetId?: string;
  extensionId?: string;
  tenantId?: string;
  logID?: string;
  [key: string]: any;
};

type Attachment = {
  name?: string;
  type?: string;
  size?: number;
  tmp_url?: string;
  url?: string;
  [key: string]: any;
};

type ChargeResult = {
  ok: boolean;
  msg: string;
  quotaExhausted?: boolean;
  cost?: number;
  remaining?: number;
};

function isLocalUrl(url: string): boolean {
  const hostname = new URL(url).hostname;
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
}

function getLocalAuthToken(): string | undefined {
  try {
    const configPath = `${process.cwd()}\\config.json`;
    if (!existsSync(configPath)) return undefined;

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return typeof config.authorizations === 'string' ? config.authorizations : undefined;
  } catch (e: any) {
    console.error(`[localAuth] failed to read config.json: ${e?.message}`);
    return undefined;
  }
}

async function fetchWithLocalhostSupport(context: DingTalkContext, url: string, options: any, authId?: string): Promise<any> {
  if (!isLocalUrl(url)) {
    return context.fetch(url, options, authId);
  }

  const headers = { ...(options?.headers || {}) };
  const token = authId ? getLocalAuthToken() : undefined;
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const localFetchPackage = 'node-fetch';
  const localFetch = module.require(localFetchPackage);
  return localFetch(url, {
    ...options,
    headers,
  });
}

fieldDecoratorKit.setDomainList([
  'feishu.cn',
  'feishucdn.com',
  'larksuitecdn.com',
  'larksuite.com',
  'dingtalk.com',
  'dingtalkapps.com',
  'alidocs.com',
  'aliyuncs.com',
  'alicdn.com',
  '127.0.0.1',
  'aivip.link',
] as any);

const domainList = fieldDecoratorKit.getDomainList() as any[];
domainList.push(
  /(^|\.)dingtalk\.com$/i,
  /(^|\.)dingtalkapps\.com$/i,
  /(^|\.)alidocs\.com$/i,
  /(^|\.)aliyuncs\.com$/i,
  /(^|\.)alicdn\.com$/i,
);

async function charge(context: DingTalkContext): Promise<ChargeResult> {
  try {
    const res = await fetchWithLocalhostSupport(
      context,
      CHARGE_API,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'plugin_charge',
          pack_id: context.extensionId,
          base_id: context.baseId,
          amount: 10,
        }),
      },
      AUTH_ID,
    );

    const resText = await res.text();

    if (res.ok) {
      const body = JSON.parse(resText);
      console.log(JSON.stringify({
        tag: '===charge 计费返回',
        status: res.status,
        code: body?.code,
        cost: body?.data?.cost,
        remaining: body?.data?.remaining ?? body?.data?.balance,
        requestId: body?.data?.request_id,
      }), '\n');
      if (body.code === 0) {
        return {
          ok: true,
          msg: '',
          cost: Number(body?.data?.cost || 0),
          remaining: Number(body?.data?.remaining ?? body?.data?.balance ?? 0),
        };
      }
      if (body.code === 402) {
        return { ok: false, msg: '积分不足，请前往平台充值后再使用', quotaExhausted: true };
      }
    }

    let msg = '计费服务暂时不可用，请稍后重试';
    if (res.status === 402) {
      msg = '积分不足，请前往平台充值后再使用';
      return { ok: false, msg, quotaExhausted: true };
    }
    if (res.status === 401) msg = 'API Key 无效，请检查授权配置';

    console.error(`[charge] failed status=${res.status} msg=${msg}`);
    return { ok: false, msg };
  } catch (e: any) {
    const msg = '计费服务暂时不可用，请稍后重试';
    console.error(`[charge] exception: ${e?.message}`);
    return { ok: false, msg };
  }
}

function extractPrompt(promptField: unknown): string {
  if (Array.isArray(promptField)) {
    return promptField.map((seg: any) => seg?.text ?? '').join('').trim();
  }

  if (typeof promptField === 'string') {
    return promptField.trim();
  }

  return '';
}

function extractAttachments(value: unknown): Attachment[] {
  const rawImages: Attachment[] = [];

  const flatten = (val: any) => {
    if (!val) return;
    if (Array.isArray(val)) {
      for (const item of val) flatten(item);
      return;
    }
    if (val?.tmp_url || val?.url) {
      rawImages.push(val);
    }
  };

  flatten(value);
  return rawImages.filter((img) => img?.tmp_url || img?.url).slice(0, 10);
}

fieldDecoratorKit.setDecorator({
  name: 'AIFY分析',
  i18nMap: {
    'zh-CN': {
      promptLabel: '提示词',
      promptTooltip: '选择包含提示词的文本字段，AIFY 将以此为指令分析图片并生成新内容',
      imagesLabel: '图片列（最多10张）',
      imagesTooltip: '选择一个附件字段，单格内最多分析 10 张图片',
      authorizationName: 'AIFY API 授权',
      authorizationTooltip: '请访问 https://aivip.link/dashboard/apikey 查看或生成您的 API Key。',
    },
    'en-US': {
      promptLabel: 'Prompt',
      promptTooltip:
        'Select the text field containing the prompt. AIFY will use it as instructions to analyze images and generate new content.',
      imagesLabel: 'Image Field (max 10)',
      imagesTooltip: 'Select one attachment field. Up to 10 images in the cell will be analyzed.',
      authorizationName: 'AIFY API Authorization',
      authorizationTooltip: 'Visit https://aivip.link/dashboard/apikey to get your API Key.',
    },
    'ja-JP': {
      promptLabel: 'プロンプト',
      promptTooltip:
        'プロンプトを含むテキストフィールドを選択してください。AIFY がそれを指示として画像を分析し、新しいコンテンツを生成します。',
      imagesLabel: '画像列（最大10枚）',
      imagesTooltip: '添付フィールドを1つ選択してください。セル内の画像を最大10枚まで分析します。',
      authorizationName: 'AIFY API 認証',
      authorizationTooltip: 'https://aivip.link/dashboard/apikey で API Key を取得してください。',
    },
  },
  authorizations: {
    id: AUTH_ID,
    label: t('authorizationName'),
    type: AuthorizationType.HeaderBearerToken,
    platform: 'AUTH_93D75519438D',
    required: true,
    instructionsUrl: 'https://aivip.link/dashboard/apikey',
    tooltips: t('authorizationTooltip'),
    icon: {
      light: 'https://youke.xn--y7xa690gmna.cn/s1/2026/02/10/698acaf10b0f7.webp',
      dark: 'https://youke.xn--y7xa690gmna.cn/s1/2026/02/10/698acaf10b0f7.webp',
    },
  },
  formItems: [
    {
      key: 'promptField',
      label: t('promptLabel'),
      component: FormItemComponent.FieldSelect,
      props: {
        mode: 'single',
        supportTypes: [FieldType.Text],
      },
      tooltips: { title: t('promptTooltip') },
      validator: { required: true },
    },
    {
      key: 'productImages',
      label: t('imagesLabel'),
      component: FormItemComponent.FieldSelect,
      props: {
        mode: 'single',
        supportTypes: [FieldType.Attachment],
      },
      tooltips: { title: t('imagesTooltip') },
      validator: { required: true },
    },
  ],
  resultType: {
    type: FieldType.Text,
  },
  execute: async (context: DingTalkContext, formData: Record<string, any>) => {
    const { promptField, productImages } = formData;

    function debugLog(arg: any) {
      console.log(JSON.stringify({ arg, logID: context.logID }), '\n');
    }

    debugLog({
      '===1 插件启动': {
        baseId: context.baseId,
        sheetId: context.sheetId,
        extensionId: context.extensionId,
        tenantId: context.tenantId,
      },
    });

    try {
      const userPrompt = extractPrompt(promptField);

      if (!userPrompt) {
        debugLog({ '===2 错误': '提示词字段为空，请确认所选字段包含文本内容' });
        return { code: FieldExecuteCode.ConfigError };
      }
      debugLog({ '===2 用户指令已读取': { length: userPrompt.length } });

      const imageItems = extractAttachments(productImages);
      if (imageItems.length === 0) {
        debugLog({ '===3 错误': '未找到有效图片，请确认所选字段包含附件图片' });
        return { code: FieldExecuteCode.ConfigError };
      }

      debugLog({ '===3 待分析图片数量': imageItems.length });

      const imageParts: any[] = [];
      for (let i = 0; i < imageItems.length; i++) {
        const imgItem = imageItems[i];
        const imgUrl = String(imgItem.tmp_url || imgItem.url || '');
        debugLog({ [`===4.${i + 1} 开始加载图片`]: { name: imgItem.name } });

        try {
          const imgResp = await fetchWithLocalhostSupport(context, imgUrl, { method: 'GET' });
          const arrayBuffer = await imgResp.arrayBuffer();
          const rawMime: string = imgResp.headers?.get?.('content-type') || imgItem.type || 'image/jpeg';
          const mimeType = rawMime.split(';')[0].trim();
          const base64Data = Buffer.from(arrayBuffer).toString('base64');

          imageParts.push({
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          });
          debugLog({ [`===4.${i + 1} 图片加载成功`]: { mimeType, byteSize: arrayBuffer.byteLength } });
        } catch (imgErr: any) {
          debugLog({
            [`===4.${i + 1} 图片加载失败（已跳过）`]: {
              error: imgErr?.message,
            },
          });
        }
      }

      if (imageParts.length === 0) {
        debugLog({ '===5 错误': '所有图片加载均失败' });
        return { code: FieldExecuteCode.Error };
      }

      const chargeResult = await charge(context);
      if (!chargeResult.ok) {
        debugLog({ '===5.5 扣费失败': chargeResult.msg });
        if (chargeResult.quotaExhausted) {
          return { code: FieldExecuteCode.QuotaExhausted };
        }
        return { code: FieldExecuteCode.Error };
      }
      debugLog({ '===5.5 扣费成功': { cost: 10, remaining: chargeResult.remaining } });

      const userContent: any[] = [
        ...imageParts.map((p: any) => ({
          type: 'image_url',
          image_url: { url: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}` },
        })),
        {
          type: 'text',
          text: `补充产品信息（优先级最高）：${userPrompt}\n\n请严格按照系统提示词的分析框架分析图片，直接输出合法的 JSON 对象，以 { 开始，以 } 结束，不要任何前言或说明文字。`,
        },
      ];

      const requestBody = {
        model: GEMINI_MODEL,
        amount: 10,
        cost: 10,
        messages: [
          { role: 'system', content: '系统提示词由 aivip 后端提示词配置注入。' },
          { role: 'user', content: userContent },
        ],
        temperature: 0.1,
        max_tokens: 8192,
      };

      const geminiUrl = `${GEMINI_API_BASE}/api/analysis/gemini-vision`;
      debugLog({ '===5 发起AIFY分析请求': { url: geminiUrl, model: GEMINI_MODEL, imageCount: imageParts.length } });

      const geminiResp = await fetchWithLocalhostSupport(
        context,
        geminiUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
        AUTH_ID,
      );

      const respText = await geminiResp.text();
      debugLog({
        '===6 AIFY分析响应': {
          status: geminiResp.status,
          ok: geminiResp.ok,
          bodyLength: respText.length,
        },
      });

      if (!geminiResp.ok) {
        if (geminiResp.status === 401 || geminiResp.status === 403) {
          debugLog({ '===6 鉴权失败': geminiResp.status });
          return { code: FieldExecuteCode.AuthorizationError };
        }
        if (geminiResp.status === 429) {
          debugLog({ '===6 请求限流': geminiResp.status });
          return { code: FieldExecuteCode.RateLimit };
        }
        debugLog({ '===6 请求失败': { status: geminiResp.status } });
        return { code: FieldExecuteCode.Error };
      }

      let parsed: any;
      try {
        parsed = JSON.parse(respText);
      } catch (parseErr: any) {
        debugLog({ '===7 响应JSON解析失败': { error: parseErr?.message, bodyLength: respText.length } });
        return { code: FieldExecuteCode.Error };
      }
      debugLog({ '===7 响应解析成功': { code: parsed?.code, message: parsed?.message } });

      if (parsed?.code === 402) {
        debugLog({ '===7 积分不足': parsed?.message });
        return { code: FieldExecuteCode.QuotaExhausted };
      }

      if (parsed?.code !== 0) {
        debugLog({ '===7 API返回错误': { code: parsed?.code, message: parsed?.message } });
        return { code: FieldExecuteCode.Error };
      }

      const finalText = String(parsed?.data?.text ?? '').trim();
      if (!finalText) {
        debugLog({ '===8 错误': '响应data.text为空' });
        return { code: FieldExecuteCode.Error };
      }

      debugLog({ '===8 生成完成': { outputLength: finalText.length } });

      return {
        code: FieldExecuteCode.Success,
        data: finalText,
      };
    } catch (e: any) {
      debugLog({
        '===99 未捕获异常': {
          message: e?.message,
          stack: e?.stack ? e.stack.slice(0, 500) : undefined,
        },
      });
      return { code: FieldExecuteCode.Error };
    }
  },
});

export default fieldDecoratorKit;
