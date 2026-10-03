import MarkdownIt from 'markdown-it';
import markdownItKatex from 'markdown-it-katex';
import hljs from 'highlight.js';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/atom-one-light.css';

export type MarkdownHighlighter = (code: string, lang: string) => string;

const escapeHtml = (input: string) =>
  input.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** 默认高亮：返回高亮后的代码，markdown-it 自己包 `<pre><code>` */
const highlightCode: MarkdownHighlighter = (code, lang) => {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang }).value;
    } catch {
      // 高亮失败时交给 markdown-it 转义输出
    }
  }
  return '';
};

/** 代码块整体输出 `<pre class="hljs">`，配合 atom-one-light 的 .hljs 底色 */
export const preBlockHighlight: MarkdownHighlighter = (code, lang) => {
  const html = lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : escapeHtml(code);
  return `<pre class="hljs"><code>${html}</code></pre>`;
};

export interface MarkdownOptions {
  /** 允许内联 HTML；用户提交的内容应关闭，避免注入 */
  allowHtml?: boolean;
  /** 数学公式（KaTeX） */
  katex?: boolean;
  /** 智能标点（引号、破折号等） */
  typographer?: boolean;
  /** 代码高亮；false = 关闭，交给 markdown-it 转义 */
  highlight?: MarkdownHighlighter | false;
}

export const createMarkdownRenderer = (options: MarkdownOptions = {}) => {
  const { allowHtml = true, katex = true, typographer = true, highlight = highlightCode } = options;
  const md = new MarkdownIt({
    html: allowHtml,
    linkify: true,
    typographer,
    breaks: true,
    ...(highlight ? { highlight } : {})
  });
  if (katex) md.use(markdownItKatex);
  return md;
};
