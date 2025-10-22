export default function Badge({ children, className = "" }) {
  return (
    <span className={`text-xs px-2 py-1 rounded-full bg-gray-100 border border-gray-200 ${className}`}>
      {children}
    </span>
  );
}