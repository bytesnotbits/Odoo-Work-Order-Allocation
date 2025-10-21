export default function ProductCard({ title = 'Product', children, className = '' }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${className}`}>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="text-sm text-gray-600">{children ?? 'Details…'}</div>
    </div>
  );
}