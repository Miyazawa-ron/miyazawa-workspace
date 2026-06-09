export async function onRequestPost(context) {
  const { request, env } = context;

  // 验证访问密码
  const key = request.headers.get('X-Access-Key');
  if (!key || key !== env.ACCESS_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 解析请求体
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { text, source, target } = body;
  if (!text || !source || !target) {
    return new Response(JSON.stringify({ error: 'Missing fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const SYSTEM_PROMPTS = {
    'zh→en': 'Translate the following Chinese text to English. Output ONLY the translation.',
    'zh→ja': '以下の中国語テキストを日本語に翻訳してください。翻訳のみ出力してください。',
    'ja→zh': '将以下日语文本翻译成中文。只输出翻译结果。',
    'ja→en': 'Translate the following Japanese text to English. Output ONLY the translation.',
    'en→zh': '将以下英语文本翻译成中文。只输出翻译结果。',
    'en→ja': '以下の英語テキストを日本語に翻訳してください。翻訳のみ出力してください。',
  };

  const sysPrompt = SYSTEM_PROMPTS[`${source}→${target}`]
    || `Translate to ${target}. Output ONLY the translation.`;

  // 转发到本地 llama-server（通过 Cloudflare Tunnel）
  let llmRes;
  try {
    llmRes = await fetch(`${env.LLAMA_TUNNEL_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen',
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user',   content: text },
        ],
        max_tokens: 1024,
        temperature: 0.1,
      }),
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: `Model unreachable: ${err.message}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = await llmRes.json();
  const translation = data?.choices?.[0]?.message?.content?.trim();

  if (!translation) {
    return new Response(JSON.stringify({ error: 'Empty model response' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ translation }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
