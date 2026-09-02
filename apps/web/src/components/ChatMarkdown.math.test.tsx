import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { describe, expect, it } from "vite-plus/test";
import {
  CHAT_MARKDOWN_REHYPE_PLUGINS,
  CHAT_MARKDOWN_REMARK_PLUGINS,
} from "./ChatMarkdown";

function renderMarkdown(markdown: string): string {
  return renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={CHAT_MARKDOWN_REMARK_PLUGINS}
      rehypePlugins={CHAT_MARKDOWN_REHYPE_PLUGINS}
    >
      {markdown}
    </ReactMarkdown>,
  );
}

describe("ChatMarkdown math", () => {
  it("renders inline LaTeX with KaTeX", () => {
    const html = renderMarkdown("The answer is $x^2 + y^2 = z^2$.");

    expect(html).toContain('class="katex"');
    expect(html).toContain('class="katex-html"');
    expect(html).not.toContain("<code class=\"language-math math-inline\">");
  });

  it("renders display LaTeX with KaTeX", () => {
    const html = renderMarkdown("$$\n\\frac{1}{2}mv^2\n$$");

    expect(html).toContain('class="katex-display"');
    expect(html).toContain('class="katex"');
  });
});
