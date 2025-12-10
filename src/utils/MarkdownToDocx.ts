import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Math } from "docx";
import { convertLatexToMath } from "./DocxMathConverter";

// Helper to normalize AI/User input for better compatibility
export function normalizeMarkdown(markdown: string): string {
    if (!markdown) return "";
    
    let normalized = markdown;

    // 0. Mobile compatibility: Convert full-width chars to half-width
    // e.g., ＄ -> $, （ -> (, ） -> )
    normalized = normalized.replace(/[\uff01-\uff5e]/g, function(ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
    }).replace(/\u3000/g, ' ');

    // 1. Convert LaTeX-style inline math \( ... \) to $ ... $
    normalized = normalized.replace(/\\\((.*?)\\\)/g, '$$$1$$');

    // 2. Convert LaTeX-style display math \[ ... \] to $$ ... $$
    normalized = normalized.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');

    // 3. Ensure $$ ... $$ display math is properly spaced (on new lines)
    // This handles cases like: text $$math$$ text  OR  $$\begin{cases}...\end{cases}$$ (one line)
    // We wrap them in newlines to ensure remark-math and our parser identify them as block math
    normalized = normalized.replace(/\$\$([\s\S]*?)\$\$/g, (_, content) => {
        // Keep content as is, just wrap with newlines and $$
        return `\n\n$$\n${content.trim()}\n$$\n\n`;
    });

    // 4. Fix for "math treated as code block due to indentation"
    // Users often indent text with 4 spaces, which Markdown treats as a code block.
    // If the indented line contains math ($...$), we assume it's text, not code.
    // We replace leading spaces/tabs with Non-Breaking Spaces (\u00A0) which count as text.
    normalized = normalized.replace(/^( +|\t+)(?=.*\$)/gm, (match) => {
        // Only replace if length >= 4 spaces or any tab (since 4 spaces triggers code block)
        if (match.includes('\t') || match.length >= 4) {
             return match.replace(/ /g, '\u00A0').replace(/\t/g, '\u00A0\u00A0\u00A0\u00A0');
        }
        return match;
    });

    return normalized;
}

export async function generateDocx(markdown: string): Promise<Blob> {
    // Pre-process the markdown to fix formatting issues
    const cleanMarkdown = normalizeMarkdown(markdown);
    
    const doc = new Document({
        sections: [{
            properties: {},
            children: parseMarkdown(cleanMarkdown)
        }]
    });
    return await Packer.toBlob(doc);
}

function parseMarkdown(markdown: string): any[] {
    const lines = markdown.split('\n');
    const children: any[] = [];
    
    let currentParagraphLines: string[] = [];
    let inBlockMath = false;
    let blockMathContent: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // Handle Block Math $$
        // Case 1: $$ only on a line
        if (trimmedLine === '$$') {
            if (inBlockMath) {
                // End of block math
                if (blockMathContent.length > 0) {
                    children.push(createMathBlock(blockMathContent.join('\n')));
                }
                blockMathContent = [];
                inBlockMath = false;
            } else {
                // Start of block math
                if (currentParagraphLines.length > 0) {
                    children.push(createParagraph(currentParagraphLines));
                    currentParagraphLines = [];
                }
                inBlockMath = true;
            }
            continue;
        }

        // Case 2: $$ content $$ on one line (not strictly standard block math but common)
        // Check if line starts and ends with $$
        if (!inBlockMath && trimmedLine.startsWith('$$') && trimmedLine.endsWith('$$') && trimmedLine.length > 4) {
             if (currentParagraphLines.length > 0) {
                children.push(createParagraph(currentParagraphLines));
                currentParagraphLines = [];
            }
            const latex = trimmedLine.substring(2, trimmedLine.length - 2);
            children.push(createMathBlock(latex));
            continue;
        }

        if (inBlockMath) {
            blockMathContent.push(line);
            continue;
        }

        // Headings
        if (line.startsWith('#')) {
            if (currentParagraphLines.length > 0) {
                children.push(createParagraph(currentParagraphLines));
                currentParagraphLines = [];
            }
            const match = line.match(/^(#+)\s*(.*)/);
            if (match) {
                const level = match[1].length;
                const text = match[2];
                // Limit heading level to 6
                const headingLevel = level <= 6 ? `HEADING_${level}` : "HEADING_6";
                
                children.push(new Paragraph({
                    children: parseInline(text),
                    heading: HeadingLevel[headingLevel as keyof typeof HeadingLevel],
                }));
            }
            continue;
        }

        // Empty lines separate paragraphs
        if (trimmedLine === '') {
            if (currentParagraphLines.length > 0) {
                children.push(createParagraph(currentParagraphLines));
                currentParagraphLines = [];
            }
            continue;
        }

        currentParagraphLines.push(line);
    }

    if (currentParagraphLines.length > 0) {
        children.push(createParagraph(currentParagraphLines));
    }

    return children;
}

function createMathBlock(latex: string) {
    // Block math usually centered
    const mathNodes = convertLatexToMath(latex, true); // true for display mode
    return new Paragraph({
        children: [new Math({
            children: mathNodes
        })],
        alignment: AlignmentType.CENTER
    });
}

function createParagraph(lines: string[]) {
    // Process inline math and formatting
    const text = lines.join(' '); // Markdown joins adjacent lines into one paragraph
    const children = parseInline(text);
    return new Paragraph({
        children: children
    });
}

function parseInline(text: string, style: any = {}): any[] {
    const parts: any[] = [];
    
    // Regex for:
    // 1. Inline math: $...$ (non-greedy)
    // 2. Bold: **...** (non-greedy)
    // 3. Italic: *...* (non-greedy)
    // Note: This is a simplified parser. It handles nested math inside bold/italics.
    
    const regex = /(\$[^$]+\$)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
    
    let lastIndex = 0;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
        // Text before match
        if (match.index > lastIndex) {
            parts.push(new TextRun({
                text: text.substring(lastIndex, match.index),
                ...style
            }));
        }
        
        const content = match[0];
        
        if (content.startsWith('$')) {
            // Inline math - Math elements don't inherit text styles like bold directly in the same way,
            // but we process them as math.
            const latex = content.substring(1, content.length - 1);
            const mathNodes = convertLatexToMath(latex, false);
            parts.push(new Math({
                children: mathNodes
            }));
        } else if (content.startsWith('**')) {
            // Bold - Recurse to handle nested math or mixed content
            const innerText = content.substring(2, content.length - 2);
            parts.push(...parseInline(innerText, { ...style, bold: true }));
        } else if (content.startsWith('*')) {
            // Italic - Recurse to handle nested math or mixed content
            const innerText = content.substring(1, content.length - 1);
            parts.push(...parseInline(innerText, { ...style, italics: true }));
        }
        
        lastIndex = regex.lastIndex;
    }
    
    if (lastIndex < text.length) {
        parts.push(new TextRun({
            text: text.substring(lastIndex),
            ...style
        }));
    }
    
    return parts.length > 0 ? parts : [new TextRun({ text: text, ...style })];
}
