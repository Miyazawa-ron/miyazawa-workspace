export async function onRequestPost(context) {
  const { request, env } = context;

  const key = request.headers.get('X-Access-Key');
  if (!key || key !== env.ACCESS_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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

  // Few-shot examples per direction.
  // Each entry: { system, examples: [{user, assistant}] }
  // Examples teach the model: no mixing languages, no English loanwords where native words exist,
  // no commentary, output target language only.
  const CONFIGS = {
    'zh→ja': {
      system: 'あなたはプロの中日翻訳者です。中国語を自然な日本語に翻訳してください。日本語のみ出力し、英語・中国語・説明文は一切含めないでください。',
      examples: [
        { user: '今天天气很好。',                         assistant: '今日はいい天気ですね。' },
        { user: '请把衣服拿去洗衣房烘干。',               assistant: '洗濯物をコインランドリーで乾燥させてください。' },
        { user: '这个项目的截止日期是下周五。',           assistant: 'このプロジェクトの締め切りは来週の金曜日です。' },
        { user: '我在公司负责平面设计工作。',             assistant: '私は会社でグラフィックデザインを担当しています。' },
      ],
    },
    'zh→en': {
      system: 'You are a professional Chinese-English translator. Translate the Chinese text into natural English. Output English only — no Chinese, no explanations.',
      examples: [
        { user: '今天天气很好。',                         assistant: "The weather is great today." },
        { user: '请把衣服拿去洗衣房烘干。',               assistant: "Please take the laundry to the laundromat to dry." },
        { user: '这个项目的截止日期是下周五。',           assistant: "The deadline for this project is next Friday." },
        { user: '我在公司负责平面设计工作。',             assistant: "I'm in charge of graphic design at the company." },
      ],
    },
    'ja→zh': {
      system: '你是一名专业的日中翻译。将日语翻译成自然流畅的中文。只输出中文，不含日语、英语或任何说明。',
      examples: [
        { user: '今日はいい天気ですね。',                 assistant: '今天天气真好。' },
        { user: '洗濯物をコインランドリーで乾燥させてください。', assistant: '请把洗好的衣服拿去洗衣房烘干。' },
        { user: 'このプロジェクトの締め切りは来週の金曜日です。', assistant: '这个项目的截止日期是下周五。' },
        { user: '電車が遅延しているため、会議に遅れそうです。',  assistant: '因为电车晚点，会议可能要迟到了。' },
      ],
    },
    'ja→en': {
      system: 'You are a professional Japanese-English translator. Translate the Japanese text into natural English. Output English only — no Japanese, no explanations.',
      examples: [
        { user: '今日はいい天気ですね。',                 assistant: "The weather is great today." },
        { user: '洗濯物をコインランドリーで乾燥させてください。', assistant: "Please take the laundry to the laundromat to dry." },
        { user: 'このプロジェクトの締め切りは来週の金曜日です。', assistant: "The deadline for this project is next Friday." },
        { user: '電車が遅延しているため、会議に遅れそうです。',  assistant: "The train is delayed, so I might be late for the meeting." },
      ],
    },
    'en→zh': {
      system: '你是一名专业的英中翻译。将英语翻译成自然流畅的中文。只输出中文，不含英语或任何说明。',
      examples: [
        { user: "The weather is great today.",             assistant: '今天天气真好。' },
        { user: "Please take the laundry to the laundromat to dry.", assistant: '请把洗好的衣服拿去洗衣房烘干。' },
        { user: "The deadline for this project is next Friday.",     assistant: '这个项目的截止日期是下周五。' },
        { user: "I'm in charge of graphic design at the company.",   assistant: '我在公司负责平面设计工作。' },
      ],
    },
    'en→ja': {
      system: 'あなたはプロの英日翻訳者です。英語を自然な日本語に翻訳してください。日本語のみ出力し、英語・説明文は一切含めないでください。',
      examples: [
        { user: "The weather is great today.",             assistant: '今日はいい天気ですね。' },
        { user: "Please take the laundry to the laundromat to dry.", assistant: '洗濯物をコインランドリーで乾燥させてください。' },
        { user: "The deadline for this project is next Friday.",     assistant: 'このプロジェクトの締め切りは来週の金曜日です。' },
        { user: "I'm in charge of graphic design at the company.",   assistant: '私は会社でグラフィックデザインを担当しています。' },
      ],
    },
  };

  const config = CONFIGS[`${source}→${target}`];
  const system  = config?.system || `Translate to ${target}. Output target language only.`;
  const shots   = config?.examples || [];

  const messages = [
    { role: 'system', content: system },
    ...shots.flatMap(e => [
      { role: 'user',      content: e.user },
      { role: 'assistant', content: e.assistant },
    ]),
    { role: 'user', content: text },
  ];

  let llmRes;
  try {
    llmRes = await fetch(`${env.LLAMA_TUNNEL_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen',
        messages,
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
