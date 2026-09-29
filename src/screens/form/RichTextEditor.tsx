import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Extension } from '@tiptap/core';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { TableKit } from '@tiptap/extension-table';
import { Eraser, Link1, TextalignCenter, TextalignLeft, TextalignRight, TextBold, TextItalic, TextUnderline } from 'iconsax-react';
import { sanitizeRichText } from '../../data/formatCell';
import { useDismiss } from '../useDismiss';

/**
 * Rich text editor for Dataverse rich-text columns (the model-driven form uses CKEditor for these).
 * Built on TipTap; loaded lazily so it only costs download time when a rich field is edited.
 * Keeps what the stored CKEditor HTML uses: bold/italic/underline/strike, lists, alignment,
 * text direction, links, colours/font sizes and tables. Output is sanitized before it's saved.
 */

type Direction = 'rtl' | 'ltr';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockDirection: {
      setBlockDirection: (direction: Direction | null) => ReturnType;
    };
  }
}

/** `dir` on paragraphs, headings and list items — Arabic and English are mixed in the same field. */
const BlockDirection = Extension.create({
  name: 'blockDirection',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'listItem', 'bulletList', 'orderedList'],
        attributes: {
          dir: {
            default: null,
            parseHTML: (element) => element.getAttribute('dir'),
            renderHTML: (attributes) => (attributes.dir ? { dir: attributes.dir } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setBlockDirection:
        (direction) =>
        ({ commands }) =>
          ['paragraph', 'heading', 'listItem'].map((type) => commands.updateAttributes(type, { dir: direction })).some(Boolean),
    };
  },
});

interface RichTextEditorProps {
  id: string;
  initialHtml: string;
  onChange: (html: string) => void;
}

/** An editor with nothing but empty paragraphs means "no value" for Dataverse. */
const normalize = (editor: Editor) => (editor.isEmpty ? '' : sanitizeRichText(editor.getHTML()));

export default function RichTextEditor({ id, initialHtml, onChange }: RichTextEditorProps) {
  // The editor is created once; its update callback always calls the latest onChange.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyleKit,
      TableKit.configure({ table: { resizable: false } }),
      BlockDirection,
    ],
    content: sanitizeRichText(initialHtml),
    editorProps: {
      attributes: { id, class: 'field-input rich-text', dir: 'auto', style: 'min-height:120px;cursor:text' },
    },
    onUpdate: ({ editor: current }) => onChangeRef.current(normalize(current)),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive('bold') ?? false,
      italic: current?.isActive('italic') ?? false,
      underline: current?.isActive('underline') ?? false,
      strike: current?.isActive('strike') ?? false,
      bullet: current?.isActive('bulletList') ?? false,
      ordered: current?.isActive('orderedList') ?? false,
      left: current?.isActive({ textAlign: 'left' }) ?? false,
      center: current?.isActive({ textAlign: 'center' }) ?? false,
      right: current?.isActive({ textAlign: 'right' }) ?? false,
      link: current?.isActive('link') ?? false,
      color: (current?.getAttributes('textStyle').color as string | undefined) ?? null,
      background: (current?.getAttributes('textStyle').backgroundColor as string | undefined) ?? null,
      canUndo: current?.can().undo() ?? false,
      canRedo: current?.can().redo() ?? false,
    }),
  });

  if (!editor || !state) return <div className="field-input" style={{ minHeight: 120 }} />;

  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link address', previous ?? 'https://');
    if (url === null) return;
    if (!url.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  return (
    <div>
      <div role="toolbar" aria-label="Formatting" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        <Tool label="Bold" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}><TextBold size={14} color="currentColor" /></Tool>
        <Tool label="Italic" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><TextItalic size={14} color="currentColor" /></Tool>
        <Tool label="Underline" active={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}><TextUnderline size={14} color="currentColor" /></Tool>
        <Tool label="Strikethrough" active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></Tool>
        <Separator />
        <Tool label="Bulleted list" active={state.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}>•≡</Tool>
        <Tool label="Numbered list" active={state.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.≡</Tool>
        <Separator />
        <Tool label="Align left" active={state.left} onClick={() => editor.chain().focus().setTextAlign('left').run()}><TextalignLeft size={14} color="currentColor" /></Tool>
        <Tool label="Align center" active={state.center} onClick={() => editor.chain().focus().setTextAlign('center').run()}><TextalignCenter size={14} color="currentColor" /></Tool>
        <Tool label="Align right" active={state.right} onClick={() => editor.chain().focus().setTextAlign('right').run()}><TextalignRight size={14} color="currentColor" /></Tool>
        <Tool label="Right to left (Arabic)" onClick={() => editor.chain().focus().setBlockDirection('rtl').run()}>RTL</Tool>
        <Tool label="Left to right" onClick={() => editor.chain().focus().setBlockDirection('ltr').run()}>LTR</Tool>
        <Separator />
        <ColorMenu
          label="Font color"
          current={state.color}
          onPick={(color) => (color ? editor.chain().focus().setColor(color).run() : editor.chain().focus().unsetColor().run())}
        />
        <ColorMenu
          label="Background color"
          background
          current={state.background}
          onPick={(color) => (color ? editor.chain().focus().setBackgroundColor(color).run() : editor.chain().focus().unsetBackgroundColor().run())}
        />
        <Tool label="Link" active={state.link} onClick={setLink}><Link1 size={14} color="currentColor" /></Tool>
        <Tool label="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><Eraser size={14} color="currentColor" /></Tool>
        <Separator />
        <Tool label="Undo" disabled={!state.canUndo} onClick={() => editor.chain().focus().undo().run()}>↶</Tool>
        <Tool label="Redo" disabled={!state.canRedo} onClick={() => editor.chain().focus().redo().run()}>↷</Tool>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function Tool({ label, active = false, disabled = false, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      // Keep the text selection in the editor while clicking the toolbar.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      style={{ minWidth: 30, padding: '0 8px', height: 28 }}
    >
      {children}
    </button>
  );
}

// The model-driven rich text editor's (CKEditor 5) default palette, same values, so colours saved
// here match colours saved there.
const PALETTE: { value: string; label: string }[] = [
  { value: 'hsl(0, 0%, 0%)', label: 'Black' },
  { value: 'hsl(0, 0%, 30%)', label: 'Dim grey' },
  { value: 'hsl(0, 0%, 60%)', label: 'Grey' },
  { value: 'hsl(0, 0%, 90%)', label: 'Light grey' },
  { value: 'hsl(0, 0%, 100%)', label: 'White' },
  { value: 'hsl(0, 75%, 60%)', label: 'Red' },
  { value: 'hsl(30, 75%, 60%)', label: 'Orange' },
  { value: 'hsl(60, 75%, 60%)', label: 'Yellow' },
  { value: 'hsl(90, 75%, 60%)', label: 'Light green' },
  { value: 'hsl(120, 75%, 60%)', label: 'Green' },
  { value: 'hsl(150, 75%, 60%)', label: 'Aquamarine' },
  { value: 'hsl(180, 75%, 60%)', label: 'Turquoise' },
  { value: 'hsl(210, 75%, 60%)', label: 'Light blue' },
  { value: 'hsl(240, 75%, 60%)', label: 'Blue' },
  { value: 'hsl(270, 75%, 60%)', label: 'Purple' },
];

interface ColorMenuProps {
  label: string;
  /** Background (highlight) colour instead of font colour. */
  background?: boolean;
  current: string | null;
  onPick: (color: string | null) => void;
}

/** Font / background colour button with the model-driven palette, "Remove color" and a custom colour. */
function ColorMenu({ label, background = false, current, onPick }: ColorMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Stays open while choosing; closes on a click outside, Escape, or after a colour is picked.
  useDismiss(wrapperRef, open, () => setOpen(false));
  const pick = (color: string | null) => {
    onPick(color);
    setOpen(false);
  };
  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
        style={{ minWidth: 34, padding: '0 6px', height: 28, flexDirection: 'column', gap: 1 }}
      >
        <span style={{ fontWeight: 700, lineHeight: 1, padding: background ? '0 3px' : 0, background: background ? (current ?? 'hsl(60, 75%, 60%)') : undefined }}>A</span>
        {!background && <span aria-hidden="true" style={{ width: 14, height: 3, borderRadius: 2, background: current ?? 'hsl(0, 75%, 60%)' }} />}
      </button>
      {open && (
        <div className="ss-list open" role="menu" aria-label={label} style={{ width: 196, padding: 8, zIndex: 60 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {PALETTE.map((color) => (
              <button
                key={color.value}
                type="button"
                role="menuitem"
                title={color.label}
                aria-label={color.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(color.value)}
                style={{
                  width: 28, height: 28, borderRadius: 6, cursor: 'pointer', background: color.value,
                  border: current === color.value ? '2px solid var(--brand-gold)' : '1px solid var(--border-hover)',
                }}
              />
            ))}
          </div>
          <div className="ss-row" role="menuitem" tabIndex={0} style={{ marginTop: 6 }} onMouseDown={(event) => event.preventDefault()} onClick={() => pick(null)}>
            Remove color
          </div>
          <label className="ss-row" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            Custom color…
            <input type="color" aria-label={`Custom ${label.toLowerCase()}`} onChange={(event) => pick(event.target.value)} style={{ marginInlineStart: 'auto', width: 28, height: 22, border: 'none', background: 'none' }} />
          </label>
        </div>
      )}
    </div>
  );
}

const Separator = () => <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', margin: '2px 4px' }} />;
