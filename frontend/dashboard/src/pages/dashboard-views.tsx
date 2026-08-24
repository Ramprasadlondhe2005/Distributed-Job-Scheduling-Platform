import React from "react";
import { ApiKeyPanel, AuditPanel, DataPanel, DeadLetterPanel, FilterBar, HealthPanel, OverviewPanel, Pager, UserPanel, WorkerPanel } from "../components/index.js";
import { ApiKeyCreateForm, AuditFilterBar, JobCreateForm } from "../forms.js";
import type { DashboardView } from "../layouts/dashboard-shell.js";
import type {
  ApiKeyRow,
  AuditEvent,
  AuditFilters,
  AuthUser,
  CreatedApiKey,
  DeadLetterRow,
  DeadLetterSummary,
  ExecutionRow,
  JobRow,
  MetricsOverview,
  NewJobFormState,
  PageState,
  QueueRow,
  ServiceHealthMap,
  WorkerRow,
} from "../types.js";

type DashboardViewsProps = {
  activeView: DashboardView;
  auditEvents: AuditEvent[];
  auditFilters: AuditFilters;
  apiKeyName: string;
  apiKeys: ApiKeyRow[];
  authUser: AuthUser;
  createdApiKey: CreatedApiKey | null;
  deadLetterPage: PageState;
  deadLetterSummary: DeadLetterSummary;
  deadLetters: DeadLetterRow[];
  executionPage: PageState;
  executionStatusFilter: string;
  executions: ExecutionRow[];
  health: ServiceHealthMap;
  jobPage: PageState;
  jobStatusFilter: string;
  jobs: JobRow[];
  metrics: MetricsOverview;
  newJob: NewJobFormState;
  editingJobId: string | null;
  users: AuthUser[];
  workerPage: PageState;
  workers: WorkerRow[];
  queues: QueueRow[];
  onAuditFiltersChange: (filters: AuditFilters) => void;
  onApiKeyNameChange: (name: string) => void;
  onCreateJob: (event: React.FormEvent<HTMLFormElement>) => void;
  onCreateApiKey: (event: React.FormEvent<HTMLFormElement>) => void;
  onDeadLetterAction: (messageId: string, action: "requeue" | "discard") => void;
  onDeadLetterPageChange: (page: PageState) => void;
  onExecutionAction: (executionId: string, action: "cancel" | "retry") => void;
  onExecutionPageChange: (page: PageState) => void;
  onExecutionStatusFilterChange: (status: string) => void;
  onCancelJobEdit: () => void;
  onJobAction: (jobId: string, action: "run" | "pause" | "resume" | "edit" | "delete") => void;
  onJobChange: (job: NewJobFormState) => void;
  onJobPageChange: (page: PageState) => void;
  onJobStatusFilterChange: (status: string) => void;
  onRefreshAuditEvents: () => void;
  onRefreshExecutions: (page?: PageState) => void;
  onRefreshDeadLetters: (page?: PageState) => void;
  onRefreshJobs: (page?: PageState) => void;
  onRefreshWorkers: (page?: PageState) => void;
  onRecoverStalled: () => void;
  onRunScheduler: () => void;
  onRevokeApiKey: (apiKeyId: string) => void;
  onUserRoleChange: (userId: string, role: "ADMIN" | "VIEWER") => void;
  onWorkerPageChange: (page: PageState) => void;
  onQueueAction: (queueId: string, action: "pause" | "resume" | "edit") => void;
  onQueueUpdate: (queueId: string, data: { priority: number; concurrencyLimit: number }) => void;
};

export function DashboardViews(props: DashboardViewsProps) {
  const isAdmin = props.authUser.role === "ADMIN";
  const [editingQueueId, setEditingQueueId] = React.useState<string | null>(null);
  const [queueEditForm, setQueueEditForm] = React.useState({ priority: 0, concurrencyLimit: 5 });

  if (props.activeView === "queues") {
    const editingQueue = props.queues.find(q => q.id === editingQueueId);
    return (
      <section style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <h2 style={{ margin: 0 }}>Queue Management</h2>
        {editingQueue && (
          <div style={{ background: "var(--color-surface, #1e293b)", border: "1px solid var(--color-border, #334155)", borderRadius: "8px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <strong>Edit Queue: {editingQueue.name}</strong>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.875rem" }}>
              Priority (higher = dispatched first)
              <input type="number" min={0} max={100} value={queueEditForm.priority}
                onChange={e => setQueueEditForm(f => ({ ...f, priority: Number(e.target.value) }))}
                style={{ padding: "0.4rem", borderRadius: "4px", border: "1px solid #475569", background: "#0f172a", color: "inherit", width: "120px" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.875rem" }}>
              Concurrency Limit (max parallel executions)
              <input type="number" min={1} max={100} value={queueEditForm.concurrencyLimit}
                onChange={e => setQueueEditForm(f => ({ ...f, concurrencyLimit: Number(e.target.value) }))}
                style={{ padding: "0.4rem", borderRadius: "4px", border: "1px solid #475569", background: "#0f172a", color: "inherit", width: "120px" }} />
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button onClick={() => { props.onQueueUpdate(editingQueue.id, queueEditForm); setEditingQueueId(null); }}>Save</button>
              <button onClick={() => setEditingQueueId(null)}>Cancel</button>
            </div>
          </div>
        )}
        {props.queues.length === 0 && <p style={{ color: "#94a3b8" }}>No queues for the selected project. Select a project from the toolbar.</p>}
        {props.queues.map(queue => (
          <div key={queue.id} style={{ background: "var(--color-surface, #1e293b)", border: "1px solid var(--color-border, #334155)", borderRadius: "8px", padding: "1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <strong style={{ fontSize: "1rem" }}>{queue.name}</strong>
                <span style={{ fontSize: "0.75rem", padding: "0.15rem 0.6rem", borderRadius: "9999px", background: queue.status === "ACTIVE" ? "#16a34a22" : "#dc262622", color: queue.status === "ACTIVE" ? "#4ade80" : "#f87171", border: `1px solid ${queue.status === "ACTIVE" ? "#16a34a" : "#dc2626"}` }}>
                  {queue.status}
                </span>
              </div>
              <div style={{ fontSize: "0.8rem", color: "#94a3b8", display: "flex", gap: "1.5rem" }}>
                <span>Priority: <strong style={{ color: "#e2e8f0" }}>{queue.priority}</strong></span>
                <span>Concurrency: <strong style={{ color: "#e2e8f0" }}>{queue.concurrencyLimit}</strong></span>
                <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "#64748b" }}>{queue.id}</span>
              </div>
            </div>
            {isAdmin && (
              <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                <button onClick={() => { setQueueEditForm({ priority: queue.priority, concurrencyLimit: queue.concurrencyLimit }); setEditingQueueId(queue.id); }}>Edit Config</button>
                <button onClick={() => props.onQueueAction(queue.id, queue.status === "ACTIVE" ? "pause" : "resume")}>
                  {queue.status === "ACTIVE" ? "Pause" : "Resume"}
                </button>
              </div>
            )}
          </div>
        ))}
      </section>
    );
  }

  if (props.activeView === "overview") {
    return <OverviewPanel canMutate={isAdmin} metrics={props.metrics} onRecoverStalled={props.onRecoverStalled} onRunScheduler={props.onRunScheduler} />;
  }

  if (props.activeView === "jobs") {
    return (
      <>
        {isAdmin && <JobCreateForm job={props.newJob} mode={props.editingJobId ? "edit" : "create"} onCancel={props.onCancelJobEdit} onChange={props.onJobChange} onSubmit={props.onCreateJob} />}
        <FilterBar
          label="Job status"
          value={props.jobStatusFilter}
          options={["ACTIVE", "PAUSED", "DELETED"]}
          onChange={props.onJobStatusFilterChange}
          onApply={() => {
            const nextPage = { ...props.jobPage, offset: 0 };
            props.onJobPageChange(nextPage);
            props.onRefreshJobs(nextPage);
          }}
        />
        <DataPanel title="Jobs" rows={props.jobs} emptyText="No jobs loaded" onJobAction={isAdmin ? props.onJobAction : undefined} />
        <Pager page={props.jobPage} onChange={props.onJobPageChange} onApply={props.onRefreshJobs} />
      </>
    );
  }

  if (props.activeView === "executions") {
    return (
      <>
        <FilterBar
          label="Execution status"
          value={props.executionStatusFilter}
          options={["PENDING", "QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "RETRY_SCHEDULED", "STALLED", "CANCELED"]}
          onChange={props.onExecutionStatusFilterChange}
          onApply={() => {
            const nextPage = { ...props.executionPage, offset: 0 };
            props.onExecutionPageChange(nextPage);
            props.onRefreshExecutions(nextPage);
          }}
        />
        <DataPanel title="Executions" rows={props.executions} emptyText="No executions loaded" expandableAttempts onExecutionAction={isAdmin ? props.onExecutionAction : undefined} />
        <Pager page={props.executionPage} onChange={props.onExecutionPageChange} onApply={props.onRefreshExecutions} />
      </>
    );
  }

  if (props.activeView === "workers") {
    return (
      <>
        <WorkerPanel rows={props.workers} />
        <Pager page={props.workerPage} onChange={props.onWorkerPageChange} onApply={props.onRefreshWorkers} />
      </>
    );
  }

  if (props.activeView === "deadLetter") {
    return (
      <>
        <DeadLetterPanel
          rows={props.deadLetters}
          summary={props.deadLetterSummary}
          onDiscard={(messageId) => props.onDeadLetterAction(messageId, "discard")}
          onRequeue={(messageId) => props.onDeadLetterAction(messageId, "requeue")}
        />
        <Pager page={props.deadLetterPage} onChange={props.onDeadLetterPageChange} onApply={props.onRefreshDeadLetters} />
      </>
    );
  }

  if (props.activeView === "users") {
    return <UserPanel currentUserId={props.authUser.id} rows={props.users} onRoleChange={props.onUserRoleChange} />;
  }

  if (props.activeView === "apiKeys") {
    return (
      <>
        <ApiKeyCreateForm name={props.apiKeyName} onChange={props.onApiKeyNameChange} onSubmit={props.onCreateApiKey} />
        <ApiKeyPanel rows={props.apiKeys} createdKey={props.createdApiKey} onRevoke={props.onRevokeApiKey} />
      </>
    );
  }

  if (props.activeView === "audit") {
    return (
      <>
        <AuditFilterBar filters={props.auditFilters} onChange={props.onAuditFiltersChange} onApply={props.onRefreshAuditEvents} />
        <AuditPanel rows={props.auditEvents} />
      </>
    );
  }

  return <HealthPanel health={props.health} />;
}
