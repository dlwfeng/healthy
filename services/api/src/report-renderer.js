import { parseFragment, serialize } from "parse5";
import * as css from "css-tree";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildStandaloneReport } from "./report-document.js";

export const RENDERER_VERSION = "1";
export const bridgeScript = `(()=>{const channel=document.body.dataset.channel;let last=0;const send=()=>{const height=Math.ceil(document.body.getBoundingClientRect().height);if(height!==last){last=height;parent.postMessage({type:'health-report-height',channel,height},'*')}};new ResizeObserver(send).observe(document.body);addEventListener('message',e=>{if(e.source!==parent||e.data?.type!=='health-report-theme'||e.data.channel!==channel)return;document.documentElement.dataset.theme=e.data.theme==='dark'?'dark':'light';send()});send()})()`;
export const bridgeHash =
  "sha256-" + createHash("sha256").update(bridgeScript).digest("base64");
export const pageCsp = `default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' '${bridgeHash}'; frame-src 'self' about:; font-src 'self'; base-uri 'none'; form-action 'self'`;
const tags = new Set(
  "article header section footer div span h1 h2 h3 h4 p strong em small code ul ol li blockquote figure figcaption table caption thead tbody tr th td details summary br hr time svg title desc g path line polyline polygon rect circle text tspan".split(
    " ",
  ),
);
const svgAttrs = new Set(
  "viewBox width height x y x1 x2 y1 y2 cx cy r rx ry d points fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset dx dy opacity fill-opacity stroke-opacity text-anchor dominant-baseline font-size font-weight font-family font-style letter-spacing direction alignment-baseline textLength lengthAdjust vector-effect transform preserveAspectRatio".split(
    " ",
  ),
);
const tokens = new Set(
  "bg surface surface-alt text muted faint line teal teal-soft indigo indigo-soft coral coral-soft cyan cyan-soft orange orange-soft track focus".split(
    " ",
  ),
);
const properties = new Set(
  "display gap row-gap column-gap grid-template-columns grid-column align-items align-self justify-content justify-self flex flex-wrap flex-direction flex-grow flex-shrink flex-basis margin margin-top margin-bottom margin-left margin-right padding padding-top padding-bottom padding-left padding-right border border-top border-bottom border-left border-right border-radius border-width border-style border-collapse color background background-color border-color font-size font-weight font-style letter-spacing text-transform text-align text-decoration line-height vertical-align white-space word-break overflow-wrap width max-width min-width height max-height overflow-x fill stroke opacity".split(
    " ",
  ),
);
export function renderCapabilities() {
  return {
    root: "article.health-report",
    tags: [...tags],
    svg_attributes: [...svgAttrs],
    style_properties: [...properties],
    theme_variables: [...tokens].map((t) => "--" + t),
    body_classes: [
      "report-lead",
      "report-section",
      "report-grid",
      "report-grid-3",
      "report-card",
      "report-number",
      "report-unit",
      "report-muted",
      "report-caption",
      "report-note",
      "report-table-wrap",
      "report-actions",
    ],
    attribute_notes:
      "仅 class、style、data-evidence、id、aria-*、role、title、lang、datetime、scope、colspan、rowspan、open 及上述 SVG 属性；颜色用 var(--变量)。不支持脚本、事件、链接、图片或 style 元素。",
  };
}
function fail(message) {
  throw Error("invalid_report: " + message);
}
function color(value) {
  return (
    ["none", "currentColor", "transparent", "inherit"].includes(value) ||
    (/^var\(--[a-z-]+\)$/.test(value) && tokens.has(value.slice(6, -1)))
  );
}
function validateStyle(value) {
  let ast;
  try {
    ast = css.parse(value, { context: "declarationList" });
  } catch {
    fail("style 语法错误");
  }
  css.walk(ast, (node) => {
    if (
      node.type === "Raw" ||
      node.type === "Url" ||
      node.type === "Atrule" ||
      node.type === "Rule"
    )
      fail("CSS 不允许外部资源或规则");
    if (
      node.type === "Function" &&
      !["var", "repeat", "minmax", "min", "max", "clamp", "calc"].includes(
        node.name,
      )
    )
      fail("不支持的 CSS 函数");
    if (
      node.type === "Dimension" &&
      (!["px", "rem", "em", "fr", "%"].includes(node.unit) ||
        Math.abs(Number(node.value)) > 4096)
    )
      fail("CSS 尺寸超出范围");
    if (node.type === "Declaration") {
      if (!properties.has(node.property) || node.important)
        fail(`不支持的 CSS 属性 ${node.property}`);
      const v = css.generate(node.value);
      if (/color|background|fill|stroke$/.test(node.property) && !color(v))
        fail("颜色请使用healthy主题变量");
      if (
        node.property === "display" &&
        ![
          "block",
          "inline",
          "inline-block",
          "grid",
          "flex",
          "table",
          "table-row",
          "table-cell",
        ].includes(v)
      )
        fail("不支持的 display");
      if (
        node.property === "font-size" &&
        /^\d+(\.\d+)?px$/.test(v) &&
        Number.parseFloat(v) < 12
      )
        fail("文字至少 12px");
      if (node.property === "overflow-x" && !["auto", "hidden"].includes(v))
        fail("不支持的 overflow");
    }
    if (node.type === "Function" && node.name === "var") {
      const v = css.generate(node);
      if (!color(v)) fail("未知主题变量");
    }
  });
  return css.generate(ast);
}
export function validateReport(payload, snapshot) {
  if (
    !payload ||
    typeof payload.title !== "string" ||
    !payload.title.trim() ||
    payload.title.length > 100 ||
    typeof payload.summary !== "string" ||
    !payload.summary.trim() ||
    payload.summary.length > 300 ||
    /[<>]/.test(payload.title + payload.summary)
  )
    fail("标题或摘要无效");
  if (
    typeof payload.html !== "string" ||
    Buffer.byteLength(payload.html) > 256 * 1024
  )
    fail("HTML 大小超出限制");
  if (
    !Array.isArray(payload.evidence_ids) ||
    payload.evidence_ids.length > 200 ||
    !payload.evidence_ids.length
  )
    fail("需要引用证据");
  const hasEvidence = (id) =>
    typeof id === "string" && Object.hasOwn(snapshot.evidence, id);
  if (payload.evidence_ids.some((id) => !hasEvidence(id)))
    fail("引用不存在或不属于本任务");
  const selected = new Set(payload.evidence_ids),
    referenced = new Set();
  if (!Array.isArray(payload.suggestions) || payload.suggestions.length > 8)
    fail("建议列表无效");
  const suggestionIds = new Set();
  for (const [index, s] of payload.suggestions.entries()) {
    if (
      !s ||
      typeof s.id !== "string" ||
      !s.id ||
      s.id.length > 60 ||
      suggestionIds.has(s.id)
    )
      fail(`第 ${index + 1} 条建议的 id 需要唯一且不超过 60 字符`);
    if (typeof s.text !== "string" || !s.text.trim() || s.text.length > 600)
      fail(`第 ${index + 1} 条建议的 text 不能为空且不超过 600 字符`);
    if (typeof s.rationale !== "string" || s.rationale.length > 1000)
      fail(`第 ${index + 1} 条建议的 rationale 需要字符串且不超过 1000 字符`);
    if (
      !Array.isArray(s.evidence_ids) ||
      !s.evidence_ids.length ||
      s.evidence_ids.some((id) => !hasEvidence(id))
    )
      fail(
        `第 ${index + 1} 条建议需要至少一个本次工具已返回的真实 evidence_id，不可引用虚构 ID`,
      );
    for (const id of s.evidence_ids) selected.add(id);
    suggestionIds.add(s.id);
  }
  const doc = parseFragment(payload.html);
  const pending = [doc];
  let parsedNodes = 0;
  while (pending.length) {
    if (++parsedNodes > 20000) fail("HTML 结构过于复杂");
    const node = pending.pop();
    if (node.childNodes) {
      node.childNodes = node.childNodes.filter(
        (child) => child.nodeName !== "#comment",
      );
      pending.push(...node.childNodes);
    }
  }
  const roots = doc.childNodes.filter(
    (n) => n.nodeName !== "#text" || n.value.trim(),
  );
  if (
    roots.length !== 1 ||
    roots[0].tagName !== "article" ||
    !roots[0].attrs.some(
      (a) =>
        a.name === "class" && a.value.split(/\s+/).includes("health-report"),
    )
  )
    fail("正文需要唯一 article.health-report 根");
  let count = 0;
  function walk(node, depth = 0) {
    if (++count > 20000 || depth > 60) fail("HTML 结构过于复杂");
    if (node.nodeName === "#text") return;
    if (!tags.has(node.tagName))
      fail(`不允许的元素 ${node.tagName || node.nodeName}`);
    for (const a of node.attrs || []) {
      if (
        a.name === "xmlns" &&
        a.value === "http://www.w3.org/2000/svg" &&
        node.tagName === "svg"
      )
        continue;
      if (a.namespace || a.prefix) fail("不允许命名空间属性");
      if (a.name === "class") {
        if (
          a.value
            .split(/\s+/)
            .some(
              (c) => c !== "health-report" && !/^report-[a-z0-9-]+$/.test(c),
            )
        )
          fail("类名请使用 report- 前缀");
      } else if (a.name === "style") a.value = validateStyle(a.value);
      else if (a.name === "data-evidence") {
        for (const id of a.value.trim().split(/\s+/)) {
          if (!hasEvidence(id)) fail("正文证据不存在或不属于本任务");
          selected.add(id);
          referenced.add(id);
        }
      } else if (
        a.name === "id" ||
        a.name.startsWith("aria-") ||
        [
          "role",
          "title",
          "lang",
          "datetime",
          "scope",
          "colspan",
          "rowspan",
          "open",
        ].includes(a.name)
      ) {
        if (a.value.length > 500) fail("属性过长");
      } else if (
        node.namespaceURI === "http://www.w3.org/2000/svg" &&
        svgAttrs.has(a.name)
      ) {
        if (a.name === "font-family") a.value = "inherit";
        if (a.name === "fill" || a.name === "stroke") {
          if (!color(a.value)) fail("SVG 颜色请使用主题变量");
        } else if (
          a.value.length > 60000 ||
          /[<>&]/.test(a.value) ||
          /url|javascript|https?:|data:|\\/i.test(a.value)
        )
          fail("不允许的 SVG 属性值");
      } else fail(`不允许的属性 ${a.name}`);
    }
    for (const child of node.childNodes || []) walk(child, depth + 1);
  }
  walk(roots[0]);
  if (selected.size > 200) fail("证据引用过多");
  if (!referenced.size)
    roots[0].attrs.push({
      name: "data-evidence",
      value: [...selected].join(" "),
    });
  return {
    title: payload.title.trim(),
    summary: payload.summary.trim(),
    html: serialize(doc),
    evidence_ids: [...selected],
    suggestions: payload.suggestions.map((s) => ({
      id: s.id,
      text: s.text,
      rationale: s.rationale,
      evidence_ids: s.evidence_ids,
    })),
    renderer_version: RENDERER_VERSION,
  };
}
export function reportPlainText(html, limit = 20000) {
  const parts = [];
  function visit(node) {
    if (["style", "script", "head"].includes(node.tagName)) return;
    if (node.nodeName === "#text") parts.push(node.value);
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parseFragment(html));
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, limit);
}
const reportCss = `*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.75}body{overflow-wrap:anywhere}.health-report{max-width:1200px;margin:0 auto;padding:28px 30px}h1,h2,h3,h4{line-height:1.4;font-weight:600;margin:0 0 16px}h1{font-size:28px}h2{font-size:23px}h3{font-size:18px}h4{font-size:16px}p{margin:0 0 14px}small,.report-caption,.report-muted{font-size:12px;color:var(--muted)}.report-lead{font-size:20px;line-height:1.7;margin-bottom:28px}.report-section{margin:0 0 30px}.report-grid,.report-grid-3{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-bottom:20px}.report-grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}.report-grid>* , .report-grid-3>*{min-width:0}.report-card{padding:22px;background:var(--surface);border:1px solid var(--line);border-radius:18px;min-width:0}.report-number{font-size:32px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.4}.report-unit{font-size:13px;color:var(--muted);margin-left:5px}.report-note,blockquote{border-left:3px solid var(--teal);background:var(--surface-alt);padding:16px 20px;margin:20px 0;border-radius:0 10px 10px 0;color:var(--muted)}figure{margin:20px 0}svg{display:block;max-width:100%;height:auto}figcaption{font-size:12px;color:var(--muted);margin-top:12px}table{border-collapse:collapse;width:100%;font-size:14px;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line)}th{font-weight:600}tbody tr:nth-child(even){background:var(--surface-alt)}.report-table-wrap{overflow-x:auto;max-width:100%}details{margin:16px 0;padding:14px 18px;border:1px solid var(--line);border-radius:12px}summary{cursor:pointer;color:var(--teal)}details[open]>summary{margin-bottom:14px}li{margin-bottom:10px}ul,ol{padding-left:22px}.report-actions li::marker{color:var(--teal)}hr{border:0;border-top:1px solid var(--line);margin:26px 0}:focus-visible{outline:2px solid var(--focus);outline-offset:3px}@media(max-width:600px){.health-report{padding:20px 16px}.report-grid,.report-grid-3{grid-template-columns:minmax(0,1fr)!important}.report-card{padding:18px}h1{font-size:24px}h2{font-size:21px}.report-lead{font-size:18px}.report-number{font-size:28px}}`;
let themePromise;
export async function buildReportDocument(html) {
  if (/^\s*(?:<!doctype\s+html\b|<html\b)/i.test(html))
    return buildStandaloneReport(html, bridgeScript);
  themePromise ??= readFile(
    new URL("../../../apps/web/styles.css", import.meta.url),
    "utf8",
  ).then((s) => {
    const rules = [
      ...s.matchAll(/:root(?:\[data-theme="dark"\])?\s*\{[^}]*\}/g),
    ].map((m) => m[0]);
    if (
      !rules.some((r) => r.startsWith(":root {")) ||
      !rules.some((r) => r.startsWith(':root[data-theme="dark"]'))
    )
      throw Error("report_theme_unavailable");
    // Keep source order: later accessibility/color overrides also apply in the report.
    return rules.join("\n");
  });
  const channel = randomBytes(18).toString("hex"),
    nonce = randomBytes(18).toString("base64");
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  const document = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>${await themePromise}\n${reportCss}</style></head><body data-channel="${channel}">${html}<script nonce="${nonce}">${bridgeScript}</script></body></html>`;
  return { document, channel, renderer_version: RENDERER_VERSION };
}
