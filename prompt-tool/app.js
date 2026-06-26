(function () {
  "use strict";

  var STORAGE_KEY = "comfy-flow-factory-workflow";
  var SAVED_PRESETS_KEY = "comfy-flow-factory-saved-presets";
  var WORKFLOW_VERSION = 2;
  var MAX_JOB_PREVIEW = 16;
  var state = {
    nodes: [],
    connections: [],
    lastRun: null,
    savedPresets: [],
    saveDraftName: "",
    libraryMessage: "",
    workbench: {
      currentJobId: null,
      completedJobIds: {},
      filter: "pending",
      statusMessage: "",
      explorationOpen: false,
    },
  };

  var registry = new Map();
  var refs = {};

  var FORM_STEPS = [
    {
      id: "content",
      eyebrow: "Step 1",
      title: "标题与用途",
      description: "先定义这张图到底在讲什么，以及它要发到哪里。这里只保留最必要的手动输入。",
      tips: ["主题词尽量短而准", "A层冲击词适合填 2-4 个字", "用途会影响构图和版面比例"],
      nodeType: "chatgpt-poster-brief",
      columns: 2,
      fields: ["theme", "impactCore", "subtitle", "useCase"],
    },
    {
      id: "visual",
      eyebrow: "Step 2",
      title: "主视觉框架",
      description: "决定这张图像的第一眼冲击来自哪里。你只需要选方向，系统会帮你保持风格一致。",
      tips: ["透视策略决定标题怎么压住画面", "主题隐喻会影响叙事空间", "情绪越少，画面越稳定"],
      nodeType: "chatgpt-poster-brief",
      columns: 2,
      fields: ["illustrationDirection", "colorDirection", "perspectiveMode", "metaphorMode", "mood"],
    },
    {
      id: "guardrails",
      eyebrow: "Step 3",
      title: "版面补强与保护",
      description: "这一步是为了锁定高级感，避免普通封面、知识卡片感和信息泛滥。",
      tips: ["信息系统小字不要选太多", "禁用项越明确，跑偏概率越低"],
      nodeType: "chatgpt-poster-brief",
      columns: 2,
      fields: ["infoSystem", "avoid"],
    },
    {
      id: "variants",
      eyebrow: "Step 4",
      title: "变体与画幅",
      description: "这里决定同一套风格下要试哪些画幅、机位和附加变化，适合做一轮成组探索。",
      tips: ["先固定 1-2 个画幅", "机位不要一次加太多", "附加标签适合做轻微差异化"],
      nodeType: "variation-matrix",
      columns: 2,
      fields: ["aspectRatios", "cameraAngles", "extraTags"],
    },
    {
      id: "batch",
      eyebrow: "Step 5",
      title: "批量产出节奏",
      description: "最后决定这一轮要出几个版本。先从小批量开始，稳定后再放大。",
      tips: ["首轮建议 2-4 张", "确定方向后再扩大批量"],
      nodeType: "batch-seeds",
      columns: 1,
      fields: ["batchCount"],
    },
  ];

  var WORKFLOW_TEMPLATE = {
    version: WORKFLOW_VERSION,
    nodes: [
      {
        id: "cgpt-style",
        type: "style-pack",
        params: {
          styleName: "High Impact Cover",
          medium: "cinematic Chinese typography poster, trend campaign visual",
          palette: "scarlet red, cream white, charcoal black, electric blue accent",
          lighting: "dramatic spotlight, deep shadow, strong poster contrast",
          finish: "premium print texture, editorial polish, sharp readable title",
          promptSuffix: "commercial cover quality, social-first stop-scroll impact",
        },
      },
      {
        id: "cgpt-brief",
        type: "chatgpt-poster-brief",
        params: {
          theme: "爆款海报",
          impactCore: "爆款",
          subtitle: "让标题本身变成画面空间",
          languageMode: "中文",
          useCase: "小红书封面",
          illustrationDirection: "电影感",
          colorDirection: "红黑",
          perspectiveMode: "自动选择",
          metaphorMode: "自动理解",
          infoSystem: "Issue No.\nCampaign",
          extraContext: "聚焦中文标题冲击力与社交传播感，像电影主视觉和潮流广告之间的混合体。",
          mood: "热血\n反叛\n戏剧化",
          avoid: "普通排版\n小字主导\n廉价科技蓝紫\n模板感\n知识卡片感",
        },
      },
      {
        id: "cgpt-polish",
        type: "prompt-polish",
        params: {
          extraFlavor: "Chinese title must stay perfectly legible and dominate the frame",
          guardrails: "tiny title, flat layout, detached illustration, cheap poster look",
        },
      },
      {
        id: "cgpt-variation",
        type: "variation-matrix",
        params: {
          moods: "",
          cameraAngles: "low-angle monumental view\ndiagonal impact composition",
          aspectRatios: "4:5\n9:16",
          extraTags: "editorial cover\nmovie poster depth",
        },
      },
      {
        id: "cgpt-batch",
        type: "batch-seeds",
        params: {
          batchCount: 2,
          seedStart: 1,
          filenamePattern: "{style}-{variant}-{index}",
        },
      },
      {
        id: "cgpt-output",
        type: "chatgpt-images-plan",
        params: {
          outputFolder: "chatgpt-cover-batch",
          outputMode: "single-shot",
          deliveryNote: "只生成一张最终海报，不要输出解释，不要做多张草稿拼贴。",
        },
      },
    ],
    connections: [
      {
        id: "cgpt-conn-1",
        from: { nodeId: "cgpt-style", portKey: "style" },
        to: { nodeId: "cgpt-output", portKey: "style" },
      },
      {
        id: "cgpt-conn-2",
        from: { nodeId: "cgpt-brief", portKey: "prompt" },
        to: { nodeId: "cgpt-polish", portKey: "prompt" },
      },
      {
        id: "cgpt-conn-3",
        from: { nodeId: "cgpt-polish", portKey: "prompt" },
        to: { nodeId: "cgpt-output", portKey: "prompt" },
      },
      {
        id: "cgpt-conn-4",
        from: { nodeId: "cgpt-variation", portKey: "variations" },
        to: { nodeId: "cgpt-output", portKey: "variations" },
      },
      {
        id: "cgpt-conn-5",
        from: { nodeId: "cgpt-batch", portKey: "batch" },
        to: { nodeId: "cgpt-output", portKey: "batch" },
      },
    ],
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function splitItems(rawValue) {
    return String(rawValue || "")
      .split(/\n|,/)
      .map(function (item) {
        return item.trim();
      })
      .filter(Boolean);
  }

  function uniqueItems(items) {
    var seen = new Set();
    return items.filter(function (item) {
      var key = String(item || "").trim();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function resetWorkbench() {
    state.workbench = {
      currentJobId: null,
      completedJobIds: {},
      filter: "pending",
      statusMessage: "",
      explorationOpen: false,
    };
  }

  function loadSavedPresets() {
    try {
      var raw = localStorage.getItem(SAVED_PRESETS_KEY);
      if (!raw) {
        return [];
      }

      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("Unable to load saved presets", error);
      return [];
    }
  }

  function saveSavedPresets() {
    try {
      localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(state.savedPresets));
    } catch (error) {
      console.warn("Unable to save presets", error);
    }
  }

  function clearPersistedData() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn("Unable to clear workflow", error);
    }

    try {
      localStorage.removeItem(SAVED_PRESETS_KEY);
    } catch (error) {
      console.warn("Unable to clear presets", error);
    }
  }

  function combinePrompt(parts) {
    return parts
      .map(function (part) {
        return String(part || "").trim();
      })
      .filter(Boolean)
      .join(", ");
  }

  function joinBlocks(parts) {
    return parts
      .map(function (part) {
        return String(part || "").trim();
      })
      .filter(Boolean)
      .join("\n\n");
  }

  function sanitizeForFilename(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-") || "item";
  }

  function appendTokenValue(existingValue, nextValue) {
    return uniqueItems(splitItems(existingValue).concat([nextValue])).join("\n");
  }

  function removeTokenValue(existingValue, targetValue) {
    return splitItems(existingValue)
      .filter(function (item) {
        return item !== targetValue;
      })
      .join("\n");
  }

  function resolveAspectRatio(aspectRatio, baseWidth, baseHeight) {
    var fallback = {
      width: Number(baseWidth) || 1024,
      height: Number(baseHeight) || 1024,
    };

    if (!aspectRatio || !/^\d+\s*:\s*\d+$/.test(aspectRatio)) {
      return fallback;
    }

    var segments = aspectRatio.split(":");
    var ratioWidth = Number(segments[0]);
    var ratioHeight = Number(segments[1]);

    if (!ratioWidth || !ratioHeight) {
      return fallback;
    }

    var dominant = Math.max(fallback.width, fallback.height);
    var width;
    var height;

    if (ratioWidth >= ratioHeight) {
      width = dominant;
      height = Math.round((dominant * ratioHeight) / ratioWidth);
    } else {
      height = dominant;
      width = Math.round((dominant * ratioWidth) / ratioHeight);
    }

    return {
      width: Math.max(256, Math.round(width / 8) * 8),
      height: Math.max(256, Math.round(height / 8) * 8),
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function registerNode(definition) {
    registry.set(definition.type, definition);
  }

  function getNodeDefinition(type) {
    return registry.get(type);
  }

  function getNodeDefinitionOrFallback(type) {
    return (
      getNodeDefinition(type) || {
        type: type,
        title: "Unknown Node",
        fields: [],
        inputs: [],
        outputs: [],
        defaults: {},
        evaluate: function () {
          return {};
        },
      }
    );
  }

  function getNodeById(nodeId) {
    return state.nodes.find(function (node) {
      return node.id === nodeId;
    });
  }

  function getFirstNodeByType(type) {
    return state.nodes.find(function (node) {
      return node.type === type;
    });
  }

  function getFieldDefinition(node, key) {
    var definition = node ? getNodeDefinitionOrFallback(node.type) : null;
    return (
      (definition &&
        (definition.fields || []).find(function (field) {
          return field.key === key;
        })) ||
      null
    );
  }

  function buildChatGptPosterPrompt(params) {
    var moodText = splitItems(params.mood).join(", ");
    var avoidText = splitItems(params.avoid).join(", ");
    var infoSystemText = splitItems(params.infoSystem).join(", ");
    var impactCore = String(params.impactCore || "").trim();
    var titleStrategy = impactCore
      ? 'A-layer giant Chinese title should center on "' + impactCore + '" while preserving the full theme elsewhere.'
      : "If the theme is long, automatically extract a 2-8 Chinese character A-layer impact title while keeping the full theme in secondary text.";

    return joinBlocks([
      "Create one premium, high-impact Chinese poster cover image.",
      joinBlocks([
        "Main theme: " + (params.theme || ""),
        params.subtitle ? "Subtitle: " + params.subtitle : "",
        "Language mode: " + (params.languageMode || "中文"),
        "Use case: " + (params.useCase || "海报"),
        params.illustrationDirection
          ? "Illustration direction: " + params.illustrationDirection
          : "Illustration direction: choose automatically based on the theme.",
        params.colorDirection ? "Color direction: " + params.colorDirection : "",
        params.perspectiveMode && params.perspectiveMode !== "自动选择"
          ? "Preferred perspective strategy: " + params.perspectiveMode
          : "",
        params.metaphorMode && params.metaphorMode !== "自动理解"
          ? "Preferred metaphor direction: " + params.metaphorMode
          : "",
        params.extraContext ? "Extra context: " + params.extraContext : "",
        moodText ? "Mood: " + moodText : "",
      ]),
      joinBlocks([
        "Core visual logic: giant perspective Chinese title, high color conflict, narrative illustration, dramatic spatial depth, cinematic composition, trend advertising visual, stop-scroll cover design.",
        "The Chinese title must be the first focal point, occupy roughly 50% to 80% of the visual area, remain readable, and feel like part of the space: architecture, wall, road, racetrack, tunnel, stage, projection, ground plane, or a giant oppressive visual device.",
        "Typography must be bold, heavy, compressed or stretched when needed, with perspective, depth, thickness, shadow, and pressure. It cannot look like ordinary flat typesetting.",
        titleStrategy,
        infoSystemText ? "Preferred support info system: " + infoSystemText : "",
        "Use a clear three-layer text hierarchy when appropriate: A-layer giant impact title, B-layer full Chinese theme or subtitle, C-layer a small professional info system such as Issue No., Edition, Guide, Method, Manifesto, Field Notes, Campaign, Date, or short English support text.",
      ]),
      joinBlocks([
        "Choose the best perspective strategy automatically from the theme: ground typography, wall typography, ceiling pressure, diagonal impact, tunnel depth, giant projection, top-down mapping, low-angle monument, surrounding orbit, or fractured breakthrough.",
        "The illustration must interact with the title spatially. The subject should stand on the text, emerge from it, run along it, be covered by its shadow, be partially blocked by it, or use the title as the stage, wall, road, tunnel, or battlefield.",
        "The image must feel like a commercial poster, movie poster, esports key visual, fashion campaign, or editorial advertising cover instead of a knowledge card or template poster.",
      ]),
      joinBlocks([
        "Color direction: use strong high-contrast premium color relationships with a clean advanced finish. Keep it bold, striking, and scroll-stopping, but not dirty, chaotic, or cheap.",
        "Composition: asymmetrical when useful, strong hierarchy, strong depth, dramatic light, premium texture, print grain if appropriate, and a clear separation between primary title and supporting elements.",
      ]),
      joinBlocks([
        "Strictly avoid: small Chinese title, flat typography, weak perspective, detached illustration, ordinary social media card layout, ecommerce promo feel, generic neon tech gradient, messy clutter, unreadable Chinese text, or the illustration stealing the role of the title.",
        avoidText ? "Additional avoid list: " + avoidText : "",
        "Output only one final complete poster image. Do not output analysis, explanation, references, or multiple draft boards.",
      ]),
    ]);
  }

  function loadBuiltinNodes() {
    [
      {
        type: "style-pack",
        defaults: {
          styleName: "High Impact Cover",
          medium: "cinematic Chinese typography poster",
          palette: "scarlet red, cream white, charcoal black",
          lighting: "dramatic spotlight, deep shadow",
          finish: "premium print texture",
          promptSuffix: "",
        },
        outputs: [{ key: "style" }],
        evaluate: function (context) {
          return {
            style: {
              styleName: context.params.styleName,
              stylePrompt: combinePrompt([
                context.params.medium,
                context.params.palette,
                context.params.lighting,
                context.params.finish,
                context.params.promptSuffix,
              ]),
            },
          };
        },
      },
      {
        type: "chatgpt-poster-brief",
        defaults: {
          theme: "爆款海报",
          impactCore: "",
          subtitle: "",
          languageMode: "中文",
          useCase: "海报",
          illustrationDirection: "电影感",
          colorDirection: "高冲突撞色",
          perspectiveMode: "自动选择",
          metaphorMode: "自动理解",
          infoSystem: "Issue No.\nCampaign",
          extraContext: "",
          mood: "热血\n戏剧化",
          avoid: "模板感\n普通知识卡片\n小字主导",
        },
        fields: [
          { key: "theme", label: "主题词 / 主标题", type: "textarea" },
          { key: "impactCore", label: "A层冲击词（可空）", type: "text" },
          { key: "subtitle", label: "副标题", type: "text" },
          {
            key: "useCase",
            label: "用途",
            type: "select",
            options: ["X封面", "海报", "视频封面", "公众号封面", "小红书封面", "电影海报", "活动主视觉"],
          },
          {
            key: "illustrationDirection",
            label: "插图方向",
            type: "select",
            options: ["漫画", "写实", "半写实", "3D", "运动感", "电影感", "电竞感", "复古广告感"],
          },
          {
            key: "colorDirection",
            label: "配色倾向",
            type: "select",
            options: ["高冲突撞色", "红黑", "紫绿", "蓝粉", "橙蓝", "黄绿", "青红", "自由发挥"],
          },
          {
            key: "perspectiveMode",
            label: "透视策略",
            type: "select",
            options: [
              "自动选择",
              "地面透视字",
              "墙面透视字",
              "天花板压迫字",
              "斜切冲击字",
              "纵深隧道字",
              "巨型投影字",
              "俯视透视字",
              "仰视巨物字",
              "环绕包围字",
              "断裂爆破字",
            ],
          },
          {
            key: "metaphorMode",
            label: "主题隐喻",
            type: "select",
            options: [
              "自动理解",
              "道路 / 路线 / 导航",
              "节点 / 数据 / 信息通道",
              "楼梯 / 冲刺 / 逆袭",
              "广告牌 / 城市 / 流量入口",
              "悬崖 / 波动 / 风险边界",
              "墙体 / 阴影 / 对峙压迫",
              "舞台 / 群像 / 品牌宣言",
            ],
          },
          {
            key: "mood",
            label: "情绪倾向",
            type: "preset-list",
            presets: ["热血", "压迫", "反叛", "疯狂", "速度", "胜利", "危机", "孤独", "未来", "戏剧化"],
            allowCustom: true,
            customPlaceholder: "添加自定义情绪",
          },
          {
            key: "infoSystem",
            label: "信息系统小字",
            type: "preset-list",
            presets: [
              "Issue No.",
              "Volume",
              "Edition",
              "Date",
              "Campaign",
              "Manifesto",
              "Field Notes",
              "Strategy",
              "Method",
              "Action",
              "Speed",
              "Signal",
              "Power",
              "Guide",
              "01",
              "02",
              "03",
            ],
            allowCustom: true,
            customPlaceholder: "添加自定义小字标签",
          },
          {
            key: "avoid",
            label: "禁用元素",
            type: "preset-list",
            presets: [
              "中文标题太小",
              "普通横排标题",
              "没有透视",
              "没有空间纵深",
              "插图只是摆拍",
              "配色太普通",
              "只有黑白灰",
              "像普通知识海报",
              "像电商促销图",
              "模板感",
              "廉价科技蓝紫",
              "小字主导",
              "人物抢走标题主角",
              "构图太平",
              "普通排版",
              "知识卡片感",
            ],
            allowCustom: true,
            customPlaceholder: "添加更多禁用项",
          },
        ],
        outputs: [{ key: "prompt" }],
        evaluate: function (context) {
          return {
            prompt: {
              positive: buildChatGptPosterPrompt(context.params),
              negative: combinePrompt([
                context.params.avoid,
                "small Chinese title",
                "flat typography",
                "no spatial depth",
                "template poster",
                "cheap layout",
              ]),
            },
          };
        },
      },
      {
        type: "prompt-polish",
        defaults: {
          extraFlavor: "",
          guardrails: "",
        },
        inputs: [{ key: "prompt" }],
        outputs: [{ key: "prompt" }],
        evaluate: function (context) {
          var upstream = context.inputs.prompt || { positive: "", negative: "" };
          var positiveJoiner =
            String(upstream.positive || "").indexOf("\n") >= 0 ||
            String(context.params.extraFlavor || "").indexOf("\n") >= 0
              ? joinBlocks
              : combinePrompt;
          var negativeJoiner =
            String(upstream.negative || "").indexOf("\n") >= 0 ||
            String(context.params.guardrails || "").indexOf("\n") >= 0
              ? joinBlocks
              : combinePrompt;

          return {
            prompt: {
              positive: positiveJoiner([upstream.positive, context.params.extraFlavor]),
              negative: negativeJoiner([upstream.negative, context.params.guardrails]),
            },
          };
        },
      },
      {
        type: "variation-matrix",
        defaults: {
          moods: "",
          cameraAngles: "low-angle monumental view\ndiagonal impact composition",
          aspectRatios: "4:5\n9:16",
          extraTags: "editorial cover\nmovie poster depth",
        },
        fields: [
          {
            key: "aspectRatios",
            label: "画幅列表",
            type: "preset-list",
            presets: ["1:1", "4:5", "3:2", "16:9", "9:16", "5:2"],
            allowCustom: false,
          },
          {
            key: "cameraAngles",
            label: "机位列表",
            type: "preset-list",
            presets: [
              "eye-level",
              "three-quarter angle",
              "top-down composition",
              "low-angle monumental view",
              "diagonal impact composition",
              "wide cinematic framing",
            ],
            allowCustom: true,
            customPlaceholder: "添加自定义机位",
          },
          {
            key: "extraTags",
            label: "附加标签",
            type: "preset-list",
            presets: ["editorial cover", "movie poster depth", "brand storytelling", "micro contrast", "commercial finish"],
            allowCustom: true,
            customPlaceholder: "添加自定义附加标签",
          },
        ],
        outputs: [{ key: "variations" }],
        evaluate: function (context) {
          var baseMoods = splitItems(context.params.moods);
          var angles = splitItems(context.params.cameraAngles);
          var ratios = splitItems(context.params.aspectRatios);
          var extras = splitItems(context.params.extraTags);
          var safeMoods = baseMoods.length ? baseMoods : [""];
          var safeAngles = angles.length ? angles : [""];
          var safeRatios = ratios.length ? ratios : ["1:1"];
          var safeExtras = extras.length ? extras : [""];
          var items = [];

          safeMoods.forEach(function (mood) {
            safeAngles.forEach(function (angle) {
              safeRatios.forEach(function (ratio) {
                safeExtras.forEach(function (extra) {
                  var label = [mood, angle, ratio, extra].filter(Boolean).join(" / ") || "base";
                  items.push({
                    label: label,
                    mood: mood,
                    cameraAngle: angle,
                    aspectRatio: ratio,
                    extra: extra,
                    promptParts: [mood, angle, extra].filter(Boolean),
                  });
                });
              });
            });
          });

          return {
            variations: {
              items: items,
            },
          };
        },
      },
      {
        type: "batch-seeds",
        defaults: {
          batchCount: 2,
          seedStart: 1,
          filenamePattern: "{style}-{variant}-{index}",
        },
        fields: [{ key: "batchCount", label: "每个变体生成数", type: "number", min: 1, step: 1 }],
        outputs: [{ key: "batch" }],
        evaluate: function (context) {
          var count = Math.max(1, Number(context.params.batchCount) || 1);
          var seedStart = Number(context.params.seedStart) || 1;
          var seeds = [];
          var index;
          for (index = 0; index < count; index += 1) {
            seeds.push(seedStart + index);
          }
          return {
            batch: {
              seeds: seeds,
              filenamePattern: context.params.filenamePattern || "{style}-{variant}-{seed}",
            },
          };
        },
      },
      {
        type: "chatgpt-images-plan",
        defaults: {
          outputFolder: "chatgpt-image-batch",
          outputMode: "single-shot",
          deliveryNote: "只生成一张最终图，不要解释。",
        },
        inputs: [
          { key: "style" },
          { key: "prompt" },
          { key: "variations" },
          { key: "batch" },
        ],
        outputs: [{ key: "jobs" }],
        evaluate: function (context) {
          var style = context.inputs.style || {};
          var prompt = context.inputs.prompt || {};
          var variations = (context.inputs.variations && context.inputs.variations.items) || [
            { label: "base", aspectRatio: "1:1", promptParts: [], mood: "", cameraAngle: "" },
          ];
          var batch = context.inputs.batch || {
            seeds: [1],
            filenamePattern: "{style}-{variant}-{seed}",
          };
          var jobs = [];
          var counter = 0;

          variations.forEach(function (variation) {
            batch.seeds.forEach(function (seed) {
              counter += 1;
              var styleSlug = sanitizeForFilename(style.styleName || "chatgpt");
              var variantSlug = sanitizeForFilename(variation.label || "base");
              var fileName = (batch.filenamePattern || "{style}-{variant}-{seed}")
                .replace(/\{style\}/g, styleSlug)
                .replace(/\{variant\}/g, variantSlug)
                .replace(/\{seed\}/g, String(seed))
                .replace(/\{index\}/g, String(counter));
              var chatPrompt = joinBlocks([
                prompt.positive || "",
                style.stylePrompt ? "Additional style finish: " + style.stylePrompt : "",
                variation.mood ? "Mood emphasis: " + variation.mood : "",
                variation.cameraAngle ? "Camera / perspective emphasis: " + variation.cameraAngle : "",
                variation.aspectRatio ? "Aspect ratio: " + variation.aspectRatio : "",
                variation.extra ? "Extra variation tag: " + variation.extra : "",
                prompt.negative ? "Avoid: " + prompt.negative : "",
                context.params.deliveryNote || "",
              ]);

              jobs.push({
                index: counter,
                jobId: fileName + "-" + seed,
                fileName: fileName + ".txt",
                folder: context.params.outputFolder || "chatgpt-image-batch",
                styleName: style.styleName || "ChatGPT Images",
                prompt: chatPrompt,
                negative: prompt.negative || "",
                seed: seed,
                aspectRatio: variation.aspectRatio || "1:1",
                outputMode: context.params.outputMode || "single-shot",
                target: "ChatGPT Images",
                notes: [variation.label, variation.extra].filter(Boolean).join(" | "),
              });
            });
          });

          return {
            jobs: jobs,
            summary: {
              styleName: style.styleName || "ChatGPT Images",
              variationCount: variations.length,
              batchCount: batch.seeds.length,
              totalJobs: jobs.length,
              outputFolder: context.params.outputFolder || "chatgpt-image-batch",
              target: "ChatGPT Images",
            },
          };
        },
      },
    ].forEach(registerNode);
  }

  function applyWorkflow(data) {
    var incoming = clone(data);
    state.nodes = (incoming.nodes || []).map(function (node) {
      var definition = getNodeDefinitionOrFallback(node.type);
      return {
        id: node.id,
        type: node.type,
        params: Object.assign({}, clone(definition.defaults || {}), node.params || {}),
      };
    });
    state.connections = clone(incoming.connections || []);
    state.lastRun = null;
    resetWorkbench();
    if (!String(state.saveDraftName || "").trim()) {
      state.saveDraftName = guessPresetName();
    }
    saveWorkflow();
    render();
  }

  function saveWorkflow() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: WORKFLOW_VERSION,
          nodes: state.nodes,
          connections: state.connections,
        })
      );
    } catch (error) {
      console.warn("Unable to save workflow", error);
    }
  }

  function loadPersistedWorkflow() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch (error) {
      console.warn("Unable to load workflow", error);
      return null;
    }
  }

  function createWorkflowSnapshot() {
    return {
      version: WORKFLOW_VERSION,
      nodes: clone(state.nodes),
      connections: clone(state.connections),
    };
  }

  function guessPresetName() {
    var briefNode = getFirstNodeByType("chatgpt-poster-brief");
    var theme = briefNode && briefNode.params.theme ? String(briefNode.params.theme).trim() : "";
    var useCase = briefNode && briefNode.params.useCase ? String(briefNode.params.useCase).trim() : "";
    return [theme, useCase].filter(Boolean).join(" - ") || "未命名方案";
  }

  function setLibraryMessage(message) {
    state.libraryMessage = message;
    renderSummary();
  }

  function saveCurrentPreset() {
    var name = String(state.saveDraftName || "").trim() || guessPresetName();
    var briefNode = getFirstNodeByType("chatgpt-poster-brief");
    var payload = createWorkflowSnapshot();
    var existingIndex = state.savedPresets.findIndex(function (preset) {
      return preset.name === name;
    });
    var now = new Date().toISOString();
    var nextPreset = {
      id: existingIndex >= 0 ? state.savedPresets[existingIndex].id : "preset-" + Date.now(),
      name: name,
      updatedAt: now,
      theme: briefNode && briefNode.params.theme ? briefNode.params.theme : "",
      useCase: briefNode && briefNode.params.useCase ? briefNode.params.useCase : "",
      payload: payload,
    };

    if (existingIndex >= 0) {
      state.savedPresets.splice(existingIndex, 1, nextPreset);
      state.libraryMessage = "已更新已存在的方案，可随时重新载入。";
    } else {
      state.savedPresets.unshift(nextPreset);
      state.libraryMessage = "当前配置已保存成命名方案。";
    }

    state.saveDraftName = name;
    saveSavedPresets();
    renderSummary();
  }

  function loadPresetById(presetId) {
    var preset = state.savedPresets.find(function (item) {
      return item.id === presetId;
    });

    if (!preset) {
      return;
    }

    state.libraryMessage = '已载入方案“' + preset.name + '”，现在可以直接改标题或文字。';
    state.saveDraftName = preset.name;
    applyWorkflow(preset.payload);
  }

  function deletePresetById(presetId) {
    var preset = state.savedPresets.find(function (item) {
      return item.id === presetId;
    });

    state.savedPresets = state.savedPresets.filter(function (item) {
      return item.id !== presetId;
    });

    if (preset && state.saveDraftName === preset.name) {
      state.saveDraftName = "";
    }

    state.libraryMessage = preset ? '已删除方案“' + preset.name + '”。' : "";
    saveSavedPresets();
    renderSummary();
  }

  function hasFieldValue(field, value) {
    if (field && field.type === "preset-list") {
      return splitItems(value).length > 0;
    }
    return String(value == null ? "" : value).trim().length > 0;
  }

  function getFieldWrapperClassName(node, field, value) {
    var classNames = ["field"];

    if (field && (field.type === "select" || field.type === "preset-list")) {
      classNames.push("is-menu-field");
    }

    if (field && field.type === "preset-list") {
      classNames.push("is-token-field");
    }

    if (hasFieldValue(field, value)) {
      classNames.push("is-filled");
    }

    return classNames.join(" ");
  }

  function setNodeFieldValue(nodeId, key, value, options) {
    var node = getNodeById(nodeId);
    var nextOptions = options || {};
    if (!node) {
      return;
    }
    node.params[key] = value;
    state.lastRun = null;
    resetWorkbench();
    saveWorkflow();

    if (nextOptions.rerenderForm) {
      render();
      return;
    }

    updateFieldVisualState(nodeId, key, value);
    renderHeroPills();
    renderSummary();
    renderResults();
  }

  function evaluateNode(nodeId, cache, stack) {
    if (cache[nodeId]) {
      return cache[nodeId];
    }
    if (stack[nodeId]) {
      throw new Error("检测到循环依赖，请检查工作流配置。");
    }

    var node = getNodeById(nodeId);
    if (!node) {
      throw new Error("未找到节点: " + nodeId);
    }
    var definition = getNodeDefinitionOrFallback(node.type);
    stack[nodeId] = true;

    var inputs = {};
    (definition.inputs || []).forEach(function (inputDef) {
      var connection = state.connections.find(function (entry) {
        return entry.to.nodeId === nodeId && entry.to.portKey === inputDef.key;
      });
      if (!connection) {
        inputs[inputDef.key] = null;
        return;
      }
      var upstream = evaluateNode(connection.from.nodeId, cache, stack);
      inputs[inputDef.key] = upstream[connection.from.portKey] || null;
    });

    var result = definition.evaluate({
      node: node,
      params: node.params,
      inputs: inputs,
    });

    cache[nodeId] = result;
    delete stack[nodeId];
    return result;
  }

  function runWorkflow() {
    var outputNode = getFirstNodeByType("chatgpt-images-plan");
    if (!outputNode) {
      throw new Error("缺少输出节点。");
    }
    var result = evaluateNode(outputNode.id, {}, {});
    return {
      createdAt: new Date().toISOString(),
      outputs: [
        {
          nodeId: outputNode.id,
          title: outputNode.params.outputFolder || "chatgpt-image-batch",
          jobs: result.jobs || [],
          summary: result.summary || {},
        },
      ],
      jobs: result.jobs || [],
    };
  }

  function getJobKey(job) {
    return String((job && (job.jobId || job.fileName || job.index)) || "");
  }

  function isJobCompleted(job) {
    return !!state.workbench.completedJobIds[getJobKey(job)];
  }

  function getCompletedJobCount() {
    if (!state.lastRun || !state.lastRun.jobs) {
      return 0;
    }

    return state.lastRun.jobs.filter(isJobCompleted).length;
  }

  function getPendingJobs() {
    if (!state.lastRun || !state.lastRun.jobs) {
      return [];
    }

    return state.lastRun.jobs.filter(function (job) {
      return !isJobCompleted(job);
    });
  }

  function getFilteredJobs() {
    if (!state.lastRun || !state.lastRun.jobs) {
      return [];
    }

    if (state.workbench.filter === "completed") {
      return state.lastRun.jobs.filter(isJobCompleted);
    }

    if (state.workbench.filter === "all") {
      return state.lastRun.jobs.slice();
    }

    return getPendingJobs();
  }

  function resolveCurrentJob(filteredJobs) {
    var jobs = filteredJobs || getFilteredJobs();
    var selectedJob = jobs.find(function (job) {
      return getJobKey(job) === state.workbench.currentJobId;
    });

    if (selectedJob) {
      return selectedJob;
    }

    return jobs[0] || null;
  }

  function syncWorkbenchSelection() {
    var filteredJobs = getFilteredJobs();
    var currentJob = resolveCurrentJob(filteredJobs);
    state.workbench.currentJobId = currentJob ? getJobKey(currentJob) : null;
    return currentJob;
  }

  function initializeWorkbenchForRun() {
    resetWorkbench();
    syncWorkbenchSelection();
  }

  function toggleExplorationPanel(forceValue) {
    if (typeof forceValue === "boolean") {
      state.workbench.explorationOpen = forceValue;
    } else {
      state.workbench.explorationOpen = !state.workbench.explorationOpen;
    }

    renderResults();
  }

  function setWorkbenchFilter(filter) {
    state.workbench.filter = filter;
    syncWorkbenchSelection();
    renderResults();
  }

  function setCurrentJobById(jobId) {
    state.workbench.currentJobId = jobId;
    renderResults();
  }

  function setJobCompleted(jobId, completed) {
    if (completed) {
      state.workbench.completedJobIds[jobId] = true;
    } else {
      delete state.workbench.completedJobIds[jobId];
    }

    syncWorkbenchSelection();
    renderResults();
  }

  function moveCurrentJob(direction) {
    var filteredJobs = getFilteredJobs();
    var currentJob = resolveCurrentJob(filteredJobs);

    if (!currentJob || !filteredJobs.length) {
      return;
    }

    var currentIndex = filteredJobs.findIndex(function (job) {
      return getJobKey(job) === getJobKey(currentJob);
    });

    if (currentIndex < 0) {
      return;
    }

    var nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= filteredJobs.length) {
      return;
    }

    state.workbench.currentJobId = getJobKey(filteredJobs[nextIndex]);
    renderResults();
  }

  function markCurrentJobComplete() {
    var currentJob = syncWorkbenchSelection();
    var pendingBefore = getPendingJobs();
    var currentKey = currentJob ? getJobKey(currentJob) : null;

    if (!currentJob || !currentKey) {
      return;
    }

    state.workbench.completedJobIds[currentKey] = true;

    if (state.workbench.filter === "completed") {
      state.workbench.currentJobId = currentKey;
    } else {
      var nextPendingJob = pendingBefore.find(function (job) {
        return getJobKey(job) !== currentKey;
      });
      state.workbench.currentJobId = nextPendingJob ? getJobKey(nextPendingJob) : null;
    }

    state.workbench.statusMessage = "已标记完成，可继续下一条。";
    syncWorkbenchSelection();
    renderResults();
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    var fallback = document.createElement("textarea");
    fallback.value = text;
    fallback.setAttribute("readonly", "readonly");
    fallback.style.position = "absolute";
    fallback.style.left = "-9999px";
    document.body.appendChild(fallback);
    fallback.select();

    var success = false;
    try {
      success = document.execCommand("copy");
    } finally {
      document.body.removeChild(fallback);
    }

    if (!success) {
      throw new Error("copy-failed");
    }

    return true;
  }

  function findJobById(jobId) {
    if (!state.lastRun || !state.lastRun.jobs) {
      return null;
    }

    return (
      state.lastRun.jobs.find(function (job) {
        return getJobKey(job) === jobId;
      }) || null
    );
  }

  async function copyJobPrompt(jobId) {
    var job = findJobById(jobId);

    if (!job) {
      return;
    }

    try {
      await copyTextToClipboard(job.prompt || "");
      state.workbench.statusMessage = "当前 prompt 已复制，去 ChatGPT 直接粘贴即可。";
    } catch (error) {
      state.workbench.statusMessage = "复制失败，请手动复制当前 prompt。";
    }

    renderResults();
  }

  async function copyCurrentPrompt() {
    var currentJob = syncWorkbenchSelection();

    if (!currentJob) {
      return;
    }
    await copyJobPrompt(getJobKey(currentJob));
  }

  function getPrimaryJob() {
    if (!state.lastRun || !state.lastRun.jobs || !state.lastRun.jobs.length) {
      return null;
    }

    return state.lastRun.jobs[0];
  }

  function getExplorationSummary() {
    var variationNode = getFirstNodeByType("variation-matrix");
    var batchNode = getFirstNodeByType("batch-seeds");

    return {
      aspectRatioCount: splitItems(variationNode && variationNode.params.aspectRatios).length || 1,
      cameraAngleCount: splitItems(variationNode && variationNode.params.cameraAngles).length || 1,
      extraTagCount: splitItems(variationNode && variationNode.params.extraTags).length || 1,
      batchCount: Math.max(1, Number(batchNode && batchNode.params.batchCount) || 1),
    };
  }

  function buildHeroPills() {
    var briefNode = getFirstNodeByType("chatgpt-poster-brief");
    var variationNode = getFirstNodeByType("variation-matrix");
    var batchNode = getFirstNodeByType("batch-seeds");

    return uniqueItems(
      [
        briefNode && briefNode.params.theme ? "主题 " + briefNode.params.theme : "",
        briefNode && briefNode.params.useCase ? "用途 " + briefNode.params.useCase : "",
        briefNode && briefNode.params.colorDirection ? "配色 " + briefNode.params.colorDirection : "",
        briefNode && briefNode.params.perspectiveMode ? "透视 " + briefNode.params.perspectiveMode : "",
        variationNode && splitItems(variationNode.params.aspectRatios).length
          ? "画幅 " + splitItems(variationNode.params.aspectRatios).join(" / ")
          : "",
        batchNode && batchNode.params.batchCount ? "每组 " + batchNode.params.batchCount + " 张" : "",
      ].filter(Boolean)
    );
  }

  function renderHeroPills() {
    var heroPills = buildHeroPills();
    var heroStrip = document.getElementById("hero-pill-strip");

    if (!heroStrip) {
      return;
    }

    heroStrip.innerHTML = heroPills
      .map(function (pill) {
        return '<span class="pill">' + escapeHtml(pill) + "</span>";
      })
      .join("");
  }

  function updateFieldVisualState(nodeId, key, value) {
    var wrapper = refs.form.querySelector(
      '[data-field-wrapper-key="' + key + '"][data-node-id="' + nodeId + '"]'
    );
    var node = getNodeById(nodeId);
    var field = getFieldDefinition(node, key);

    if (!wrapper || !field) {
      return;
    }

    wrapper.classList.toggle("is-filled", hasFieldValue(field, value));
  }

  function renderFieldControl(node, field) {
    var value = node.params[field.key];
    var wrapperClassName = getFieldWrapperClassName(node, field, value);
    var wrapperData =
      ' class="' +
      escapeHtml(wrapperClassName) +
      '" data-field-wrapper-key="' +
      escapeHtml(field.key) +
      '" data-node-id="' +
      escapeHtml(node.id) +
      '"';

    if (field.type === "preset-list") {
      var selectedItems = splitItems(value);
      var selectedHtml = selectedItems.length
        ? selectedItems
            .map(function (item) {
              return (
                '<button type="button" class="token-pill" data-remove-token="' +
                escapeHtml(field.key) +
                '" data-token-value="' +
                escapeHtml(item) +
                '" data-node-id="' +
                escapeHtml(node.id) +
                '">' +
                escapeHtml(item) +
                '<span aria-hidden="true"> x</span></button>'
              );
            })
            .join("")
        : '<div class="muted">还没有选择任何预设。</div>';

      var optionsHtml = (field.presets || [])
        .map(function (option) {
          var disabled = selectedItems.indexOf(option) >= 0 ? ' disabled="disabled"' : "";
          return '<option value="' + escapeHtml(option) + '"' + disabled + ">" + escapeHtml(option) + "</option>";
        })
        .join("");

      return (
        "<div" +
        wrapperData +
        "><label>" +
        escapeHtml(field.label) +
        '</label><div class="token-builder">' +
        '<div class="token-list">' +
        selectedHtml +
        "</div>" +
        '<div class="token-controls">' +
        '<select data-token-select="' +
        escapeHtml(field.key) +
        '" data-node-id="' +
        escapeHtml(node.id) +
        '">' +
        '<option value="">选择预设项</option>' +
        optionsHtml +
        "</select>" +
        '<button type="button" class="ghost small" data-add-token="' +
        escapeHtml(field.key) +
        '" data-node-id="' +
        escapeHtml(node.id) +
        '">添加</button></div>' +
        (field.allowCustom
          ? '<div class="token-controls"><input type="text" data-custom-token-input="' +
            escapeHtml(field.key) +
            '" data-node-id="' +
            escapeHtml(node.id) +
            '" placeholder="' +
            escapeHtml(field.customPlaceholder || "添加自定义项") +
            '" />' +
            '<button type="button" class="ghost small" data-add-custom-token="' +
            escapeHtml(field.key) +
            '" data-node-id="' +
            escapeHtml(node.id) +
            '">添加自定义</button></div>'
          : "") +
        "</div></div>"
      );
    }

    if (field.type === "textarea") {
      return (
        "<div" +
        wrapperData +
        '><label for="' +
        escapeHtml(node.id + "-" + field.key) +
        '">' +
        escapeHtml(field.label) +
        '</label><textarea id="' +
        escapeHtml(node.id + "-" + field.key) +
        '" data-field-key="' +
        escapeHtml(field.key) +
        '" data-node-id="' +
        escapeHtml(node.id) +
        '">' +
        escapeHtml(value == null ? "" : value) +
        "</textarea></div>"
      );
    }

    if (field.type === "select") {
      return (
        "<div" +
        wrapperData +
        '><label for="' +
        escapeHtml(node.id + "-" + field.key) +
        '">' +
        escapeHtml(field.label) +
        '</label><select id="' +
        escapeHtml(node.id + "-" + field.key) +
        '" data-field-key="' +
        escapeHtml(field.key) +
        '" data-node-id="' +
        escapeHtml(node.id) +
        '">' +
        field.options
          .map(function (option) {
            var selected = String(option) === String(value) ? ' selected="selected"' : "";
            return '<option value="' + escapeHtml(option) + '"' + selected + ">" + escapeHtml(option) + "</option>";
          })
          .join("") +
        "</select></div>"
      );
    }

    return (
      "<div" +
      wrapperData +
      '><label for="' +
      escapeHtml(node.id + "-" + field.key) +
      '">' +
      escapeHtml(field.label) +
      '</label><input id="' +
      escapeHtml(node.id + "-" + field.key) +
      '" type="' +
      (field.type === "number" ? "number" : "text") +
      '" data-field-key="' +
      escapeHtml(field.key) +
      '" data-node-id="' +
      escapeHtml(node.id) +
      '" value="' +
      escapeHtml(value == null ? "" : value) +
      '"' +
      (field.min != null ? ' min="' + escapeHtml(field.min) + '"' : "") +
      (field.step != null ? ' step="' + escapeHtml(field.step) + '"' : "") +
      " /></div>"
    );
  }

  function renderSummary() {
    var briefNode = getFirstNodeByType("chatgpt-poster-brief");
    var variationNode = getFirstNodeByType("variation-matrix");
    var batchNode = getFirstNodeByType("batch-seeds");
    var variationOutput = variationNode ? evaluateNode(variationNode.id, {}, {}) : { variations: { items: [] } };
    var aspectRatioCount = splitItems(variationNode && variationNode.params.aspectRatios).length || 1;
    var angleCount = splitItems(variationNode && variationNode.params.cameraAngles).length || 1;
    var batchCount = Math.max(1, Number(batchNode && batchNode.params.batchCount) || 1);
    var estimatedJobs = ((variationOutput.variations && variationOutput.variations.items.length) || 1) * batchCount;

    var chips = uniqueItems(
      [
        briefNode && briefNode.params.theme ? "主题 " + briefNode.params.theme : "",
        briefNode && briefNode.params.useCase ? "用途 " + briefNode.params.useCase : "",
        briefNode && briefNode.params.colorDirection ? "配色 " + briefNode.params.colorDirection : "",
        briefNode && briefNode.params.perspectiveMode ? "透视 " + briefNode.params.perspectiveMode : "",
        variationNode && splitItems(variationNode.params.aspectRatios).length
          ? "画幅 " + splitItems(variationNode.params.aspectRatios).join(" / ")
          : "",
        batchNode && batchNode.params.batchCount ? "每组 " + batchNode.params.batchCount + " 张" : "",
      ].filter(Boolean)
    );

    refs.summary.innerHTML =
      '<div class="summary-card">' +
      '<strong>本轮输出摘要</strong>' +
      '<div class="summary-strip">' +
      chips
        .map(function (chip) {
          return '<span class="pill">' + escapeHtml(chip) + "</span>";
        })
        .join("") +
      "</div>" +
      '<div class="summary-metrics">' +
      '<div class="metric-card"><span>预估任务数</span><strong>' +
      escapeHtml(String(estimatedJobs)) +
      "</strong></div>" +
      '<div class="metric-card"><span>画幅组合</span><strong>' +
      escapeHtml(String(aspectRatioCount)) +
      "</strong></div>" +
      '<div class="metric-card"><span>机位变化</span><strong>' +
      escapeHtml(String(angleCount)) +
      "</strong></div>" +
      "</div>" +
      '<div class="summary-group">' +
      '<div class="summary-line"><span>标题</span><strong>' +
      escapeHtml((briefNode && briefNode.params.theme) || "未填写") +
      "</strong></div>" +
      '<div class="summary-line"><span>冲击词</span><strong>' +
      escapeHtml((briefNode && briefNode.params.impactCore) || "自动提炼") +
      "</strong></div>" +
      '<div class="summary-line"><span>透视</span><strong>' +
      escapeHtml((briefNode && briefNode.params.perspectiveMode) || "自动选择") +
      "</strong></div>" +
      '<div class="summary-line"><span>批量</span><strong>' +
      escapeHtml(String((batchNode && batchNode.params.batchCount) || 1)) +
      " 张 / 变体</strong></div>" +
      "</div>" +
      '<div class="summary-note">系统已把大部分风格规则、标题层级、空间透视和高级感保护逻辑固定在底层。这里的表单只负责你真正需要控制的少数变量，能明显减少跑偏。</div>' +
      "</div>" +
      '<div class="summary-card save-library-card"><div class="prompt-card-head"><strong>保存方案</strong><span class="muted">下次载入后直接改标题或文字</span></div><div class="save-controls"><input type="text" class="save-name-input" data-save-name-input="true" placeholder="给当前方案起个名字" value="' +
      escapeHtml(state.saveDraftName || "") +
      '" /><button type="button" class="primary" data-save-preset="true">保存当前方案</button></div>' +
      (state.libraryMessage ? '<div class="workbench-status">' + escapeHtml(state.libraryMessage) + "</div>" : "") +
      (state.savedPresets.length
        ? '<div class="saved-list">' +
          state.savedPresets
            .map(function (preset) {
              return '<div class="saved-item"><div class="saved-item-copy"><strong>' +
                escapeHtml(preset.name) +
                '</strong><span class="muted">' +
                escapeHtml([preset.theme, preset.useCase].filter(Boolean).join(" / ") || "可复用方案") +
                '</span></div><div class="saved-item-actions"><button type="button" class="ghost small" data-load-preset="' +
                escapeHtml(preset.id) +
                '">载入</button><button type="button" class="ghost small" data-delete-preset="' +
                escapeHtml(preset.id) +
                '">删除</button></div></div>';
            })
            .join("") +
          "</div>"
        : '<div class="muted">还没有保存过命名方案。保存一次后，这里就会出现可复用列表。</div>') +
      "</div>";
  }

  function renderForm() {
    var heroPills = buildHeroPills();

    var stepsHtml = FORM_STEPS.map(function (step) {
      var node = getFirstNodeByType(step.nodeType);
      var definition = getNodeDefinitionOrFallback(step.nodeType);
      var fieldsHtml = step.fields
        .map(function (fieldKey) {
          var field = (definition.fields || []).find(function (item) {
            return item.key === fieldKey;
          });
          return field && node ? renderFieldControl(node, field) : "";
        })
        .join("");

      var tipsHtml = (step.tips || [])
        .map(function (tip) {
          return "<li>" + escapeHtml(tip) + "</li>";
        })
        .join("");

      return (
        '<section class="step-row" data-step-id="' +
        escapeHtml(step.id) +
        '">' +
        '<div class="step-index">' +
        escapeHtml(step.eyebrow) +
        "</div>" +
        '<div class="step-card">' +
        '<div class="step-card-head"><p class="step-label">' +
        escapeHtml(step.eyebrow) +
        "</p><h3>" +
        escapeHtml(step.title) +
        "</h3><p>" +
        escapeHtml(step.description) +
        "</p></div>" +
        '<div class="field-grid columns-' +
        Number(step.columns || 1) +
        '">' +
        fieldsHtml +
        "</div>" +
        (tipsHtml ? '<div class="step-tips"><p class="helper-text">填写建议</p><ul>' + tipsHtml + "</ul></div>" : "") +
        "</div></section>"
      );
    }).join("");

    refs.form.innerHTML =
      '<section class="form-hero">' +
      '<div class="form-hero-copy"><p class="eyebrow">Product Form</p><h2>快速出图表单</h2><p>按步骤填写即可。底层依然会自动拼装完整工作流，但前台已经完全改成属性表单，适合稳定批量执行。</p></div>' +
      '<div class="form-hero-meta"><div id="hero-pill-strip" class="summary-strip">' +
      heroPills
        .map(function (pill) {
          return '<span class="pill">' + escapeHtml(pill) + "</span>";
        })
        .join("") +
      "</div><div class=\"summary-note\">推荐工作方式：先锁定标题、用途和画幅，再少量试跑 2 到 4 张，确认方向后再扩大批量。</div><div class=\"hero-actions\"><button type=\"button\" class=\"primary\" data-scroll-results=\"true\">看生图工作台</button><button type=\"button\" class=\"ghost\" data-scroll-step=\"batch\">跳到批量设置</button></div></div></section>" +
      '<div class="stepper">' +
      FORM_STEPS.map(function (step) {
        return (
          '<button type="button" class="step-chip" data-scroll-step="' +
          escapeHtml(step.id) +
          '">' +
          escapeHtml(step.eyebrow.replace("Step ", "")) +
          ". " +
          escapeHtml(step.title) +
          "</button>"
        );
      }).join("") +
      "</div>" +
      '<div class="step-flow">' +
      stepsHtml +
      "</div>";
  }

  function renderResults() {
    if (!state.lastRun) {
      refs.resultsCaption.textContent = "尚未生成任务";
      refs.results.classList.add("empty");
      refs.results.innerHTML = "先按步骤填写表单，再点“生成任务清单”。";
      return;
    }

    var primaryJob = getPrimaryJob();
    var filteredJobs = getFilteredJobs();
    var currentJob = syncWorkbenchSelection();
    var explorationSummary = getExplorationSummary();
    var totalJobs = state.lastRun.jobs.length;
    var completedJobs = getCompletedJobCount();
    var pendingJobs = totalJobs - completedJobs;
    var progressPercent = totalJobs ? Math.round((completedJobs / totalJobs) * 100) : 0;
    var currentListIndex = currentJob
      ? filteredJobs.findIndex(function (job) {
          return getJobKey(job) === getJobKey(currentJob);
        }) + 1
      : 0;

    refs.results.classList.remove("empty");
    refs.resultsCaption.textContent = "共 " + totalJobs + " 个任务";

    refs.results.innerHTML =
      '<div class="run-list workbench-shell">' +
      '<div class="quickstart-card"><div class="quickstart-head"><div><p class="step-label">Quick Start</p><h3>先出主推荐方案</h3><p class="muted">第一次使用时，先复制这一条主方案去 ChatGPT 出图。如果结果不满意，再展开下面的批量试图区。</p></div><span class="job-status-badge' +
      (primaryJob && isJobCompleted(primaryJob) ? " completed" : " pending") +
      '">' +
      escapeHtml(primaryJob && isJobCompleted(primaryJob) ? "主方案已完成" : "主方案待执行") +
      "</span></div>" +
      (primaryJob
        ? '<div class="current-job-meta"><span>画幅 ' +
          escapeHtml(primaryJob.aspectRatio || "1:1") +
          "</span><span>批次 " +
          escapeHtml(String(primaryJob.seed)) +
          "</span><span>目标 " +
          escapeHtml(primaryJob.target || "ChatGPT Images") +
          '</span></div><div class="current-job-actions"><button type="button" class="primary" data-copy-job="' +
          escapeHtml(getJobKey(primaryJob)) +
          '">复制主 Prompt</button><button type="button" class="ghost" data-toggle-complete="' +
          escapeHtml(getJobKey(primaryJob)) +
          '">' +
          escapeHtml(isJobCompleted(primaryJob) ? "取消主方案完成" : "标记主方案完成") +
          '</button></div><div class="prompt-card"><div class="prompt-card-head"><strong>主推荐 Prompt</strong><button type="button" class="ghost small" data-copy-job="' +
          escapeHtml(getJobKey(primaryJob)) +
          '">复制</button></div><pre class="prompt-output">' +
          escapeHtml(primaryJob.prompt || "") +
          "</pre></div>"
        : '<div class="empty-state">当前还没有可执行的主方案。</div>') +
      "</div>" +
      '<div class="exploration-entry-card"><div class="exploration-entry-head"><div><p class="step-label">Batch Explore</p><h3>不满意？再试更多版本</h3><p class="muted">系统会根据你在 Step 4 和 Step 5 里选择的画幅、机位、附加标签和每组数量，自动准备一组备选方案。</p></div><button type="button" class="' +
      (state.workbench.explorationOpen ? "ghost" : "primary") +
      '" data-toggle-exploration="true">' +
      escapeHtml(state.workbench.explorationOpen ? "收起批量试图区" : "展开批量试图区") +
      '</button></div><div class="exploration-summary-row"><span>画幅 ' +
      escapeHtml(String(explorationSummary.aspectRatioCount)) +
      "</span><span>机位 " +
      escapeHtml(String(explorationSummary.cameraAngleCount)) +
      "</span><span>附加标签 " +
      escapeHtml(String(explorationSummary.extraTagCount)) +
      "</span><span>每组数量 " +
      escapeHtml(String(explorationSummary.batchCount)) +
      "</span><strong>共 " +
      escapeHtml(String(totalJobs)) +
      " 条备选任务</strong></div></div>" +
      (state.workbench.explorationOpen
        ? '<div class="exploration-panel">' +
      (state.lastRun.outputs && state.lastRun.outputs[0] && state.lastRun.outputs[0].summary
        ? '<div class="results-metrics">' +
          '<div class="metric-card"><span>总任务</span><strong>' +
          escapeHtml(String(state.lastRun.outputs[0].summary.totalJobs || totalJobs)) +
          '</strong></div><div class="metric-card"><span>变体数</span><strong>' +
          escapeHtml(String(state.lastRun.outputs[0].summary.variationCount || 0)) +
          '</strong></div><div class="metric-card"><span>每组批量</span><strong>' +
          escapeHtml(String(state.lastRun.outputs[0].summary.batchCount || 0)) +
          '</strong></div><div class="metric-card"><span>输出目录</span><strong>' +
          escapeHtml(String(state.lastRun.outputs[0].summary.outputFolder || "-")) +
          "</strong></div></div>"
        : "") +
      '<div class="workbench-progress-card"><div class="workbench-progress-head"><div><strong>执行进度</strong><p class="muted">推荐流程：复制当前 prompt -> 去 ChatGPT 出图 -> 返回标记完成</p></div><strong>' +
      escapeHtml(String(progressPercent)) +
      '%</strong></div><div class="progress-bar"><span style="width:' +
      escapeHtml(String(progressPercent)) +
      '%"></span></div><div class="workbench-progress-meta"><span>已完成 ' +
      escapeHtml(String(completedJobs)) +
      "</span><span>待处理 " +
      escapeHtml(String(pendingJobs)) +
      "</span></div></div>" +
      '<div class="filter-row"><button type="button" class="filter-chip' +
      (state.workbench.filter === "pending" ? " active" : "") +
      '" data-filter="pending">待处理</button><button type="button" class="filter-chip' +
      (state.workbench.filter === "all" ? " active" : "") +
      '" data-filter="all">全部</button><button type="button" class="filter-chip' +
      (state.workbench.filter === "completed" ? " active" : "") +
      '" data-filter="completed">已完成</button></div>' +
      (state.workbench.statusMessage
        ? '<div class="workbench-status">' + escapeHtml(state.workbench.statusMessage) + "</div>"
        : "") +
      (currentJob
        ? '<div class="current-job-card"><div class="current-job-head"><div><p class="step-label">Current Task</p><h3>' +
          escapeHtml(currentJob.fileName) +
          '</h3><p class="muted">当前筛选中第 ' +
          escapeHtml(String(currentListIndex)) +
          " / " +
          escapeHtml(String(filteredJobs.length || 1)) +
          ' 条</p></div><span class="job-status-badge' +
          (isJobCompleted(currentJob) ? " completed" : " pending") +
          '">' +
          escapeHtml(isJobCompleted(currentJob) ? "已完成" : "待执行") +
          '</span></div><div class="current-job-meta"><span>画幅 ' +
          escapeHtml(currentJob.aspectRatio || "1:1") +
          "</span><span>批次 " +
          escapeHtml(String(currentJob.seed)) +
          "</span><span>目标 " +
          escapeHtml(currentJob.target || "ChatGPT Images") +
          '</span></div><div class="current-job-actions"><button type="button" class="primary" data-copy-current="true">复制当前 Prompt</button><button type="button" class="ghost" data-mark-complete="true">标记完成</button><button type="button" class="ghost" data-toggle-complete="' +
          escapeHtml(getJobKey(currentJob)) +
          '">' +
          escapeHtml(isJobCompleted(currentJob) ? "取消完成" : "切换完成状态") +
          '</button></div><div class="nav-row"><button type="button" class="ghost small" data-move-job="-1">上一条</button><button type="button" class="ghost small" data-move-job="1">下一条</button></div><div class="prompt-card"><div class="prompt-card-head"><strong>发送给 ChatGPT 的 Prompt</strong><button type="button" class="ghost small" data-copy-current="true">复制</button></div><pre class="prompt-output">' +
          escapeHtml(currentJob.prompt || "") +
          '</pre></div><div class="job-helper"><strong>给同事的操作提示</strong><p>1. 点击复制当前 Prompt</p><p>2. 去 ChatGPT 生图对话粘贴并发送</p><p>3. 图片保存后回来点“标记完成”</p></div></div>'
        : '<div class="current-job-card empty-state">当前筛选下没有任务。可以切换到“全部”或“已完成”查看。</div>') +
      '<div class="queue-card"><div class="prompt-card-head"><strong>任务队列</strong><span class="muted">点击任意一条切换当前任务</span></div>' +
      filteredJobs
        .slice(0, MAX_JOB_PREVIEW)
        .map(function (job) {
          return (
            '<button type="button" class="job-card queue-item' +
            (currentJob && getJobKey(job) === getJobKey(currentJob) ? " is-current" : "") +
            '" data-select-job="' +
            escapeHtml(getJobKey(job)) +
            '"><div class="queue-item-head"><strong>' +
            escapeHtml(job.fileName) +
            '</strong><span class="job-status-badge' +
            (isJobCompleted(job) ? " completed" : " pending") +
            '">' +
            escapeHtml(isJobCompleted(job) ? "已完成" : "待执行") +
            '</span></div><div class="job-meta"><code>' +
            escapeHtml(job.target) +
            " | " +
            escapeHtml(job.aspectRatio || "1:1") +
            " | run " +
            escapeHtml(job.seed) +
            '</code></div><div class="job-prompt">' +
            escapeHtml(job.prompt || "").slice(0, 280) +
            '</div><div class="muted">' +
            escapeHtml(job.notes || "base variation") +
            "</div></button>"
          );
        })
        .join("") +
      (filteredJobs.length > MAX_JOB_PREVIEW
        ? '<div class="muted">当前队列仅展示前 ' + MAX_JOB_PREVIEW + " 条，其余任务依然包含在导出清单中。</div>"
        : "") +
      "</div></div>"
        : "") +
      "</div>";
  }

  function render() {
    renderForm();
    renderSummary();
    renderResults();
  }

  function downloadJson(fileName, payload) {
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function bindFormEvents() {
    refs.form.addEventListener("input", function (event) {
      var field = event.target.closest("[data-field-key]");
      if (!field) {
        return;
      }
      var nodeId = field.getAttribute("data-node-id");
      var key = field.getAttribute("data-field-key");
      var node = getNodeById(nodeId);
      var fieldDefinition = getFieldDefinition(node, key);
      var nextValue = field.value;
      if (fieldDefinition && fieldDefinition.type === "number") {
        nextValue = Number(nextValue);
      }
      setNodeFieldValue(nodeId, key, nextValue);
    });

    refs.form.addEventListener("keydown", function (event) {
      var customInput = event.target.closest("[data-custom-token-input]");
      if (!customInput || event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      var nodeId = customInput.getAttribute("data-node-id");
      var key = customInput.getAttribute("data-custom-token-input");
      var nextValue = String(customInput.value || "").trim();
      if (!nextValue) {
        return;
      }
      setNodeFieldValue(nodeId, key, appendTokenValue(getNodeById(nodeId).params[key], nextValue), {
        rerenderForm: true,
      });
    });

    refs.form.addEventListener("click", function (event) {
      var addPresetButton = event.target.closest("[data-add-token]");
      if (addPresetButton) {
        var nodeId = addPresetButton.getAttribute("data-node-id");
        var key = addPresetButton.getAttribute("data-add-token");
        var select = refs.form.querySelector(
          '[data-token-select="' + key + '"][data-node-id="' + nodeId + '"]'
        );
        var selectedValue = select ? String(select.value || "").trim() : "";
        if (selectedValue) {
          setNodeFieldValue(nodeId, key, appendTokenValue(getNodeById(nodeId).params[key], selectedValue), {
            rerenderForm: true,
          });
        }
        return;
      }

      var addCustomButton = event.target.closest("[data-add-custom-token]");
      if (addCustomButton) {
        var customNodeId = addCustomButton.getAttribute("data-node-id");
        var customKey = addCustomButton.getAttribute("data-add-custom-token");
        var input = refs.form.querySelector(
          '[data-custom-token-input="' + customKey + '"][data-node-id="' + customNodeId + '"]'
        );
        var customValue = input ? String(input.value || "").trim() : "";
        if (customValue) {
          setNodeFieldValue(
            customNodeId,
            customKey,
            appendTokenValue(getNodeById(customNodeId).params[customKey], customValue),
            {
              rerenderForm: true,
            }
          );
        }
        return;
      }

      var removeTokenButton = event.target.closest("[data-remove-token]");
      if (removeTokenButton) {
        var removeNodeId = removeTokenButton.getAttribute("data-node-id");
        var removeKey = removeTokenButton.getAttribute("data-remove-token");
        var tokenValue = removeTokenButton.getAttribute("data-token-value");
        setNodeFieldValue(
          removeNodeId,
          removeKey,
          removeTokenValue(getNodeById(removeNodeId).params[removeKey], tokenValue),
          {
            rerenderForm: true,
          }
        );
        return;
      }

      var scrollStepButton = event.target.closest("[data-scroll-step]");
      if (scrollStepButton) {
        var targetId = scrollStepButton.getAttribute("data-scroll-step");
        var target = refs.form.querySelector('[data-step-id="' + targetId + '"]');
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }

      var scrollResultsButton = event.target.closest("[data-scroll-results]");
      if (scrollResultsButton) {
        refs.resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  function bindResultsEvents() {
    refs.results.addEventListener("click", function (event) {
      var toggleExplorationButton = event.target.closest("[data-toggle-exploration]");
      if (toggleExplorationButton) {
        toggleExplorationPanel();
        return;
      }

      var filterButton = event.target.closest("[data-filter]");
      if (filterButton) {
        setWorkbenchFilter(filterButton.getAttribute("data-filter"));
        return;
      }

      var copyJobButton = event.target.closest("[data-copy-job]");
      if (copyJobButton) {
        copyJobPrompt(copyJobButton.getAttribute("data-copy-job"));
        return;
      }

      var copyButton = event.target.closest("[data-copy-current]");
      if (copyButton) {
        copyCurrentPrompt();
        return;
      }

      var markCompleteButton = event.target.closest("[data-mark-complete]");
      if (markCompleteButton) {
        markCurrentJobComplete();
        return;
      }

      var toggleCompleteButton = event.target.closest("[data-toggle-complete]");
      if (toggleCompleteButton) {
        var toggleJobId = toggleCompleteButton.getAttribute("data-toggle-complete");
        var targetJob = state.lastRun && state.lastRun.jobs.find(function (job) {
          return getJobKey(job) === toggleJobId;
        });
        if (targetJob) {
          setJobCompleted(toggleJobId, !isJobCompleted(targetJob));
        }
        return;
      }

      var moveButton = event.target.closest("[data-move-job]");
      if (moveButton) {
        moveCurrentJob(Number(moveButton.getAttribute("data-move-job")));
        return;
      }

      var selectButton = event.target.closest("[data-select-job]");
      if (selectButton) {
        setCurrentJobById(selectButton.getAttribute("data-select-job"));
      }
    });
  }

  function bindSummaryEvents() {
    refs.summary.addEventListener("input", function (event) {
      var saveNameInput = event.target.closest("[data-save-name-input]");
      if (!saveNameInput) {
        return;
      }

      state.saveDraftName = saveNameInput.value;
    });

    refs.summary.addEventListener("click", function (event) {
      var saveButton = event.target.closest("[data-save-preset]");
      if (saveButton) {
        saveCurrentPreset();
        return;
      }

      var loadButton = event.target.closest("[data-load-preset]");
      if (loadButton) {
        loadPresetById(loadButton.getAttribute("data-load-preset"));
        return;
      }

      var deleteButton = event.target.closest("[data-delete-preset]");
      if (deleteButton) {
        deletePresetById(deleteButton.getAttribute("data-delete-preset"));
      }
    });
  }

  function bindGlobalActions() {
    refs.loadTemplateButton.addEventListener("click", function () {
      applyWorkflow(WORKFLOW_TEMPLATE);
    });

    refs.runButton.addEventListener("click", function () {
      try {
        state.lastRun = runWorkflow();
        initializeWorkbenchForRun();
        renderResults();
      } catch (error) {
        alert(error.message);
      }
    });

    refs.exportWorkflowButton.addEventListener("click", function () {
      downloadJson("workflow-export.json", {
        version: WORKFLOW_VERSION,
        nodes: state.nodes,
        connections: state.connections,
      });
    });

    refs.exportManifestButton.addEventListener("click", function () {
      if (!state.lastRun) {
        try {
          state.lastRun = runWorkflow();
          initializeWorkbenchForRun();
        } catch (error) {
          alert(error.message);
          return;
        }
      }
      downloadJson("batch-manifest.json", state.lastRun);
    });

    refs.resetButton.addEventListener("click", function () {
      applyWorkflow(WORKFLOW_TEMPLATE);
    });

    refs.importInput.addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      if (!file) {
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          applyWorkflow(JSON.parse(String(reader.result || "{}")));
          refs.importInput.value = "";
        } catch (error) {
          alert("导入失败，请确认是有效的 JSON。");
        }
      };
      reader.readAsText(file);
    });
  }

  function initRefs() {
    refs.form = document.getElementById("form-panel");
    refs.summary = document.getElementById("summary-panel");
    refs.results = document.getElementById("results-panel");
    refs.resultsPanel = document.querySelector(".results-panel");
    refs.resultsCaption = document.getElementById("results-caption");
    refs.loadTemplateButton = document.getElementById("load-template");
    refs.runButton = document.getElementById("run-workflow");
    refs.exportWorkflowButton = document.getElementById("export-workflow");
    refs.exportManifestButton = document.getElementById("export-manifest");
    refs.resetButton = document.getElementById("reset-workflow");
    refs.importInput = document.getElementById("import-workflow");
  }

  function boot() {
    initRefs();
    loadBuiltinNodes();
    state.savedPresets = loadSavedPresets();
    state.saveDraftName = "";
    bindFormEvents();
    bindSummaryEvents();
    bindResultsEvents();
    bindGlobalActions();

    var initialWorkflow = loadPersistedWorkflow() || WORKFLOW_TEMPLATE;
    applyWorkflow(initialWorkflow);
  }

  function renderBootFailure(error) {
    console.error("Prompt generator failed to boot", error);

    document.body.innerHTML =
      '<div class="shell"><section class="panel" style="max-width: 760px; margin: 8vh auto; display: grid; gap: 1rem;"><div class="panel-head"><div><p class="eyebrow">Recovery Mode</p><h2>提示词生成器暂时没有成功打开</h2></div></div><p class="brand-copy">通常是浏览器本地缓存、旧版本保存数据，或者打开方式异常导致的。你可以先清空当前浏览器里的本地缓存并恢复默认表单。</p><div class="summary-note">这不会影响仓库里的网页文件，只会清掉当前浏览器里保存的本地方案与最近一次填写记录。</div><div style="display: flex; flex-wrap: wrap; gap: 0.75rem;"><button id="recovery-reset" class="primary">清空本地缓存并恢复默认</button><button id="recovery-reload" class="ghost">仅重新加载页面</button></div><div class="summary-note">如果你是从 GitHub 仓库代码页里直接点开的，请改用 GitHub Pages 发布地址，或者直接打开本地的 index.html。</div></section></div>';

    var resetButton = document.getElementById("recovery-reset");
    var reloadButton = document.getElementById("recovery-reload");

    if (resetButton) {
      resetButton.addEventListener("click", function () {
        clearPersistedData();
        if (typeof window !== "undefined" && window.location && typeof window.location.reload === "function") {
          window.location.reload();
        }
      });
    }

    if (reloadButton) {
      reloadButton.addEventListener("click", function () {
        if (typeof window !== "undefined" && window.location && typeof window.location.reload === "function") {
          window.location.reload();
        }
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    try {
      boot();
    } catch (error) {
      renderBootFailure(error);
    }
  });
})();
