import { useEffect, useRef, useState } from 'react';
import 'mathlive';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        ref?: React.RefObject<HTMLElement>;
      };
    }
  }
}

interface MathEditorProps {
  onInsert: (latex: string) => void;
}

const MathEditor: React.FC<MathEditorProps> = ({ onInsert }) => {
  const mfRef = useRef<HTMLElement>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    const mf = mfRef.current;
    if (mf) {
      // Listen for changes
      (mf as any).addEventListener('input', (evt: any) => {
        setValue(evt.target.value);
      });
    }
  }, []);

  const handleCopy = () => {
    onInsert(`$${value}$`);
  };

  const handleBlockCopy = () => {
    onInsert(`\n$$${value}$$\n`);
  };

  return (
    <div className="math-editor-container">
      <label>数学公式编辑器 (MathLive)</label>
      <div className="math-field-wrapper">
        <math-field ref={mfRef} style={{ width: '100%', padding: '8px', border: '1px solid #444', borderRadius: '4px' }}>
          {value}
        </math-field>
      </div>
      <div className="math-actions">
        <button onClick={handleCopy} title="插入行内公式">插入行内 ($...$)</button>
        <button onClick={handleBlockCopy} title="插入块级公式">插入块级 ($$...$$)</button>
        <button onClick={() => { setValue(''); if (mfRef.current) (mfRef.current as any).setValue(''); }}>清空公式</button>
      </div>
    </div>
  );
};

export default MathEditor;
