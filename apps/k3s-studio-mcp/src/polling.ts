import { http } from "./client.js";

interface JobResult {
  success: boolean;
  log: string;
}

export async function waitForJob(
  jobId: string,
  timeoutMs = 600_000
): Promise<JobResult> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await http.get(`/api/jobs/${jobId}`);
    if (data.status === "SUCCESS") return { success: true, log: data.log ?? "" };
    if (data.status === "FAILED") return { success: false, log: data.log ?? "" };
    await sleep(3_000);
  }
  throw new Error(`Job ${jobId} timed out after ${timeoutMs / 1000}s`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
