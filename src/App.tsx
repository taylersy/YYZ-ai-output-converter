import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { saveAs } from 'file-saver';
import MathEditor from './components/MathEditor';
import { generateDocx } from './utils/MarkdownToDocx';
import './App.css';

function App() {
  const [markdown, setMarkdown] = useState<string>('# 欢迎使用 AI 输出转换器\n\n这是一个支持 **Markdown** 和 **LaTeX 数学公式** 的编辑器。\n\n## 示例公式\n\n行内公式: $E = mc^2$\n\n块级公式:\n$$ \\int_0^\\infty x^2 dx $$\n\n你可以点击下方的“下载 Word”按钮将内容转换为 Word 文档，公式将自动转换为 Word 可编辑格式。');
  const [showAbout, setShowAbout] = useState(false);
  const [isConverting, setIsConverting] = useState(false);

  const handleInsertMath = (latex: string) => {
    setMarkdown(prev => prev + latex);
  };

  const handleClear = () => {
    if (window.confirm('确定要清空所有内容吗？')) {
      setMarkdown('');
    }
  };

  const handleDownload = async () => {
    setIsConverting(true);
    try {
      const blob = await generateDocx(markdown);
      saveAs(blob, 'translated_document.docx');
    } catch (error) {
      console.error('Conversion failed:', error);
      alert('转换失败，请检查控制台日志。');
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>AI 输出转换器</h1>
        <div className="header-actions">
          <button onClick={() => setShowAbout(true)}>关于</button>
        </div>
      </header>

      {showAbout && (
        <div className="modal-overlay" onClick={() => setShowAbout(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>关于本工具</h2>
            <p>这是一个运行在浏览器端的 Markdown 转 Word 工具。</p>
            <ul>
              <li>支持标准 Markdown 语法</li>
              <li>支持 LaTeX 数学公式 (行内 $...$ 和 块级 $$...$$)</li>
              <li>生成的 Word 文档包含原生公式对象，可编辑</li>
              <li>纯前端运行，无需上传数据，安全快速</li>
              <li>适配中国网络环境</li>
            </ul>
            <button onClick={() => setShowAbout(false)}>关闭</button>
          </div>
        </div>
      )}

      <main className="main-content">
        <div className="left-panel">
          <div className="toolbar">
            <button className="download-btn" onClick={handleDownload} disabled={isConverting}>
              {isConverting ? '转换中...' : '下载 Word'}
            </button>
            <button className="clear-btn" onClick={handleClear}>清空内容</button>
          </div>
          
          <MathEditor onInsert={handleInsertMath} />
          
          <textarea
            className="markdown-input"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder="在此输入或粘贴 Markdown 内容..."
          />
        </div>

        <div className="right-panel">
          <div className="preview-header">预览</div>
          <div className="preview-content">
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
              {markdown}
            </ReactMarkdown>
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <button 
          className="download-btn" 
          onClick={handleDownload} 
          disabled={isConverting}
        >
          {isConverting ? '正在转换...' : '下载 Word 文档'}
        </button>
      </footer>
    </div>
  );
}

export default App;
