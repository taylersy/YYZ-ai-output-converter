
function normalizeMarkdown(markdown) {
    if (!markdown) return "";
    
    let normalized = markdown;

    // 0. Mobile compatibility: Convert full-width chars to half-width
    normalized = normalized.replace(/[\uff01-\uff5e]/g, function(ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
    }).replace(/\u3000/g, ' ');

    // 1. Convert LaTeX-style inline math \( ... \) to $ ... $
    normalized = normalized.replace(/\\\((.*?)\\\)/g, '$$$1$$');

    // 2. Convert LaTeX-style display math \[ ... \] to $$ ... $$
    normalized = normalized.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');

    return normalized;
}

const input = String.raw`Here is a fraction: \frac{a}{b}`;
const output = normalizeMarkdown(input);

console.log("Input:", input);
console.log("Output:", output);

const inputEscaped = String.raw`Here is a fraction: \\frac{a}{b}`;
const outputEscaped = normalizeMarkdown(inputEscaped);
console.log("Input Escaped:", inputEscaped);
console.log("Output Escaped:", outputEscaped);

if (input !== output) {
    console.log("CHANGE DETECTED!");
    for (let i = 0; i < input.length; i++) {
        if (input[i] !== output[i]) {
            console.log(`Mismatch at index ${i}: ${input.charCodeAt(i)} vs ${output.charCodeAt(i)}`);
        }
    }
} else {
    console.log("No change.");
}

const complexInput = String.raw`
$$
\mathcal{Z} = \int \mathcal{D}\phi e^{iS[\phi]}
$$
`;
console.log("Complex Output:", normalizeMarkdown(complexInput));
