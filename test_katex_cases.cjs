const katex = require('katex');

const latex = String.raw`\begin{cases} x \\ y \end{cases}`;
const mathml = katex.renderToString(latex, {
    output: "mathml",
    throwOnError: false
});

console.log(mathml);
