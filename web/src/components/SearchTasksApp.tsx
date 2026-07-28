import { useTaskWidgetPayload } from '../shared/bootstrap';

type TaskRow = NonNullable<ReturnType<typeof useTaskWidgetPayload>['rows']>[number];

export function SearchTasksApp() {
  const payload = useTaskWidgetPayload();

  return (
    <main className="widget-shell task-shell">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">Octoparse Tasks</p>
          <h1>Task Search Results</h1>
          <p className="lede">Scan task status and review task rows from the task list.</p>
        </div>
        <div className="hero-stat">
          <span>Total</span>
          <strong>{payload.pagination?.total ?? payload.rows?.length ?? 0}</strong>
        </div>
      </section>

      <section className="task-table-wrap">
        <table className="task-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Task Name</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(payload.rows ?? []).map((row, index) => (
              <tr key={row.taskId || row.taskName}>
                <td className="task-table__index">{index + 1}</td>
                <td>
                  <strong>{row.taskName || 'Untitled task'}</strong>
                  {row.taskDescription ? <p>{row.taskDescription}</p> : null}
                </td>
                <td>
                  <span className={`status-pill status-pill--${row.statusTone || 'unknown'}`}>
                    {row.taskStatusLabel || 'Unknown'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
