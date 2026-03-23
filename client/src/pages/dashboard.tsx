export default function DashboardPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Employee time tracking overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Active Employees", value: "6", change: "+1 this month" },
          { label: "Hours This Week", value: "240", change: "Across all staff" },
          { label: "Pending Timesheets", value: "3", change: "Awaiting approval" },
          { label: "Payroll Due", value: "$8,420", change: "Next Friday" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-gray-200 shadow-sm rounded-lg p-5">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{stat.value}</p>
            <p className="text-xs text-gray-400 mt-1">{stat.change}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Recent Activity</h2>
        <p className="text-sm text-gray-500">More dashboard content will appear here in future blocks.</p>
      </div>
    </div>
  );
}
