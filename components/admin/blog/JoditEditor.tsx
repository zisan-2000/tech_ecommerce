//components/richTextEditor.tsx

import React, { useState, useRef, useMemo, useEffect } from "react";
// import JoditEditor from "jodit-react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";

const JoditEditor = dynamic(() => import("jodit-react"), { ssr: false });

interface JoditEditorProps {
  placeholder?: string;
  initialValue?: string;
  onContentChange?: (content: string) => void;
  height?: string | number;
  width?: string | number;
}

const JoditEditorComponent: React.FC<JoditEditorProps> = ({
  placeholder = "Start typing...",
  initialValue = "",
  onContentChange,
  height = "400px",
  width = "100%",
}) => {
  const editor = useRef(null);
  const [content, setContent] = useState(initialValue);
  const { theme, resolvedTheme } = useTheme();
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark">("light");

  // Update theme when it changes
  useEffect(() => {
    setCurrentTheme(
      theme === "dark" || resolvedTheme === "dark" ? "dark" : "light",
    );
  }, [theme, resolvedTheme]);

  const config = useMemo(
    () => ({
      readonly: false,
      toolbar: true,
      placeholder,
      height,
      theme: currentTheme,
      style: {
        backgroundColor: currentTheme === "dark" ? "#1f2937" : "#ffffff",
        color: currentTheme === "dark" ? "#f3f4f6" : "#1f2937",
      },
      toolbarAdaptive: false,
      showCharsCounter: true,
      showWordsCounter: true,
      showXPathInStatusbar: false,
      askBeforePasteHTML: false,
      askBeforePasteFromWord: false,
      buttons: [
        "source",
        "|",
        "bold",
        "italic",
        "underline",
        "|",
        "ul",
        "ol",
        "|",
        "outdent",
        "indent",
        "|",
        "font",
        "fontsize",
        "brush",
        "|",
        "link",
        "image",
        "table",
        "|",
        "align",
        "undo",
        "redo",
        "|",
        "fullsize",
      ],
      controls: {
        brush: {
          exec: (editor: any) => {
            const color = currentTheme === "dark" ? "#f3f4f6" : "#1f2937";
            editor.selection.style.color = color;
          },
        },
      },
    }),
    [placeholder, height, currentTheme]
  );

  const handleBlur = (newContent: string) => {
    setContent(newContent);
    onContentChange?.(newContent);
  };

  return (
    <div 
      className={`jodit-container ${currentTheme === "dark" ? "dark" : "light"}`}
      style={{ 
        width, 
        height,
        "--jodit-background-color": currentTheme === "dark" ? "#1f2937" : "#ffffff",
        "--jodit-text-color": currentTheme === "dark" ? "#f3f4f6" : "#1f2937",
        "--jodit-border-color": currentTheme === "dark" ? "#374151" : "#d1d5db",
        "--jodit-toolbar-bg": currentTheme === "dark" ? "#111827" : "#f9fafb",
      } as React.CSSProperties}
    >
      <style jsx>{`
        .jodit-container.dark .jodit-toolbar {
          background-color: var(--jodit-toolbar-bg) !important;
          border-color: var(--jodit-border-color) !important;
        }
        .jodit-container.dark .jodit-toolbar__button {
          color: var(--jodit-text-color) !important;
        }
        .jodit-container.dark .jodit-toolbar__button:hover {
          background-color: var(--jodit-border-color) !important;
        }
        .jodit-container.dark .jodit-wysiwyg {
          background-color: var(--jodit-background-color) !important;
          color: var(--jodit-text-color) !important;
        }
        .jodit-container.light .jodit-wysiwyg {
          background-color: var(--jodit-background-color) !important;
          color: var(--jodit-text-color) !important;
        }
        .jodit-container.dark .jodit-status-bar {
          background-color: var(--jodit-toolbar-bg) !important;
          border-color: var(--jodit-border-color) !important;
          color: var(--jodit-text-color) !important;
        }
      `}</style>
      <JoditEditor
        ref={editor}
        value={content}
        config={config}
        onBlur={handleBlur}
        onChange={() => {}}
      />
    </div>
  );
};

export default JoditEditorComponent;
