import { parse, serialize } from "parse5";
import { randomBytes } from "node:crypto";

export const DOCUMENT_RENDERER_VERSION = "2";

// Keep the model's typography, CSS, SVG and layout. Active content is handled
// by the host, independently of the creative prompt.
export function sanitizeReportDocument(html) {
  if (typeof html !== "string" || Buffer.byteLength(html) > 262144)
    throw Error("invalid_report: HTML 大小超出限制");
  const document = parse(html), references = new Set();
  const removed = new Set(["script", "iframe", "object", "embed", "base", "link", "form"]);
  let count = 0;
  function visit(node, depth = 0) {
    if (++count > 20000 || depth > 60) throw Error("invalid_report: HTML 结构过于复杂");
    if (node.attrs) {
      node.attrs = node.attrs.filter((a) => !a.name.startsWith("on") && !["srcdoc", "formaction"].includes(a.name));
      for (const a of node.attrs) if (a.name === "data-evidence")
        for (const id of a.value.trim().split(/\s+/)) if (id) references.add(id);
    }
    if (node.childNodes) {
      node.childNodes = node.childNodes.filter((n) => n.nodeName !== "#comment" && !removed.has(n.tagName) &&
        !(n.tagName === "meta" && n.attrs?.some((a) => a.name === "http-equiv")));
      for (const child of node.childNodes) visit(child, depth + 1);
    }
    if (node.content) visit(node.content, depth + 1);
  }
  visit(document);
  return { document, references };
}

export function validateDocumentReport(payload, snapshot, validateMetadata) {
  if (!payload || !["title", "summary"].every((key) => typeof payload[key] === "string" && payload[key].trim() && payload[key].length <= 16384))
    throw Error("invalid_report: 标题或摘要无效");
  const { document, references } = sanitizeReportDocument(payload.html);
  if (!Array.isArray(payload.evidence_ids)) throw Error("invalid_report: 需要引用证据");
  const evidence_ids = [...new Set([...payload.evidence_ids, ...references])];
  // Reuse the established evidence/suggestion validation without applying the
  // legacy fragment's typography or short archive-summary limits.
  const metadata = validateMetadata({ ...payload, title: "报告", summary: "报告摘要", evidence_ids,
    html: '<article class="health-report"><p>报告</p></article>' }, snapshot);
  return { ...metadata, title: payload.title.trim(), summary: payload.summary.trim(),
    html: serialize(document), renderer_version: DOCUMENT_RENDERER_VERSION };
}

export function buildStandaloneReport(html, bridgeScript) {
  const { document } = sanitizeReportDocument(html);
  const root = document.childNodes.find((n) => n.tagName === "html");
  const head = root.childNodes.find((n) => n.tagName === "head");
  const body = root.childNodes.find((n) => n.tagName === "body");
  const channel = randomBytes(18).toString("hex"), nonce = randomBytes(18).toString("base64");
  body.attrs = body.attrs.filter((a) => a.name !== "data-channel");
  body.attrs.push({ name: "data-channel", value: channel });
  head.childNodes = head.childNodes.filter((n) => !(n.tagName === "meta" && n.attrs?.some((a) =>
    a.name === "charset" || (a.name === "name" && a.value.toLowerCase() === "viewport"))));
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  const prefix = `<meta http-equiv="Content-Security-Policy" content="${csp}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`;
  return { document: serialize(document).replace("<head>", "<head>" + prefix)
    .replace("</body>", `<script nonce="${nonce}">${bridgeScript}</script></body>`),
    channel, renderer_version: DOCUMENT_RENDERER_VERSION };
}
