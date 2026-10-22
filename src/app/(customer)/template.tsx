/** Re-mounts on every navigation inside the workspace, so each page eases in. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-rise">{children}</div>;
}
