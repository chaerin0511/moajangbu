export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-7 w-40 bg-slate-200 rounded" />
      <div className="card p-6 h-32 bg-slate-50" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1,2,3,4].map(i => <div key={i} className="card p-5 h-24 bg-slate-50" />)}
      </div>
      <div className="card p-5 h-48 bg-slate-50" />
      <div className="card p-5 h-64 bg-slate-50" />
    </div>
  );
}
