export default function WOView({ children, className = '' }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {children ?? <div className="text-sm text-gray-500">WOView content…</div>}
    </div>
  );
}