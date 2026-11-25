import type { Language } from "./i18n.ts";

type Copy = [english: string, chinese: string];
type ResultCopy = { scope: Copy; notes: Copy[] };

const searchNotes: Copy[] = [
  ["Each search layer uses a separate candidate pool and is scored on its own.", "各搜索层使用独立的候选结果，分开评分。"],
  ["The services ran on different dates. Bocha AI Search ran four requests at a time. The other services ran one at a time.", "各服务在不同日期测试。博查 AI 搜索同时发出 4 个请求，其余服务逐个发出。"],
  ["L2 and L3 show the time of the underlying API request.", "L2 和 L3 显示底层 API 请求的耗时。"],
  ["The report quotes prices per request or per successful search. It gives no total spend.", "报告按请求次数或成功搜索次数列出报价，未给出本次评测的总支出。"],
  ["The report gives 95% confidence intervals. The ranking uses the published point estimates.", "报告给出 95% 置信区间。榜单按实际公布的分数排序。"],
];

const scenarioSearch: ResultCopy = {
  scope: ["The report covers 149 scenario queries. The linked dataset has the same count. The report gives no dataset revision or page hashes to verify the match.",
    "报告覆盖 149 道场景题，与所链接数据集的题数相同。报告未注明数据集版本或页面哈希，无法逐条核对。"],
  notes: searchNotes,
};

const factualSearch: ResultCopy = {
  scope: ["Quality scores use 773 of 831 questions. The remaining 58 had defective references. Timing includes all 831 calls. The report gives no exact dataset revision.",
    "质量评分采用 831 道题中参考资料有效的 773 道。耗时统计包含全部 831 次调用。报告未注明数据集版本。"],
  notes: [
    ["Equivalent URLs and verified copies count as source matches.", "等价网址和经核验的网页副本也计为来源命中。"],
    ...searchNotes,
  ],
};

const sharedTiming: Copy = ["Mean latency covers 980 calls across both question sets.", "平均耗时按两套题库合计 980 次调用计算。"];

const historicalCopy: Record<string, ResultCopy> = {
  "lexbench-webfetch-v1.1.0": {
    scope: ["This historical summary covers five browsers on 430 tasks. The reviewed six-configuration results and disclosed timing populations are in v2.0.0.",
      "这份历史摘要包含五款浏览器的 430 题结果。六种配置的复核结果和计时范围见 v2.0.0。"],
    notes: [["Summary scores are retained as published. Use v2.0.0 for the reviewed judgments.",
      "摘要分数按原发布值保留。评分复核后的结果请查看 v2.0.0。"]],
  },
  "webmainbench-v1.1.0": {
    scope: ["This historical summary shows five methods on 545 frozen HTML pages. Edition v2.0.0 identifies all seven measured configurations and their timing populations.",
      "这份历史摘要展示五种方法在 545 份冻结 HTML 上的结果。v2.0.0 列明七种实测配置及其计时范围。"],
    notes: [["Moli configurations are identified separately in v2.0.0, including the PR919 run behind the 39.27 overall score.",
      "v2.0.0 分别标明 Moli 的各个配置，其中综合分 39.27 对应 PR919 的实测运行。"]],
  },
  "lexbench-webfetch-v1": {
    scope: ["This evaluation used the earlier 430-task edition listed on the dataset page. The current edition has 550 tasks. The report gives no individual task list.",
      "本轮使用数据集页面列出的早期 430 题版。当前数据集有 550 题，原报告未附逐题清单。"],
    notes: [
      ["The 430 tasks include 100 each for static, dynamic, popular and anti-bot sites, plus 10 documents, 17 embedded-media tasks and 3 direct-media tasks.",
        "静态网站、动态网站、热门网站和反爬网站各 100 题，另有文档 10 题、嵌入媒体 17 题、直链媒体 3 题。"],
      ["The total passed is the sum of the seven category counts. The report gives no timing sample counts, timeout or retry settings.",
        "总通过数为七类通过数之和。原报告未说明计时样本数、超时和重试设置。"],
    ],
  },
  "webmainbench-v1": {
    scope: ["Five browsers extracted content from the same 545 saved HTML pages. The report gives no dataset commit.",
      "五款浏览器处理同一批保存下来的 545 份 HTML。报告未注明数据集提交版本。"],
    notes: [
      ["The overall score averages full text, code, formulas, table content and table structure.",
        "综合分取全文、代码、公式、表格内容和表格结构五项的平均值。"],
      ["The evaluation measures extraction from saved pages. The source gives only some scores.", "这组测试只测已保存网页的内容提取。原报告仅公布部分分数。"],
    ],
  },
  "lexbench-websearch-v1": {
    scope: ["The report covers 149 scenario queries. The linked dataset has the same count. The report gives no question IDs or reference judgments to verify the match.",
      "报告覆盖 149 道场景题，与所链接数据集的题数相同。报告未附题目编号或参考评分，无法逐条核对。"],
    notes: [sharedTiming],
  },
  "simpleqa-verified-v1": {
    scope: ["The report scores 773 factual questions. The linked edition has 831. The report gives no selection rules or reference pages for the subset.",
      "报告对 773 道事实题评分。所链接版本有 831 道题，报告未说明选题规则或列出参考网页。"],
    notes: [sharedTiming],
  },
  "lexbench-websearch-v2": scenarioSearch,
  "lexbench-websearch-excerpts-v1": scenarioSearch,
  "lexbench-websearch-answers-v1": scenarioSearch,
  "simpleqa-verified-v2": factualSearch,
  "simpleqa-verified-excerpts-v1": factualSearch,
  "simpleqa-verified-answers-v1": factualSearch,
  "lexbench-headless-372-v1": {
    scope: ["Seven Moli builds used the earlier 372-task suite. The linked dataset now lists 1,928 runnable tasks.",
      "七种 Moli 构建使用早期的 372 道题。所链接的数据集现有 1,928 道可运行的题。"],
    notes: [
      ["The baseline ran one task and inherited failure results for the other 371. Each other build ran all 372.",
        "基线实测 1 题，其余 371 题沿用共同失败结果。其他构建均实测 372 题。"],
      ["Each tested task ran three times. The change columns use the Moli 1.1.4 baseline with layout off.",
        "每道实测题运行 3 次。变化量以关闭布局的 Moli 1.1.4 为基线。"],
    ],
  },
  "webarena-verified-v1": {
    scope: ["Six setups ran the same 812 WebArena-Verified tasks. The report does not identify the recorded action format, so the exact match to the linked edition is unconfirmed.",
      "六种方案运行同一批 812 个 WebArena-Verified 任务。报告未说明动作记录格式，无法确认与所链接版本完全一致。"],
    notes: [["Task timings cover all 812 tasks per setup. Action timings use the number of actions each setup executed.",
      "各方案均记录了 812 个任务的耗时。单步耗时按各方案实际执行的动作计。"]],
  },
  "lexbench-swde-v1": {
    scope: ["Ten methods processed 800 archived pages. The linked dataset provides inputs only. The report gives no page IDs or hashes to verify an exact match.",
      "十种方案各处理 800 份归档网页。所链接数据集仅提供输入，报告未列出页面编号或哈希，无法逐页核对。"],
    notes: [
      ["Timing covers all 800 pages. Full-page exact match uses 740 pages with complete references. Null handling uses 25 empty reference fields across 24 pages.",
        "耗时统计覆盖全部 800 页。整页全对率按参考答案完整的 740 页计算，空值处理使用 24 页中的 25 个空参考字段。"],
      ["The report gives no detailed matching rules, run date or official pricing links.", "报告未说明详细匹配规则和测试日期，也未附官方报价链接。"],
    ],
  },
  "lexbench-zyte-product-extraction-v1": {
    scope: ["All methods processed 140 product pages. The reported label counts match the original labels in the linked dataset. The report gives no page IDs, hashes or exact dataset revision.",
      "各方案均处理 140 个商品页。报告中的标注数量与所链接数据集的原始标注一致，未附页面编号、哈希或数据集版本。"],
    notes: [
      ["Timing and full-page exact match use all 140 pages. Null handling uses six empty reference fields across six pages. The linked dataset also has a separate annotation set checked against source pages.",
        "耗时和整页全对率按全部 140 页计算。空值处理使用 6 页中的 6 个空参考字段。所链接数据集还有一套经原网页核对的独立标注。"],
      ["The report gives no detailed matching rules or model costs for the open-source methods.",
        "报告未说明详细匹配规则，也未公布开源方案的模型费用。"],
    ],
  },
};

export function historicalResultCopy(id: string, language: Language) {
  const copy = historicalCopy[id];
  if (!copy) return null;
  const index = language === "zh" ? 1 : 0;
  return { scope: copy.scope[index], notes: copy.notes.map(note => note[index]) };
}
