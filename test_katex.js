
import katex from 'katex';

// Copy of normalizeMarkdown logic
function normalizeMarkdown(markdown) {
    if (!markdown) return "";
    let normalized = markdown;
    normalized = normalized.replace(/[\uff01-\uff5e]/g, function(ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
    }).replace(/\u3000/g, ' ');
    normalized = normalized.replace(/\\\((.*?)\\\)/g, '$$$1$$');
    normalized = normalized.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');
    normalized = normalized.replace(/\$\$([\s\S]*?)\$\$/g, (_, content) => {
        return `\n\n$$\n${content.trim()}\n$$\n\n`;
    });
    normalized = normalized.replace(/^( +|\t+)(?=.*\$)/gm, (match) => {
        if (match.includes('\t') || match.length >= 4) {
             return match.replace(/ /g, '\u00A0').replace(/\t/g, '\u00A0\u00A0\u00A0\u00A0');
        }
        return match;
    });
    return normalized;
}

const input1 = `#### （1）**欧拉-拉格朗日方程（场论形式）** 
 数学物理中变分法的核心，用于推导物理系统的运动方程： 
 $$\frac{\partial \mathcal{L}}{\partial \phi}-\partial_\mu\left(\frac{\partial \mathcal{L}}{\partial (\partial_\mu \phi)}\right)=0$$`;

const input2 = `#### （2）**路径积分公式（费曼路径积分）** 
 量子力学的第三种表述形式，将量子跃迁概率表示为所有可能路径的积分： 
 $$\langle q_f,t_f|q_i,t_i\rangle=\int\mathcal{D}[q(t)]\exp\left\{\frac{i}{\hbar}S[q(t)]\right\}$$`;

// Check if normalizeMarkdown breaks it
console.log("\n--- Testing Normalize Input 1 ---");
const norm1 = normalizeMarkdown(input1);
console.log(JSON.stringify(norm1));

console.log("\n--- Testing Normalize Input 2 ---");
const norm2 = normalizeMarkdown(input2);
console.log(JSON.stringify(norm2));

// Extract math from normalized string (simple regex simulation)
const mathRegex = /\$\$([\s\S]*?)\$\$/;
const match2 = norm2.match(mathRegex);

if (match2) {
    const latex = match2[1].trim();
    console.log("\nExtracted LaTeX:", latex);
    try {
        const mathml = katex.renderToString(latex, {
             output: "mathml",
             throwOnError: false,
             displayMode: true
        });
        console.log("KaTeX Render Success");
    } catch (e) {
        console.error("KaTeX Render Failed:", e);
    }
} else {
    console.log("No math found in normalized string");
}
