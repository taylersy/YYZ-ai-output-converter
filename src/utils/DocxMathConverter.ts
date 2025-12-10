import {
    MathRun,
    MathFraction,
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

class MathValAttribute extends XmlAttributeComponent<{ val: string }> {
    protected readonly xmlKeys = { val: "m:val" };
}

class GenericXmlComponent extends XmlComponent {
    constructor(rootKey: string) {
        super(rootKey);
    }
    
    public addChild(child: any) {
        this.root.push(child);
    }

    public getLastChild(): any {
        return this.root.length > 0 ? this.root[this.root.length - 1] : null;
    }
}

class MathAccentChar extends XmlComponent {
    constructor(val: string) {
        super("m:chr");
        this.root.push(new MathValAttribute({ val }));
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

class MathMatrixProperties extends XmlComponent {
    constructor() {
        super("m:mPr");
        // Define matrix column properties (m:mcs) to ensure correct spacing and alignment
        // <m:mcs>
        //   <m:mc>
        //     <m:mcPr>
        //       <m:count m:val="1"/>
        //       <m:mcJc m:val="center"/>
        //     </m:mcPr>
        //   </m:mc>
        // </m:mcs>
        
        const mcs = new GenericXmlComponent("m:mcs");
        const mc = new GenericXmlComponent("m:mc");
        const mcPr = new GenericXmlComponent("m:mcPr");
        
        // Column count: 1 (Word repeats the last column definition for remaining columns)
        const count = new GenericXmlComponent("m:count");
        count.addChild(new MathValAttribute({ val: "1" }));
        
        // Alignment: center (Fixes alignment issues in determinants/matrices)
        const jc = new GenericXmlComponent("m:mcJc");
        jc.addChild(new MathValAttribute({ val: "center" }));
        
        mcPr.addChild(count);
        mcPr.addChild(jc);
        mc.addChild(mcPr);
        mcs.addChild(mc);
        
        this.root.push(mcs);
    }
}

class MathMatrixRow extends XmlComponent {
    constructor(children: MathElement[]) {
        super("m:mr");
        children.forEach(child => this.root.push(child));
    }
}

class MathMatrix extends XmlComponent {
    constructor(rows: MathMatrixRow[]) {
        super("m:m");
        this.root.push(new MathMatrixProperties());
        rows.forEach(row => this.root.push(row));
    }
}

// --- N-ary Operator Support (Integrals, Sums, Products) ---

class MathNaryProperties extends XmlComponent {
    constructor(chr: string, limitLocation?: "subSup" | "undOvr") {
        super("m:naryPr");
        this.root.push(new MathAccentChar(chr)); // Reuse MathAccentChar for m:chr
        
        if (limitLocation) {
            const limLoc = new GenericXmlComponent("m:limLoc");
            limLoc.addChild(new MathValAttribute({ val: limitLocation }));
            this.root.push(limLoc);
        }
    }
}

export class MathNary extends XmlComponent {
    private baseElement: GenericXmlComponent;

    constructor(options: {
        char: string,
        limitLocation?: "subSup" | "undOvr",
        subScript?: any[],
        superScript?: any[],
        children?: any[]
    }) {
        super("m:nary");
        this.root.push(new MathNaryProperties(options.char, options.limitLocation));
        
        const sub = new GenericXmlComponent("m:sub");
        if (options.subScript) {
            options.subScript.forEach(child => sub.addChild(child));
        }
        this.root.push(sub);

        const sup = new GenericXmlComponent("m:sup");
        if (options.superScript) {
            options.superScript.forEach(child => sup.addChild(child));
        }
        this.root.push(sup);

        this.baseElement = new GenericXmlComponent("m:e");
        if (options.children && options.children.length > 0) {
            options.children.forEach(child => this.baseElement.addChild(child));
        } else {
            // Add zero-width space to hide placeholder box
            this.baseElement.addChild(new MathRun("\u200B"));
        }
        this.root.push(this.baseElement);
    }

    public addChildToBase(child: any) {
        this.baseElement.addChild(child);
    }

    public getLastBaseChild(): any {
        return this.baseElement.getLastChild();
    }
}

// --- Delimiter Support (Fences) ---

class MathDelimiterShape extends XmlAttributeComponent<{ val: string }> {
    protected readonly xmlKeys = { val: "m:val" };
}

class MathDelimiterChar extends XmlComponent {
    constructor(tagName: string, val: string) {
        super(tagName);
        this.root.push(new MathDelimiterShape({ val }));
    }
}

class MathDelimiterProperties extends XmlComponent {
    constructor(begChr: string, endChr: string) {
        super("m:dPr");
        // Only add if not default? Defaults are usually ( and )
        // But for safety we always add
        this.root.push(new MathDelimiterChar("m:begChr", begChr));
        this.root.push(new MathDelimiterChar("m:endChr", endChr));
    }
}

class MathDelimiter extends XmlComponent {
    constructor(children: any[], begChr: string = "(", endChr: string = ")") {
        super("m:d");
        this.root.push(new MathDelimiterProperties(begChr, endChr));
        // m:d requires content wrapped in m:e
        this.root.push(new MathElement(children));
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
        case "mstyle":
            return walkChildren(children);

        case "mrow": {
            // Advanced fence handling with stack to support:
            // 1. cases: { ... (no close)
            // 2. P(A|B): P, (, A, |, B, ) (P outside)
            // 3. (a) + (b): Separate delimiters
            // 4. Nested: ( a + ( b ) )

            const result: any[] = [];
            let stack: { startNode: Element, children: any[], openChar: string }[] = [];

            // Helper to append nodes, with greedy N-ary handling
            const appendToContext = (container: any[], item: any) => {
                let appended = false;
                if (container.length > 0) {
                    let last = container[container.length - 1];
                    // Iterative dive to find the deepest right-most N-ary operator
                    // This ensures chains like \int \int or \int ( \int ) are handled correctly
                    // But we must be careful not to dive into non-N-ary structures (like fences) 
                    // unless we want to? No, fences are closed.
                    // MathDelimiter is NOT MathNary.
                    
                    while (last instanceof MathNary) {
                        const innerLast = last.getLastBaseChild();
                        if (innerLast instanceof MathNary) {
                            last = innerLast;
                        } else {
                            // Found the deepest N-ary that doesn't end with another N-ary
                            // Append here
                            last.addChildToBase(item);
                            appended = true;
                            break;
                        }
                    }
                }
                
                if (!appended) {
                    container.push(item);
                }
            };

            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                const isChildFence = isFence(child);
                
                if (isChildFence) {
                    const char = child.textContent || "";
                    
                    // Determine if it's an opener, closer, or ambiguous
                    const isOpener = ['(', '[', '{', '\u27E8', '\u2016'].includes(char) || char === 'l'; // 'l' unlikely but safe
                    const isCloser = [')', ']', '}', '\u27E9'].includes(char);
                    // Add \u2223 (divides) to ambiguous list, as KaTeX uses it for |
                    const isAmbiguous = ['|', '\u2016', '.', '\u2223'].includes(char);
                    
                    // Special handling for explicit KaTeX fence attribute
                    // If fence="true", trust it?
                    // KaTeX often marks both ( and ) as fence="true".
                    
                    // Logic for ambiguous (like |):
                    // If stack top is same char, treat as closer. Else opener.
                    // For '.', it's usually empty placeholder. Treated as ambiguous/closer?
                    
                    let action = 'text'; // default
                    
                    if (isOpener) action = 'open';
                    else if (isCloser) action = 'close';
                    else if (isAmbiguous) {
                        if (stack.length > 0 && stack[stack.length - 1].openChar === char) {
                            action = 'close';
                        } else {
                            action = 'open';
                        }
                    }

                    // Handle Mismatched Close:
                    // If we have ')' but stack top is '|', maybe we should close '|' first?
                    if (action === 'close' && stack.length > 0) {
                        const top = stack[stack.length - 1];
                        if (!isPair(top.openChar, char) && !isAmbiguous) {
                            // Look down the stack
                            let found = false;
                            for (let j = stack.length - 1; j >= 0; j--) {
                                if (isPair(stack[j].openChar, char)) {
                                    found = true;
                                    break;
                                }
                            }
                            if (found) {
                                // Close everything up to the match
                                while (stack.length > 0) {
                                    const currentTop = stack[stack.length - 1];
                                    if (isPair(currentTop.openChar, char)) {
                                        // Found match, standard close will handle it
                                        break;
                                    } else {
                                        // Auto-close mismatched inner fence
                                        stack.pop();
                                        const delim = new MathDelimiter(
                                            walkChildren(currentTop.children), 
                                            normalizeFence(currentTop.openChar), 
                                            "" // Auto-close with empty
                                        );
                                        // Add to new top (or result)
                                        if (stack.length > 0) {
                                            stack[stack.length - 1].children.push(delim);
                                        } else {
                                            result.push(delim);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (action === 'open') {
                        stack.push({ startNode: child, children: [], openChar: char });
                    } else if (action === 'close') {
                        if (stack.length > 0) {
                            const top = stack.pop()!;
                            const delim = new MathDelimiter(
                                walkChildren(top.children), 
                                normalizeFence(top.openChar), 
                                normalizeFence(char)
                            );
                            
                            const targetStack = stack.length > 0 ? stack[stack.length - 1].children : result;
                            appendToContext(targetStack, delim);
                        } else {
                            // Unmatched close fence, treat as text
                            const nodes = walkNode(child);
                            nodes.forEach(n => result.push(n)); // Treat unmatched close as normal nodes, don't append to Nary? Or do?
                            // Usually unmatched close like ) shouldn't be consumed by Nary inside the fence.
                            // But here we are outside.
                            // Let's stick to simple push for now to avoid consuming a trailing ')' if logic is flawed.
                        }
                    } else {
                         const nodes = walkNode(child);
                         const targetStack = stack.length > 0 ? stack[stack.length - 1].children : result;
                         nodes.forEach(n => appendToContext(targetStack, n));
                    }

                } else {
                    // Not a fence
                    const nodes = walkNode(child);
                    const targetStack = stack.length > 0 ? stack[stack.length - 1].children : result;
                    nodes.forEach(n => appendToContext(targetStack, n));
                }
            }

            // Close any remaining open fences (e.g. cases { ...)
            while (stack.length > 0) {
                const top = stack.pop()!;
                const delim = new MathDelimiter(
                    walkChildren(top.children), 
                    normalizeFence(top.openChar), 
                    "" // Auto-close with empty
                );
                const targetStack = stack.length > 0 ? stack[stack.length - 1].children : result;
                appendToContext(targetStack, delim);
            }

            return result;
        }
        
        case "mfenced": {
            // Native MathML fenced element
            const open = node.getAttribute("open") || "(";
            const close = node.getAttribute("close") || ")";
            return [new MathDelimiter(walkChildren(children), open, close)];
        }

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
            // Check if base is an operator (integral, sum) to use MathNary
            const baseText = base.textContent || "";
            if (isIntegral(baseText)) {
                return [new MathNary({
                    char: baseText,
                    limitLocation: "subSup", // Integrals usually have limits to the right
                    subScript: walkNode(sub),
                    superScript: walkNode(sup),
                    children: [] // Empty body
                })];
            }
            if (isSum(baseText)) {
                return [new MathNary({
                    char: baseText,
                    limitLocation: "subSup", // Inline sums have limits to the right
                    subScript: walkNode(sub),
                    superScript: walkNode(sup),
                    children: []
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
                 return [new MathNary({
                    char: baseText,
                    limitLocation: "undOvr", // Explicit over/under limits
                    subScript: walkNode(under),
                    superScript: walkNode(over),
                    children: []
                })];
            }
            if (isSum(baseText)) {
                 return [new MathNary({
                    char: baseText,
                    limitLocation: "undOvr", // Display sums have limits above/below
                    subScript: walkNode(under),
                    superScript: walkNode(over),
                    children: []
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

        case "mtable": {
            const rows = Array.from(children).map(child => {
                // child should be mtr
                if (child.tagName.toLowerCase() === "mtr") {
                    const cells = Array.from(child.children).map(cell => {
                        // cell should be mtd
                        if (cell.tagName.toLowerCase() === "mtd") {
                            return new MathElement(walkNode(cell));
                        }
                        return new MathElement([]); // Empty cell fallback
                    });
                    return new MathMatrixRow(cells);
                }
                return new MathMatrixRow([]); // Empty row fallback
            });
            return [new MathMatrix(rows)];
        }
             
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
    // Include Sum (\u2211), Product (\u220F), Coproduct (\u2210) and other N-ary operators
    return /[\u2211\u220F\u2210\u22C0\u22C1\u22C2\u22C3\u2A00\u2A01\u2A02\u2A04\u2A06]/.test(text);
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

function isFence(node: Element): boolean {
    if (node.tagName.toLowerCase() !== 'mo') return false;
    
    // Explicit fence attribute from KaTeX
    if (node.getAttribute('fence') === 'true') return true;
    
    // Common fence characters
    const text = node.textContent || "";
    const fenceChars = ['(', ')', '[', ']', '{', '}', '|', '\u2016', '\u27E8', '\u27E9', '.'];
    return fenceChars.includes(text);
}

function isPair(open: string, close: string): boolean {
    if (open === '(' && close === ')') return true;
    if (open === '[' && close === ']') return true;
    if (open === '{' && close === '}') return true;
    if (open === '\u27E8' && close === '\u27E9') return true; // angle brackets
    if (open === '\u2016' && close === '\u2016') return true; // double vert
    // Match | with | (both regular and divides char)
    if ((open === '|' || open === '\u2223') && (close === '|' || close === '\u2223')) return true;
    return false;
}

// Handle "." as empty delimiter
// Also normalize "∣" (0x2223) to "|" (0x007C) for Word compatibility
function normalizeFence(ch: string): string {
    if (ch === ".") return "";
    if (ch.charCodeAt(0) === 0x2223) return "|";
    return ch;
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
