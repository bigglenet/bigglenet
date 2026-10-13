// "Report…": flag a site, message, post, comment, note or person for admins (server/src/moderation.ts).
// Anything can ask; the browser's own dialog (ReportDialog.svelte) asks why and sends it.
export type ReportKind = 'site' | 'message' | 'post' | 'comment' | 'note' | 'user';

class Report {
  request = $state<{ kind: ReportKind; target: string; label: string } | null>(null);
  open(kind: ReportKind, target: string | number, label: string) {
    this.request = { kind, target: String(target), label };
  }
  close() {
    this.request = null;
  }
}

export const report = new Report();
