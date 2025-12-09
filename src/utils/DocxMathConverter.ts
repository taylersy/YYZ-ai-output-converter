import {
    MathRun,
    MathFraction,
    MathSum,
    MathIntegral,
    MathSuperScript,
    MathSubScript,
    MathSubSuperScript,
    MathRadical,
    MathLimitUpper,
    MathLimitLower,
    XmlComponent,
    XmlAttributeComponent
} from "docx";
import katex from "katex";

// --- Custom Components for Missing Features ---

class MathAccentCharAttributes extends XmlAttributeComponent<{ val: string }> {
    protected readonly xmlKeys = { val: "m:val" };
}

class MathAccentChar extends XmlComponent {
    constructor(val: string) {
        super("m:chr");
        this.root.push(new MathAccentCharAttributes({ val }));
    }
}

class MathAccentProperties extends XmlComponent {
    constructor(accent: string) {
        super("m:accPr");
        this.root.push(new MathAccentChar(accent));
    }
}

class MathElement extends XmlComponent {
    constructor(children: any[]) {
        super("m:e");
        children.forEach(child => this.root.push(child));
    }
}

export class MathAccent extends XmlComponent {
    constructor(options: { children: any[], accent: string }) {
        super("m:acc");
        this.root.push(new MathAccentProperties(options.accent));
        this.root.push(new MathElement(options.children));
    }
}

// --- Converter Logic ---

const parser = new DOMParser();

export function mathmlToDocx(mathml: string): any[] {
    const doc = parser.parseFromString(mathml, "text/xml");
    const errorNode = doc.querySelector("parsererror");
    if (errorNode) {
        console.error("MathML parsing error", errorNode);
        return [];
    }
    
    const mathNode = doc.querySelector("math");
    if (!mathNode) return [];

    const semantics = mathNode.querySelector("semantics");
    let root: Element = semantics ? semantics : mathNode;
    
    // If semantics exists, use its first child (usually mrow or the expression)
    if (semantics) {
        const annotation = semantics.querySelector("annotation");
        if (annotation) annotation.remove(); // Remove annotations
        root = semantics.firstElementChild || semantics;
    }

    return walkNode(root);
}

function walkNode(node: Element | null): any[] {
    if (!node) return [];
    
    const tagName = node.tagName.toLowerCase();
    const children = Array.from(node.children);

    switch (tagName) {
        case "math":
        case "mrow":
        case "mstyle":
            return walkChildren(children);
            
        case "mi":
        case "mn":
        case "mo":
        case "mtext":
        case "ms": {
            const text = node.textContent || "";
            return [new MathRun(text)];
        }
        
        case "mfrac": {
            const [num, den] = children;
            return [new MathFraction({
                numerator: walkNode(num),
                denominator: walkNode(den)
            })];
        }
        
        case "msup": {
            const [base, sup] = children;
            return [new MathSuperScript({
                children: walkNode(base),
                superScript: walkNode(sup)
            })];
        }
        
        case "msub": {
            const [base, sub] = children;
            return [new MathSubScript({
                children: walkNode(base),
                subScript: walkNode(sub)
            })];
        }
        
        case "msubsup": {
            const [base, sub, sup] = children;
            // Check if base is an operator (integral, sum) to use MathIntegral/MathSum
            const baseText = base.textContent || "";
            if (isIntegral(baseText)) {
                return [new MathIntegral({
                    children: [new MathRun(baseText)], // The operator
                    subScript: walkNode(sub),
                    superScript: walkNode(sup)
                })];
            }
            if (isSum(baseText)) {
                return [new MathSum({
                    children: [new MathRun(baseText)],
                    subScript: walkNode(sub),
                    superScript: walkNode(sup)
                })];
            }
            return [new MathSubSuperScript({
                children: walkNode(base),
                subScript: walkNode(sub),
                superScript: walkNode(sup)
            })];
        }
        
        case "msqrt": {
            return [new MathRadical({
                children: walkChildren(children)
            })];
        }
        
        case "mroot": {
            const [base, degree] = children;
            return [new MathRadical({
                children: walkNode(base),
                degree: walkNode(degree)
            })];
        }
        
        case "mover": {
            const [base, over] = children;
            // Check for accent
            // KaTeX often puts accent="true" on mo, or we can detect common accents
            const isAccent = over.tagName.toLowerCase() === 'mo' && (over.getAttribute('accent') === 'true' || isAccentChar(over.textContent || ""));
            
            if (isAccent) {
                return [new MathAccent({
                    children: walkNode(base),
                    accent: over.textContent || ""
                })];
            }
            
            return [new MathLimitUpper({
                children: walkNode(base),
                limit: walkNode(over)
            })];
        }
        
        case "munder": {
            const [base, under] = children;
            return [new MathLimitLower({
                children: walkNode(base),
                limit: walkNode(under)
            })];
        }
        
        case "munderover": {
            const [base, under, over] = children;
            const baseText = base.textContent || "";
            
            if (isIntegral(baseText)) {
                 return [new MathIntegral({
                    children: [new MathRun(baseText)],
                    subScript: walkNode(under),
                    superScript: walkNode(over)
                })];
            }
            if (isSum(baseText)) {
                 return [new MathSum({
                    children: [new MathRun(baseText)],
                    subScript: walkNode(under),
                    superScript: walkNode(over)
                })];
            }
            
            // Generic munderover -> nest LimitLower and LimitUpper
            // munderover(base, under, over) = LimitLower(LimitUpper(base, over), under)
            return [new MathLimitLower({
                children: [new MathLimitUpper({
                    children: walkNode(base),
                    limit: walkNode(over)
                })],
                limit: walkNode(under)
            })];
        }
        
        case "mspace":
             return [new MathRun(" ")]; // Approximation
             
        default:
            // Fallback for unknown tags
            return walkChildren(children);
    }
}

function walkChildren(children: Element[]): any[] {
    let result: any[] = [];
    for (const child of children) {
        result = result.concat(walkNode(child));
    }
    return result;
}

function isIntegral(text: string): boolean {
    return /[\u222B\u222C\u222D\u222E\u222F\u2230\u2231\u2232\u2233]/.test(text);
}

function isSum(text: string): boolean {
    return /[\u2211\u22C0\u22C1\u22C2\u22C3\u2A00\u2A01\u2A02\u2A04\u2A06]/.test(text);
}

function isAccentChar(text: string): boolean {
    // Common accent characters
    const accents = [
        '\u2192', // vector arrow
        '\u005E', // hat ^
        '\u02C6', // hat modifier
        '\u00AF', // bar
        '\u02C9', // bar modifier
        '\u007E', // tilde
        '\u02DC', // tilde modifier
        '\u0300', '\u0301', '\u0302', '\u0303', '\u0304', '\u0305', '\u0306', '\u0307', '\u0308', '\u030A', '\u030C', // combining marks
        '→', '⃗', '^', 'ˉ', '~', '˙', '¨'
    ];
    return accents.includes(text) || text.length === 1 && text.charCodeAt(0) >= 0x300 && text.charCodeAt(0) <= 0x36F;
}

export function convertLatexToMath(latex: string, displayMode: boolean = false): any[] {
    try {
        const mathml = katex.renderToString(latex, {
            output: "mathml",
            throwOnError: false,
            displayMode: displayMode
        });
        return mathmlToDocx(mathml);
    } catch (e) {
        console.error("KaTeX error", e);
        return [new MathRun(latex)];
    }
}
