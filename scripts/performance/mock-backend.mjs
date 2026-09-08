/**
 * BACKEND SIMULADO PARA LA AUDITORÍA DE PERFORMANCE.
 *
 * No sustituye a producción ni pretende medir su latencia: existe para CONTAR
 * con exactitud cuántas llamadas hace el frontend, en qué orden, y cuáles
 * repite. Esa es la métrica que decide TanStack Query, y es idéntica sea cual
 * sea el servidor que responda.
 *
 * El dataset imita la forma real de producción (93 casos: 90 firmados, 1 por
 * revisar, 2 retenidos) pero es SINTÉTICO: ni un dato de una persona real.
 *
 * LATENCIA_MS simula el coste por salto para que los waterfalls se vean.
 */
import { createServer } from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";

const PORT = Number(process.env.MOCK_PORT ?? 4000);
const LAT = Number(process.env.LATENCIA_MS ?? 0);
const LOG = process.env.MOCK_LOG ?? "./mock-trafico.jsonl";
writeFileSync(LOG, "");

let seq = 0;
const T0 = Date.now();

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CLASIF = (i) => (i === 0 ? "PENDING_REVIEW" : i <= 2 ? "HOLD" : "SIGNED");

const CASOS = Array.from({ length: 93 }, (_, i) => {
  const c = CLASIF(i);
  const conInforme = c !== "HOLD" || i === 1;
  return {
    caseId: uuid(i + 1),
    externalCaseId: String(32000000 + i * 137),
    classification: c,
    hold: c === "HOLD" ? { active: true, statement: "Retenido por incidencia administrativa.", reason: "DUPLICATE_SOURCE_DOCUMENT" } : null,
    sourceDocument: { downloadUrl: `/api/v1/cases/${uuid(i + 1)}/source-document` },
    status: c === "HOLD" && !conInforme ? "ANALYSIS_FAILED" : "ANALYZED",
    statusChangedAt: "2026-09-01T10:00:00.000Z",
    discoveredAt: "2026-08-28T19:41:32.000Z",
    failureClass: c === "HOLD" && !conInforme ? "TRANSIENT" : null,
    analysisAttempts: 1,
    batch: { id: uuid(900), name: "Semana 8", sequence: 8 },
    assignment: { doctorProfileId: uuid(801), fullName: "Profesional Sintético", professionalCode: "SIS-0001", assignedAt: "2026-09-01T10:00:00.000Z", assignmentRunId: uuid(700) },
    report: conInforme ? { reportId: uuid(2000 + i), version: 2, workflowStatus: c === "SIGNED" ? "SIGNED" : "READY_FOR_REVIEW", readinessStatus: "READY", orientationAssessment: "RECOVERABLE", signedAt: c === "SIGNED" ? "2026-09-06T13:10:00.000Z" : null } : null,
  };
});

const CLASIF_COUNTS = { UNASSIGNED: 0, NO_REPORT: 1, PENDING_REVIEW: 1, HOLD: 2, CHANGES_REQUESTED: 0, SIGNING: 0, SIGNING_FAILED: 0, SIGNED: 89 };
const BATCH = { id: uuid(900), name: "Semana 8", normalizedName: "semana-8", sequence: 8, status: "OPEN", source: "INGESTION", createdAt: "2026-08-28T19:00:00.000Z", closedAt: null };
const SUMMARY = { totalCases: 93, unassignedCases: 0, assignedCases: 93, processingCases: 0, errorCases: 2, casesWithoutReport: 1, classification: CLASIF_COUNTS };
const DOCTORS = [1, 2].map((n) => ({ doctorProfileId: uuid(800 + n), fullName: `Profesional Sintético ${n}`, professionalCode: `SIS-000${n}`, status: "ACTIVE", assignable: true, assignedCases: n === 1 ? 93 : 0, classification: n === 1 ? CLASIF_COUNTS : { ...CLASIF_COUNTS, SIGNED: 0, HOLD: 0, PENDING_REVIEW: 0, NO_REPORT: 0 } }));

/** Un informe completo: ~8,5 KB de documento, como el p50 de producción. */
const parrafo = "El expediente aporta antecedentes suficientes para fundar la conclusión que se propone. ".repeat(6);
const INFORME = (caseId) => ({
  id: uuid(2000), caseReference: "32000000", version: 2, workflowStatus: "READY_FOR_REVIEW",
  createdAt: "2026-09-06T13:07:26.774Z",
  document: {
    documentKind: "PRE_REPORT",
    branding: { documentTitle: "Informe de evaluación", institutionalHeading: "COMPIN", institutionalSubheading: "Subcomisión", footerText: "Documento de prueba" },
    caseReference: "32000000",
    sections: ["I","II","III","IV","V"].map((id) => ({ id, title: `Sección ${id}`,
      fields: Array.from({ length: 8 }, (_, k) => ({ label: `Campo ${k}`, value: "Valor de ejemplo sintético" })),
      paragraphs: [parrafo, parrafo] })),
    proposal: { options: [{ label: "Recuperable", checked: true }, { label: "Irrecuperable", checked: false }], note: null },
    draftNotice: null,
  },
  proposal: { recoverableChecked: true, irrecoverableChecked: false, unresolvedNote: null },
  readiness: { status: "READY", blockers: [] },
  thresholdStatus: "MET",
  hold: null,
  sourceDocument: { downloadUrl: `/api/v1/cases/${caseId}/source-document` },
  reviews: [],
  finalArtifact: null,
  capabilities: { canRequestChanges: true, canApprove: true, canResolveAndApprove: false, hasActiveSignature: true, canDownloadSigned: false },
  licenses: [],
});

const RUTAS = {
  "/api/v1/auth/me": () => ({ userId: uuid(1), email: "sintetico@example.invalid", displayName: "Usuario Sintético", roles: [process.env.MOCK_ROL === "admin" ? "ADMIN" : "DOCTOR"], tenant: { contractId: uuid(10), contractName: "Contrato de prueba" }, doctorProfile: { id: uuid(801) } }),
  "/api/v1/inbox": () => ({ cases: CASOS, total: CASOS.length }),
  "/api/v1/admin/cases": () => ({ cases: CASOS, total: CASOS.length }),
  "/api/v1/admin/batches": () => ({ batches: [{ batch: BATCH, summary: SUMMARY }], total: 1 }),
  "/api/v1/admin/doctor-workload": () => ({ doctors: DOCTORS }),
  "/api/v1/admin/holds": () => ({ holds: CASOS.filter((c) => c.classification === "HOLD").map((c, i) => ({ holdId: uuid(500 + i), caseId: c.caseId, externalCaseId: c.externalCaseId, hold: c.hold, detail: "Mismo contenido que otro expediente del lote.", createdAt: "2026-09-07T12:17:45.000Z", doctor: { doctorProfileId: uuid(801), fullName: "Profesional Sintético 1" }, report: c.report, processing: { caseStatus: c.status, failureClass: c.failureClass, attempts: 5, lastRun: { runId: uuid(600), trigger: "INITIAL_ANALYSIS", status: "FAILED_TECHNICAL", errorCode: "PROVIDER_TRANSIENT", errorMessage: "AIProviderError", createdAt: "2026-09-04T19:56:03.000Z", finishedAt: null } }, sourceDocument: c.sourceDocument, duplicates: [], classificationIfResolved: c.report ? "PENDING_REVIEW" : "NO_REPORT" })), total: 2 }),
  "/api/v1/admin/users": () => ({ users: [1, 2, 3, 4].map((n) => ({ id: uuid(n), email: `u${n}@example.invalid`, displayName: `Usuario ${n}`, roles: ["DOCTOR"], status: "ACTIVE", doctor: null })), total: 4 }),
  "/api/v1/admin/doctors": () => ({ doctors: DOCTORS.map((d) => ({ id: d.doctorProfileId, fullName: d.fullName, professionalCode: d.professionalCode, status: d.status })), total: 2 }),
  "/api/v1/reports": () => ({ reports: CASOS.filter((c) => c.report).map((c) => ({ reportId: c.report.reportId, caseId: c.caseId, externalCaseId: c.externalCaseId, version: 2, createdAt: "2026-09-06T13:07:26.774Z", batch: c.batch, doctor: { doctorProfileId: uuid(801), fullName: "Profesional Sintético 1", professionalCode: "SIS-0001" }, workflowStatus: c.report.workflowStatus, readinessStatus: "READY", orientationAssessment: "RECOVERABLE", signedAt: c.report.signedAt })), total: 92, countsByWorkflowStatus: { SIGNED: 89, READY_FOR_REVIEW: 3 } }),
  "/api/v1/exports": () => ({ exports: [], total: 0 }),
  "/api/v1/doctors/me/signature": () => ({ hasSignature: false, updatedAt: null }),
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const t = Date.now();
  const n = ++seq;
  appendFileSync(LOG, JSON.stringify({ seq: n, tMs: t - T0, method: req.method, path: url.pathname, query: url.search, origen: req.headers["accept-encoding"] === "identity" ? "proxy(navegador)" : "servidor-next(middleware+guard)",
    ua: (req.headers["user-agent"] ?? "-").slice(0, 30) }) + "\n");

  if (LAT) await new Promise((r) => setTimeout(r, LAT));

  if (req.method === "POST" && url.pathname === "/api/v1/auth/login") {
    res.writeHead(200, { "content-type": "application/json",
      "set-cookie": ["sir_session=sesion-sintetica; Path=/; HttpOnly; SameSite=Lax", "sir_csrf=csrf-sintetico; Path=/; SameSite=Lax"] });
    return res.end(JSON.stringify({ ok: true }));
  }
  if (req.method === "POST" && url.pathname === "/api/v1/auth/logout") {
    res.writeHead(200, { "content-type": "application/json",
      "set-cookie": ["sir_session=; Path=/; Max-Age=0", "sir_csrf=; Path=/; Max-Age=0"] });
    return res.end(JSON.stringify({ ok: true }));
  }

  // /auth/me sin cookie = 401, como el backend real.
  if (url.pathname === "/api/v1/auth/me" && !(req.headers.cookie ?? "").includes("sir_session=sesion-sintetica")) {
    res.writeHead(401, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "Sin sesión." } }));
  }

  const m = url.pathname.match(/^\/api\/v1\/cases\/([^/]+)\/report$/);
  if (m) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(INFORME(m[1]))); }

  const h = RUTAS[url.pathname];
  if (h) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(h())); }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: `No existe ${url.pathname}` } }));
}).listen(PORT, () => console.log(`mock backend :${PORT} (latencia ${LAT}ms, log ${LOG})`));
