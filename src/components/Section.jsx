export default function Section({ title, subtitle, children, icon: Icon }) {
  return (
    <section className="mb-6">
      <div className="flex items-start gap-2 mb-3">
        {Icon && <Icon className="w-5 h-5 text-slate-500 mt-[0.2rem]" />}
        <div>
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
          {subtitle && (
            <p className="text-sm text-slate-600 mt-1 leading-snug max-w-3xl">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow p-4 border border-gray-100">{children}</div>
    </section>
  );
}
