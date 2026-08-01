import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import './MarkdownRenderer.css';

interface Props {
  content: string;
}

/** Regex to match ```mermaid ... ``` fenced code blocks */
const MERMAID_RE = /```mermaid\s*([\s\S]*?)```/gi;

/**
 * Extract mermaid blocks from markdown, replace with placeholder divs.
 * ReactMarkdown will render those divs as raw HTML elements.
 */
function prepareContent(content: string): { html: string; diagrams: Array<{ id: string; source: string }> } {
  const diagrams: Array<{ id: string; source: string }> = [];

  const processed = content.replace(MERMAID_RE, (_, src) => {
    const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
    diagrams.push({ id, source: src.trim() });
    return `\n<div class="mermaid-placeholder" data-mermaid-id="${id}"></div>\n`;
  });

  return { html: processed, diagrams };
}

/** Lazily initialise mermaid on first render */
async function initMermaid() {
  const { default: mermaid } = await import('mermaid');
  if (!mermaid.mermaidAPI) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'var(--font-sans, sans-serif)',
    });
  }
}

let initialized = false;

export function MarkdownRenderer({ content }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { html, diagrams } = prepareContent(content);

  useEffect(() => {
    if (!initialized) {
      initialized = true;
      initMermaid();
    }

    // Render all mermaid placeholders inside this component's subtree
    const renderDiagram = async (el: Element, diagram: { id: string; source: string }) => {
      try {
        const { default: mermaid } = await import('mermaid');
        if (!mermaid.mermaidAPI) {
          mermaid.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'loose',
            fontFamily: 'var(--font-sans, sans-serif)',
          });
        }
        const result = await mermaid.mermaidAPI.render(diagram.id, diagram.source, undefined);
        if (result?.svg) {
          el.innerHTML = '';
          const parser = new DOMParser();
          const doc = parser.parseFromString(result.svg, 'image/svg+xml');
          const svgEl = doc.documentElement;
          if (svgEl) el.appendChild(svgEl);
        }
      } catch {
        // Mermaid failed — leave placeholder visible as code block
        const codeEl = document.createElement('pre');
        codeEl.className = 'mermaid-fallback';
        codeEl.textContent = diagram.source;
        el.replaceWith(codeEl);
      }
    };

    const placeholders = containerRef.current?.querySelectorAll(`.${'mermaid-placeholder'}`) || [];
    let i = 0;
    (placeholders as NodeListOf<Element>).forEach((el) => {
      if (diagrams[i]) renderDiagram(el, diagrams[i]);
      i++;
    });
  }, [html, diagrams]);

  return (
    <div className="md" ref={containerRef}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
        {html}
      </ReactMarkdown>
    </div>
  );
}
