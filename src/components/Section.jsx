export default function Section({ title, subtitle, children, icon: Icon, variant }) {
  const variantStyles = {
    engineering: {
      heading: "text-blue-900",
      subtitle: "text-sm text-blue-700",
      icon: "text-blue-500",
      body: "rounded-2xl shadow p-4 border bg-blue-50 border-blue-200 shadow-md",
    },
    accounting: {
      heading: "text-rose-900",
      subtitle: "text-sm text-rose-700",
      icon: "text-rose-500",
      body: "rounded-2xl shadow p-4 border bg-rose-50 border-rose-200 shadow-md",
    },
    default: {
      heading: "text-slate-900",
      subtitle: "text-sm text-slate-600",
      icon: "text-slate-500",
      body: "rounded-2xl shadow p-4 border bg-white border-gray-100",
    },
  };
  const styles = variantStyles[variant] || variantStyles.default;

  return (
    <section className="mb-6">
      <div className="flex items-start gap-2 mb-3">
        {Icon && <Icon className={`w-5 h-5 mt-[0.2rem] ${styles.icon}`} />}
        <div>
          <h2 className={`text-xl md:text-2xl font-semibold tracking-tight ${styles.heading}`}>{title}</h2>
          {subtitle && (
            <p className={`${styles.subtitle} mt-1 leading-snug max-w-3xl`}>{subtitle}</p>
          )}
        </div>
      </div>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
