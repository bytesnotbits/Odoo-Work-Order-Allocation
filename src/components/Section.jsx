export default function Section({ title = 'Section', children, className = '' }) {
  return (
    <section className={`py-4 ${className}`}>
      <h2 className="text-lg font-bold mb-2">{title}</h2>
      {children}
    </section>
  );
}