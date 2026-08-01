/**
 * Remark plugin that extracts ```mermaid code blocks and replaces them
 * with placeholder elements carrying a unique data-mermaid-id attribute.
 * The parent component then renders those placeholders via the mermaid library.
 */

import { visit } from 'unist-util-visit';

const MERMAID_FENCE_START = /^```mermaid$/i;
const PLACEHOLDER_CLASS = 'mermaid-placeholder';

declare module 'mdast' {
  interface CustomNodes {
    mermaidPlaceholder: MermaidPlaceholderNode;
  }
}

interface MermaidPlaceholderNode {
  type: 'mermaidPlaceholder';
  data: {
    hName: 'div';
    hProperties: { className: string; 'data-mermaid-id': string };
  };
  value: string;
}

export function extractMermaid(): (tree: any) => void {
  return (tree) => {
    visit(tree, 'code', (node: any) => {
      if (!node || typeof node.lang !== 'string') return;
      if (!MERMAID_FENCE_START.test(node.lang.trim())) return;

      const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;

      const placeholder: MermaidPlaceholderNode = {
        type: 'mermaidPlaceholder',
        data: {
          hName: 'div',
          hProperties: {
            className: PLACEHOLDER_CLASS,
            'data-mermaid-id': id,
          },
        },
        value: node.value,
      };

      // rehype-react will render this as <div class="mermaid-placeholder" data-mermaid-id="...">
    });
  };
}
