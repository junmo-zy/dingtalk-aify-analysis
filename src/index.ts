import {
  AuthorizationType,
  FieldExecuteCode,
  FieldType,
  FormItemComponent,
  fieldDecoratorKit,
} from 'dingtalk-docs-cool-app/dist-node/module/fields/index.js';

const { t } = fieldDecoratorKit;

const API_BASE = 'https://aivip.link';
const ANALYSIS_MODEL = 'gemini-3-pro-preview';
const CHARGE_INTERFACE_CODE = 'aify_dingtalk_any_analysis';
const CHARGE_API = `${API_BASE}/api/interface/${CHARGE_INTERFACE_CODE}/invoke`;
const AUTH_ID = 'aify_auth';
const ANALYSIS_COST = 20;

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

async function fetchWithAuth(context: DingTalkContext, url: string, options: any, authId?: string): Promise<any> {
  return context.fetch(url, options, authId);
}

async function charge(context: DingTalkContext, amount: number, imageCount: number): Promise<ChargeResult> {
  try {
    const requestBody = {
      action: 'plugin_charge',
      interface_code: CHARGE_INTERFACE_CODE,
      pack_id: context.extensionId,
      base_id: context.baseId,
      amount,
      image_count: imageCount,
    };
    console.log(JSON.stringify({
      tag: '===charge 计费请求',
      amount: requestBody.amount,
      imageCount: requestBody.image_count,
      hasPackId: Boolean(requestBody.pack_id),
      hasBaseId: Boolean(requestBody.base_id),
    }), '\n');

    const res = await fetchWithAuth(
      context,
      CHARGE_API,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      },
      AUTH_ID,
    );
    const resText = await res.text();
    let body: any = {};
    try {
      body = JSON.parse(resText);
    } catch {
      body = {};
    }
    console.log(JSON.stringify({
      tag: '===charge 计费返回',
      status: res.status,
      code: body?.code,
      cost: body?.data?.cost,
      remaining: body?.data?.remaining,
      requestId: body?.data?.request_id,
    }), '\n');

    if (res.ok && body?.code === 0) {
      return {
        ok: true,
        msg: '',
        cost: Number(body?.data?.cost ?? amount),
        remaining: Number(body?.data?.remaining ?? body?.data?.balance ?? 0),
      };
    }

    if (res.status === 402 || body?.code === 402) {
      return { ok: false, msg: '积分不足，请前往平台充值后再使用', quotaExhausted: true };
    }
    if (res.status === 401 || body?.code === 401) {
      return { ok: false, msg: 'API Key 无效，请检查授权配置' };
    }
    return { ok: false, msg: body?.message || '计费服务暂时不可用，请稍后重试' };
  } catch (e: any) {
    console.error(`[charge] exception: ${e?.message}`);
    return { ok: false, msg: '计费服务暂时不可用，请稍后重试' };
  }
}

fieldDecoratorKit.setDomainList([
  'aivip.link',
]);

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

function attachmentToImagePart(attachment: Attachment): any | null {
  const url = String(attachment.tmp_url || attachment.url || '').trim();
  if (!url) return null;

  return {
    type: 'image_url',
    image_url: {
      url,
      name: attachment.name,
      mime_type: attachment.type,
      size: attachment.size,
    },
  };
}

fieldDecoratorKit.setDecorator({
  name: 'AIFY分析',
  i18nMap: {
    'zh-CN': {
      promptLabel: '提示词',
      promptTooltip: '选择包含提示词的文本字段，AIFY 将以此为指令分析图片并生成新内容',
      imagesLabel: '图片列（每次20积分）',
      imagesTooltip: '选择一个附件字段，单格内最多分析 10 张图片。每次运行扣 20 积分。',
      authorizationName: 'AIFY API 授权',
      authorizationTooltip: '请访问 https://aivip.link/dashboard/apikey 查看或生成您的 API Key。',
    },
    'en-US': {
      promptLabel: 'Prompt',
      promptTooltip:
        'Select the text field containing the prompt. AIFY will use it as instructions to analyze images and generate new content.',
      imagesLabel: 'Image Field (20 pts per run)',
      imagesTooltip: 'Select one attachment field. Up to 10 images in the cell will be analyzed. Billing: 20 points per run.',
      authorizationName: 'AIFY API Authorization',
      authorizationTooltip: 'Visit https://aivip.link/dashboard/apikey to get your API Key.',
    },
    'ja-JP': {
      promptLabel: 'プロンプト',
      promptTooltip:
        'プロンプトを含むテキストフィールドを選択してください。AIFY がそれを指示として画像を分析し、新しいコンテンツを生成します。',
      imagesLabel: '画像列（1回20ポイント）',
      imagesTooltip: '添付フィールドを1つ選択してください。セル内の画像を最大10枚まで分析します。課金ルール：1回20ポイント。',
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

      const imageParts = imageItems
        .map((imgItem, index) => {
          const part = attachmentToImagePart(imgItem);
          debugLog({
            [`===4.${index + 1} 图片URL已读取`]: {
              name: imgItem.name,
              hasUrl: Boolean(part),
            },
          });
          return part;
        })
        .filter((part): part is any => Boolean(part));

      if (imageParts.length === 0) {
        debugLog({ '===5 错误': '所有图片URL均为空' });
        return { code: FieldExecuteCode.Error };
      }

      const userContent: any[] = [
        ...imageParts,
        {
          type: 'text',
          text: `补充产品信息（优先级最高）：${userPrompt}\n\n请严格按照系统提示词的分析框架分析图片，直接输出合法的 JSON 对象，以 { 开始，以 } 结束，不要任何前言或说明文字。`,
        },
      ];

      const chargeAmount = ANALYSIS_COST;
      const chargeResult = await charge(context, chargeAmount, imageParts.length);
      if (!chargeResult.ok) {
        debugLog({ '===5.5 扣费失败': { amount: chargeAmount, msg: chargeResult.msg } });
        if (chargeResult.quotaExhausted) {
          return { code: FieldExecuteCode.QuotaExhausted };
        }
        return { code: FieldExecuteCode.Error };
      }
      debugLog({
        '===5.5 扣费成功': {
          cost: chargeResult.cost ?? chargeAmount,
          imageCount: imageParts.length,
          remaining: chargeResult.remaining,
        },
      });

      const requestBody = {
        source: 'dingtalk_any_analysis',
        transfer_image_urls_to_cos: true,
        model: ANALYSIS_MODEL,
        amount: chargeAmount,
        cost: chargeAmount,
        image_count: imageParts.length,
        messages: [
          { role: 'system', content: '系统提示词由 aivip 后端提示词配置注入。' },
          { role: 'user', content: userContent },
        ],
        temperature: 0.1,
        max_tokens: 8192,
      };

      const geminiUrl = `${API_BASE}/api/analysis/gemini-vision`;
      debugLog({ '===5 发起AIFY分析请求': { url: geminiUrl, model: ANALYSIS_MODEL, imageCount: imageParts.length } });

      const geminiResp = await fetchWithAuth(
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
