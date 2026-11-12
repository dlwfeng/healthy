// A scheduled task supplies dates, not a preselected health dataset.
export async function createReportInput({ run }) {
  const { kind, period_start, period_end_exclusive, timezone } = run;
  return { report: { kind, period_start, period_end_exclusive, timezone, as_of: new Date().toISOString() },
    data_mode: "raw_tools_v1", has_data: true, evidence: {}, tool_results: [], coverage: [] };
}
