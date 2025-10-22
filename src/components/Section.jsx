export default function Section({ title, children, icon: Icon }) {
  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="w-4 h-4" />}
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="bg-white rounded-2xl shadow p-4 border border-gray-100">{children}</div>
    </section>
  );
}