interface ShellPlaceholderProps {
  title: string;
}

export function ShellPlaceholder({ title }: ShellPlaceholderProps) {
  return (
    <div className="shell-placeholder" data-testid={`page-${title}`}>
      <h2>{title}</h2>
      <p className="shell-placeholder__text">功能开发中…</p>
    </div>
  );
}
