import { useState, useRef, useEffect, type ReactNode } from "react";

interface BaseProps {
  value: string;
  onSave: (value: string) => void;
  children: ReactNode;
  className?: string;
  placeholder?: string;
}

interface InputEdit extends BaseProps {
  as?: "input";
  options?: never;
}

interface TextareaEdit extends BaseProps {
  as: "textarea";
  options?: never;
  rows?: number;
}

interface SelectEdit extends BaseProps {
  as: "select";
  options: Array<{ value: string; label: string }>;
}

type Props = InputEdit | TextareaEdit | SelectEdit;

export function InlineEdit(props: Props) {
  const { value, onSave, children, className, placeholder } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if ("select" in inputRef.current) inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && props.as !== "textarea") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
  };

  if (!editing) {
    return (
      <span
        className={`inline-edit-display ${className ?? ""}`}
        onClick={() => setEditing(true)}
        title="点击编辑"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") setEditing(true); }}
      >
        {value ? children : <span className="inline-edit-placeholder">{placeholder ?? "（空）"}</span>}
      </span>
    );
  }

  if (props.as === "textarea") {
    return (
      <textarea
        ref={inputRef as React.Ref<HTMLTextAreaElement>}
        className="inline-edit-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        rows={props.rows ?? 3}
      />
    );
  }

  if (props.as === "select") {
    return (
      <select
        ref={inputRef as React.Ref<HTMLSelectElement>}
        className="inline-edit-input"
        value={draft}
        onChange={(e) => { setDraft(e.target.value); }}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      >
        {props.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      ref={inputRef as React.Ref<HTMLInputElement>}
      className="inline-edit-input"
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  );
}
