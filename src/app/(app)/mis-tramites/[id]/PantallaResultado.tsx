"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCaseReport, useDoctorInbox, useInvalidar } from "@/lib/queries";
import { queryKeys } from "@/lib/query-keys";
import { FichaSkeleton, Refrescando } from "@/components/Skeleton";
import {
  EditorInforme,
  borradorInicial,
  camposModificados,
  cuerpoDeCorreccion,
  exigeMotivo,
  type Borrador,
  type FormularioInforme,
} from "./EditorInforme";
import { api, ApiFallo } from "@/lib/api";
import {
  type DocumentoInforme,
  type ManualForm,
  type OperationalCase,
  type ReportWorkflowStatus,
} from "@/lib/backend";
import {
  censarLicencias,
  diasLicencia,
  etiquetaEstadoSingular,
  periodoLicencia,
  type LicenciaBackend,
} from "@/lib/licencias";

// GET  /api/v1/cases/:caseId/report      → preinforme + capacidades.
// POST /api/v1/reports/:reportId/approve  {comments?}  → RATIFICAR (usa la firma cargada del médico)
// POST /api/v1/reports/:reportId/reviews  {comments}   → MODIFICAR: nueva redacción de IV y V
//
// El backend no permite reescribir el informe en sitio (ReportSnapshot es inmutable):
// "Modificar" manda la nueva conclusión (IV) y propuesta (V) como corrección.
//
// LO QUE VE EL MÉDICO SALE DE `report.document` Y DE NADA MÁS.
//
// La respuesta trae también `sections`: el VOLCADO INTERNO del snapshot, con
// los códigos de razón, los estados de política y los guardarraíles que existen
// para la administración, la auditoría y el QA. Esta pantalla lo renderizó
// durante un tiempo, y el médico llegó a leer, sobre expedientes reales:
//
//   · «Criterio de período: Confirmado por el cliente» (`CLIENT_CONFIRMED`);
//   · «[REC-2] …», «[NOR-3] …» — códigos de indicador;
//   · «Verificar que la falta de evidencia…», «La adherencia al tratamiento…»
//     — guía dirigida a quien revisa, no al expediente;
//   · «Ninguna cantidad de indicadores reemplaza el juicio profesional»
//     — un guardarraíl del motor.
//
// Nada de eso significa nada para quien firma, y su sitio no es la pantalla de
// quien firma. `document` es la proyección que el backend compone con
// `buildClientReport` — la MISMA que imprime el .docx y el PDF— y viene limpia
// de origen. Por eso `sections` NI SIQUIERA ESTÁ DECLARADO en `Report`: no se
// puede volver a pintar por descuido lo que el tipo no conoce.
//
// De la respuesta se siguen usando, aparte del documento, sólo los metadatos
// que la interfaz necesita para actuar: versión, workflow, readiness,
// capacidades, historial, descargas y el detalle de licencias.

interface Review {
  id: string;
  decision: "APPROVED" | "CHANGES_REQUESTED";
  comments: string | null;
  createdAt: string;
}
interface Report {
  id: string;
  caseReference: string;
  version: number;
  createdAt: string;
  workflowStatus: ReportWorkflowStatus;
  // El documento entregable, ya compuesto por el backend. Es lo ÚNICO que se
  // muestra. Ver `DocumentoInforme` en src/lib/backend.ts.
  document: DocumentoInforme;
  proposal: { recoverableChecked: boolean; irrecoverableChecked: boolean; unresolvedNote: string | null };
  readiness: { status: "READY" | "NOT_READY"; blockers: { code: string; statement: string }[] };
  /**
   * Estado del umbral contractual, ya calculado por el backend. `null` en
   * snapshots congelados antes de que la cifra existiera.
   *
   * No se deduce del recuento de `countsForThreshold`: un cero significa a la
   * vez «no alcanza» y «no se puede determinar», y son cosas distintas para
   * quien firma.
   */
  thresholdStatus: "MET" | "NOT_MET" | "INDETERMINATE" | null;
  /**
   * Retención operacional activa. `null` casi siempre.
   *
   * El backend ya cierra las dos capacidades cuando viene, así que los botones
   * desaparecen solos; esto existe para DECIRLO en vez de dejar la ficha muda.
   * `statement` llega redactado y sin códigos: el motivo interno no viaja al
   * médico.
   */
  hold: { active: true; statement: string } | null;
  /**
   * EL EXPEDIENTE ORIGINAL. La URL la compone el backend: la pantalla no decide
   * cuál de los documentos del caso es el expediente ni cómo se llega a él.
   * `null` cuando el caso no tiene uno almacenado.
   */
  sourceDocument: { downloadUrl: string } | null;
  reviews: Review[];
  /**
   * El informe FIRMADO. `draftArtifact` sigue existiendo en la respuesta —el
   * backend lo conserva para operaciones y auditoría— pero esta pantalla no lo
   * declara: el preinforme se lee aquí mismo, y un tipo que no lo conoce no lo
   * puede volver a ofrecer por descuido.
   */
  finalArtifact: { downloadUrl: string } | null;
  /**
   * `canApprove` — este informe se ratifica tal como está.
   * `canResolveAndApprove` — hay que completar la evaluación y la conclusión
   *   antes de ratificarlo. Nunca las dos a la vez; para el médico son el MISMO
   *   botón. Ver `approval-eligibility.ts` en el backend.
   */
  capabilities: {
    canRequestChanges: boolean;
    canApprove: boolean;
    canResolveAndApprove: boolean;
    hasActiveSignature: boolean;
    /** El documento final está emitido y esta sesión puede descargarlo. */
    canDownloadSigned: boolean;
  };
  licenses: LicenciaBackend[];
}

type Evaluacion = "RECOVERABLE" | "IRRECOVERABLE";

const ESTADO: Record<ReportWorkflowStatus, { texto: string; chip: string; aviso?: { tono: "info" | "ok" | "obs" | "mal"; texto: string } }> = {
  READY_FOR_REVIEW: {
    texto: "Por revisar",
    chip: "bg-blue-50 text-[var(--atm-azul)]",
  },
  // Sin aviso: el chip ya lo dice, y el historial de abajo trae el motivo.
  CHANGES_REQUESTED: {
    texto: "Devuelto",
    chip: "bg-amber-50 text-[var(--atm-obs)]",
  },
  APPROVED: {
    texto: "Ratificado",
    chip: "bg-green-50 text-[var(--atm-ok)]",
    aviso: { tono: "ok", texto: "Ya ratificaste este informe." },
  },
  SIGNING: {
    texto: "Ratificado",
    chip: "bg-green-50 text-[var(--atm-ok)]",
    aviso: { tono: "info", texto: "El documento firmado se está generando. Vuelve a entrar en unos segundos." },
  },
  SIGNED: {
    texto: "Ratificado",
    chip: "bg-green-50 text-[var(--atm-ok)]",
    aviso: { tono: "ok", texto: "Informe firmado. El documento final está disponible para descargar." },
  },
  SIGNING_FAILED: {
    texto: "Devuelto",
    chip: "bg-red-50 text-[var(--atm-mal)]",
    aviso: { tono: "mal", texto: "No se pudo generar el documento firmado. Avisa al administrador para reintentarlo." },
  },
};

const TONO: Record<string, string> = {
  info: "border-[var(--atm-azul2)] bg-blue-50 text-[var(--atm-azul)]",
  ok: "border-green-300 bg-green-50 text-[var(--atm-ok)]",
  obs: "border-amber-300 bg-amber-50 text-[var(--atm-obs)]",
  mal: "border-red-300 bg-red-50 text-[var(--atm-mal)]",
};

/**
 * LAS SECCIONES QUE EL MÉDICO PUEDE TOCAR.
 *
 * La I —identificación— NUNCA: quién es la persona no es materia de criterio
 * clínico, y abrirla convierte un error de lectura en el expediente de otra
 * persona. La II se completa con lo que el sistema no pudo establecer; la III y
 * la IV se escriben; la V se elige.
 */
const EDITABLES = new Set(["II", "III", "IV", "V"]);

const fecha = (s: string) => new Date(s).toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });

/**
 * El respaldo para un expediente sin informe sale de la MISMA bandeja que ya
 * tiene el médico en pantalla, no de una petición propia.
 *
 * Antes esto pedía `/inbox` otra vez —82,5 KB— sólo para averiguar el número de
 * trámite de un caso retenido. Ahora es un `select` sobre la consulta
 * compartida: si la bandeja está fresca, cuesta cero.
 */
function seleccionarCaso(caseId: string) {
  return (cases: OperationalCase[]) => cases.find((c) => c.caseId === caseId) ?? null;
}

/**
 * LA FICHA DE UN EXPEDIENTE SIN INFORME.
 *
 * No inventa un preinforme ni finge una ficha clínica: dice lo poco que se sabe
 * —cuál es el trámite, que está retenido, y por qué no se puede actuar— y
 * ofrece lo único accionable, que son los antecedentes originales.
 *
 * Sin banners sobre lo que el sistema no pudo hacer: el motivo administrativo lo
 * redacta el backend y es lo que se muestra.
 */
function VistaMinima({ caso }: { caso: OperationalCase }) {
  const retenido = caso.classification === "HOLD";
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--atm-linea)] bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Trámite {caso.externalCaseId}</h3>
            <p className="mt-0.5 text-xs text-zinc-500">Este expediente todavía no tiene informe.</p>
          </div>
          {retenido && (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-[var(--atm-obs)]">
              Retenido
            </span>
          )}
        </div>
        {caso.sourceDocument && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--atm-linea)] pt-3">
            <a
              href={`/api/v1${caso.sourceDocument.downloadUrl.replace(/^\/api\/v1/, "")}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[var(--atm-linea)] px-3 py-1.5 text-xs font-medium text-[var(--atm-azul)] hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--atm-azul2)] focus-visible:ring-offset-2"
            >
              Ver antecedentes
            </a>
          </div>
        )}
      </div>

      {caso.hold && (
        <p className={`rounded-lg border px-4 py-3 text-sm font-medium ${TONO.obs}`}>
          {caso.hold.statement}
        </p>
      )}
    </div>
  );
}

export function PantallaResultado({ caseId }: { caseId: string }) {
  /**
   * `/cases/:caseId/report` devuelve SIEMPRE el snapshot vigente del caso (el
   * más reciente sin `supersededAt`); la pantalla no elige versión ni ordena
   * artefactos por su cuenta.
   *
   * Cacheado por `caseId`, y con `staleTime: 0`: volver a un expediente que se
   * acaba de mirar lo pinta entero al instante, y aun así se revalida por
   * detrás. Es un documento que se va a firmar; nadie debe ratificar una
   * versión superada porque la caché dijera que todavía valía.
   */
  const informe = useCaseReport<Report>(caseId);
  const { refetch: refetchInforme } = informe;
  const rep = informe.data ?? null;
  const invalidar = useInvalidar();
  const qc = useQueryClient();

  /**
   * UN EXPEDIENTE PUEDE NO TENER INFORME Y AUN ASÍ SER SUYO.
   *
   * Dos de los retenidos en producción fallaron el análisis y no tienen ningún
   * `ReportSnapshot`: pedir su informe responde 404. Antes eso era una pantalla
   * de error, y como además no aparecían en la bandeja, el médico no tenía forma
   * de saber que existían.
   *
   * El respaldo sale de su propia bandeja —el único listado que le pertenece—,
   * y de la MISMA consulta que ya alimenta la pantalla anterior: si viene de
   * ahí, no cuesta ninguna petición.
   */
  const sinInforme = informe.error instanceof ApiFallo && informe.error.status === 404;
  const enBandeja = useDoctorInbox(seleccionarCaso(caseId), { enabled: sinInforme }).data;
  /**
   * `enabled: false` NO impide leer lo que ya hay en caché: si la bandeja se
   * cargó en la pantalla anterior —que es lo normal—, esta consulta devuelve el
   * expediente igualmente. Sin esta condición, la vista mínima ganaba sobre el
   * informe y un expediente CON informe se mostraba como si no lo tuviera.
   */
  const minima = sinInforme ? (enBandeja ?? null) : null;

  const error = (() => {
    if (!informe.error) return null;
    if (sinInforme && minima) return null; // lo resuelve la vista mínima
    const e = informe.error;
    if (!(e instanceof ApiFallo)) return "No se pudo cargar el caso.";
    if (e.status === 404) return "Este caso todavía no tiene preinforme: aún no se ha procesado.";
    if (e.status === 403) return "Este caso no está asignado a ti.";
    return e.message;
  })();

  const [modo, setModo] = useState<"ver" | "modificar" | "resolver">("ver");

  /**
   * SIN VALOR POR DEFECTO. Un radio premarcado convierte «no elegí» en «elegí
   * esto», y lo que se está eligiendo es el pronunciamiento que se firma. Sólo
   * se precarga cuando el informe YA trae una casilla que el médico corrige.
   */


  /**
   * EL FORMULARIO LO DESCRIBE EL BACKEND. Qué cifras se ofrecen y cuáles no
   * pudo establecer el sistema sale de `/manual-form`, no de una lista escrita
   * aquí: el informe y el formulario tienen que hablar de los mismos campos.
   */
  const [form, setForm] = useState<FormularioInforme | null>(null);
  /**
   * TODO LO QUE EL MÉDICO LLEVA ESCRITO, en un solo sitio.
   *
   * Antes eran cinco estados sueltos —conclusión, evaluación, análisis, cifras,
   * nota— y cada campo nuevo del formulario habría sido un sexto. Ahora el
   * formulario lo describe el servidor y el borrador es un mapa por clave: se
   * amplía el contrato y esta pantalla no cambia.
   */
  const [borrador, setBorrador] = useState<Borrador>({ valores: {}, motivo: "", nota: "" });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);

  /** Vuelve a pedir el informe y devuelve el vigente. Lo usan las dos mutaciones. */
  const cargar = useCallback(async (): Promise<Report | null> => {
    const { data } = await refetchInforme();
    return data ?? null;
  }, [refetchInforme]);

  /**
   * Abre el formulario, tanto para corregir un informe como para completar uno
   * que no propone nada. Los dos editan lo MISMO —la Sección IV y la casilla de
   * la V— y por eso comparten pantalla: lo que cambia es qué hace el botón de
   * confirmar, no lo que el médico rellena.
   */
  async function abrirFormulario(destino: "modificar" | "resolver") {
    if (!rep) return;
    // Se pide el formulario ANTES de abrirlo: sin él no se sabe qué cifras
    // ofrecer ni cuáles el sistema no pudo establecer.
    try {
      // `query()` y no `fetchQuery()`: la segunda está obsoleta desde la 5.102
      // y desaparece en la 6. Misma implementación, mismo rechazo en caso de
      // error —que es lo que recoge el `catch` de abajo—.
      const f = await qc.query({
        queryKey: queryKeys.cases.manualForm(rep.id),
        queryFn: () => api<FormularioInforme>(`/reports/${rep.id}/manual-form`),
        staleTime: 0,
      });
      setForm(f);
      setBorrador(borradorInicial(f));
    } catch {
      setForm(null);
      setBorrador({ valores: {}, motivo: "", nota: "" });
    }
    /**
     * QUÉ SE PRECARGA LO DECIDE EL SERVIDOR, y ya viene resuelto en el
     * formulario: la conclusión que se entrega, las cifras, la narrativa. Esta
     * pantalla no vuelve a elegirlo.
     *
     * La casilla de la Sección V llega VACÍA cuando el médico no se ha
     * pronunciado, incluso si el motor concluyó: un control premarcado convierte
     * «no elegí» en «elegí esto». Lo que propuso el sistema se enseña al lado.
     * Y la nota empieza vacía porque es suya.
     */
    setMsg(null);
    setModo(destino);
  }

  async function enviarModificacion() {
    // El servidor valida igual; esto evita mandarle lo que va a rechazar.
    if (!rep || !cuerpoListo || faltaMotivo) return;
    setBusy(true);
    setMsg(null);
    /**
     * LA CORRECCIÓN VA EN CAMPOS, NO EN EL COMENTARIO.
     *
     * Esto serializaba antes la decisión dentro de `comments` —"V. PROPUESTA DE
     * EVALUACIÓN:\nSalud irrecuperable"— y el backend no la leía: ratificar
     * aprobaba el informe original. Dos expedientes se firmaron diciendo lo
     * contrario de lo que su médico había decidido. Ahora `correction` viaja
     * estructurada y el servidor produce con ella la versión siguiente.
     */
    try {
      const r = await api<{ newReportSnapshotId?: string; newVersion?: number }>(
        `/reports/${rep.id}/reviews`,
        {
          json: {
            comments: "El profesional no coincide con la propuesta y la corrigió.",
            correction: cuerpoFormulario(),
          },
        },
      );
      setModo("ver");
      /**
       * Caduca lo que ESTA acción cambió, y nada más: el informe del caso, su
       * formulario, la bandeja del médico y el listado. Los lotes, los usuarios
       * o la carga de otros profesionales no los tocó nadie.
       *
       * Caducar el informe basta para que la ficha pase a mostrar la versión
       * NUEVA —con la conclusión y la casilla del médico—: la consulta está
       * activa y se vuelve a pedir sola. No hace falta recargar aparte, y
       * hacerlo pedía el mismo documento dos veces.
       */
      await invalidar.informeCorregido(caseId);
      setMsg({
        ok: true,
        texto: r.newVersion
          ? `Corrección guardada. Ésta es la versión ${r.newVersion} del informe, ya con tu conclusión y tu propuesta: revísala antes de ratificar.`
          : "Corrección guardada. Revisa la nueva versión del informe antes de ratificar.",
      });
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo guardar la corrección." });
    } finally {
      setBusy(false);
    }
  }

  /**
   * RATIFICAR — un solo acto para el médico, dos caminos por dentro.
   *
   * Con una propuesta ya formada se aprueba tal cual. Cuando el informe no
   * propone nada, lo que se manda es la evaluación y la conclusión que él acaba
   * de escribir: el servidor crea con ellas la versión siguiente y firma ESA.
   * Nunca se aprueba un informe sin pronunciamiento.
   */
  /**
   * LO QUE SE ENVÍA, y es lo MISMO por las dos vías: corregir y resolver piden
   * los mismos campos porque son el mismo informe. Sólo se mandan las cifras
   * que el médico cambió — un campo intacto no es un cero, y escribirlo
   * borraría lo que el sistema sí computó.
   */
  /**
   * LO QUE SE ENVÍA, y es lo MISMO por las dos vías: corregir y resolver piden
   * los mismos campos porque son el mismo informe. Sólo viaja lo que el médico
   * CAMBIÓ — un campo intacto no es un dato nuevo, y mandarlo haría
   * indistinguible «confirmé este valor» de «lo escribí yo».
   */
  function cuerpoFormulario() {
    return cuerpoDeCorreccion(form, borrador);
  }

  /** ¿Se puede confirmar? El servidor manda, pero no se envía lo que va a rechazar. */
  const cambios = camposModificados(form, borrador);
  const faltaMotivo = exigeMotivo(form, borrador) && borrador.motivo.trim().length < 10;
  const cuerpoListo = cuerpoDeCorreccion(form, borrador) !== null;

  async function ratificar() {
    if (!rep) return;
    const resolviendo = modo === "resolver";
    if (resolviendo && (!cuerpoListo || faltaMotivo)) return;
    setBusy(true);
    setMsg(null);
    try {
      if (resolviendo) {
        await api(`/reports/${rep.id}/resolve-and-approve`, { json: cuerpoFormulario() });
        setModo("ver");
      } else {
        await api(`/reports/${rep.id}/approve`, { json: {} });
      }
      setMsg({ ok: true, texto: "Informe ratificado. Generando el documento firmado…" });
      // El documento firmado lo produce un worker; sondeamos hasta que exista.
      let r = await cargar();
      for (let i = 0; i < 15 && r && !r.finalArtifact && r.workflowStatus !== "SIGNING_FAILED"; i++) {
        await new Promise((res) => setTimeout(res, 1500));
        r = await cargar();
      }
      if (r?.finalArtifact) setMsg({ ok: true, texto: "Informe firmado. Ya puedes descargarlo." });
      else if (r?.workflowStatus === "SIGNING_FAILED") setMsg({ ok: false, texto: "No se pudo generar el documento firmado. Avisa al administrador." });
      // El expediente sale de «pendientes» en la bandeja y entra en el
      // histórico: eso hay que caducarlo. El informe no, que se acaba de
      // sondear y el de la caché ya es el vigente.
      await invalidar.informeRatificado(caseId, { informeYaRefrescado: true });
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo ratificar." });
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-zinc-600">{error}</p>
      </div>
    );
  }
  if (minima) return <VistaMinima caso={minima} />;
  // Primera carga: esqueleto con la forma de la ficha. Al volver a un caso ya
  // visto NO se pasa por aquí: `rep` viene de la caché y se pinta entero.
  if (!rep) return <FichaSkeleton />;

  const cap = rep.capabilities;
  const editando = modo !== "ver";
  const estado = ESTADO[rep.workflowStatus];
  const inputBase = "w-full rounded-lg border border-[var(--atm-linea)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--atm-azul2)]";
  /**
   * RECTIFICAR Y RATIFICAR SON INDEPENDIENTES.
   *
   * Cada botón se muestra por SU capacidad y por ninguna otra. En particular
   * `canRequestChanges` no mira `canApprove`, ni `readiness`, ni los
   * bloqueadores clínicos, ni la orientación: rectificar existe precisamente
   * para los informes que el médico no puede o no quiere aprobar tal como
   * están, y condicionarlo a que el informe esté conforme deja al profesional
   * mirando una propuesta que no puede corregir.
   *
   * La autoridad es la capacidad calculada por el backend. Aquí no se vuelve a
   * decidir nada.
   */
  /**
   * RATIFICAR ES UN SOLO BOTÓN CON DOS CAMINOS.
   *
   * `canApprove` cuando el informe ya propone una evaluación; `canResolveAndApprove`
   * cuando hay que completarla. El backend nunca devuelve las dos, y aquí no se
   * decide cuál es: se muestra el mismo botón y se toma el camino que el
   * servidor autorizó.
   */
  const puedeRatificar = cap.canApprove || cap.canResolveAndApprove;
  const puedeActuar = puedeRatificar || cap.canRequestChanges;
  const censo = censarLicencias(rep.licenses);
  /**
   * LA ÚNICA SEÑAL DE QUE ESTE EXPEDIENTE PIDE MÁS LECTURA es que el botón de
   * los antecedentes se vea más. Ni banner, ni aviso, ni una explicación de por
   * qué el sistema no concluyó: quien firma sabe lo que hace y no necesita que
   * se lo cuenten, y `canResolveAndApprove` ya dice —sin hablar de la máquina—
   * que el pronunciamiento tiene que ponerlo él.
   */
  const antecedentesDestacados = cap.canResolveAndApprove;

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="rounded-xl border border-[var(--atm-linea)] bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Trámite {rep.caseReference}</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Versión {rep.version} · preinforme del {fecha(rep.createdAt)}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${estado.chip}`}>{estado.texto}</span>
        </div>
        {/* DOS ACCIONES, Y NINGUNA DEL BORRADOR.
            El preinforme se lee AQUÍ ABAJO, entero: ofrecer además descargarlo
            era ofrecer lo mismo dos veces, y en dos formatos que no son el
            documento del expediente. Lo que sí se descarga es el informe
            FIRMADO, que es el que sale de la institución. */}
        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--atm-linea)] pt-3">
          {/* LOS ANTECEDENTES, para todos los expedientes y en todos los
              estados. Es el expediente original tal como llegó: el médico que
              no se convence con lo que el informe resume tiene que poder leerlo
              él. Se abre en otra pestaña para no sacarle de la revisión. */}
          {rep.sourceDocument && (
            <a
              href={`/api/v1${rep.sourceDocument.downloadUrl.replace(/^\/api\/v1/, "")}`}
              target="_blank"
              rel="noreferrer"
              className={
                antecedentesDestacados
                  ? "rounded-lg border border-[var(--atm-azul)] bg-[var(--atm-azul)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--atm-azul2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--atm-azul2)] focus-visible:ring-offset-2"
                  : "rounded-lg border border-[var(--atm-linea)] px-3 py-1.5 text-xs font-medium text-[var(--atm-azul)] hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--atm-azul2)] focus-visible:ring-offset-2"
              }
            >
              Ver antecedentes
            </a>
          )}
          {/* EL INFORME FIRMADO. Quién puede descargarlo lo dice el backend con
              `canDownloadSigned`, no la mera existencia de un artefacto: es la
              misma capacidad que autoriza la descarga en el servidor. La URL la
              trae el artefacto, que es quien la conoce. */}
          {cap.canDownloadSigned && rep.finalArtifact && (
            <a href={`/api/v1${rep.finalArtifact.downloadUrl.replace(/^\/api\/v1/, "")}`} target="_blank" rel="noreferrer"
               className="rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-[var(--atm-ok)] hover:bg-green-100">
              Descargar informe firmado (.docx)
            </a>
          )}
        </div>
      </div>

      {/* RETENCIÓN OPERACIONAL. Va lo primero, antes que cualquier otro aviso:
          es la razón por la que no hay botones, y leerla después de bajar el
          informe entero es leerla tarde. */}
      {rep.hold && (
        <p className={`rounded-lg border px-4 py-3 text-sm font-medium ${TONO.obs}`}>
          {rep.hold.statement}
        </p>
      )}

      {/* Avisos de estado / bloqueos / advertencias */}
      {estado.aviso && !editando && (
        <p className={`rounded-lg border px-4 py-2.5 text-sm ${TONO[estado.aviso.tono]}`}>{estado.aviso.texto}</p>
      )}
      {editando && (
        <p className={`rounded-lg border px-4 py-2.5 text-sm ${TONO.info}`}>
          {modo === "resolver" ? "Estás ratificando el informe." : "Estás modificando el informe."} Puedes
          corregir cualquier campo que salga en el documento. Debajo de cada uno se muestra lo que
          estableció el sistema, y puedes volver a ello. Cambiar datos de{" "}
          <strong>identificación</strong> exige un motivo escrito.
          {cambios.length > 0 && (
            <>
              {" "}
              Llevas <strong>{cambios.length}</strong> campo{cambios.length > 1 ? "s" : ""} modificado
              {cambios.length > 1 ? "s" : ""} sin guardar.
            </>
          )}
        </p>
      )}

      {/* EL EDITOR, o el documento. Mientras se corrige se enseña el
          formulario que describe el servidor; al salir, el documento otra vez.
          Antes esto era una rama por sección dentro del render del documento, y
          cada campo nuevo del contrato habría sido otra rama. */}
      {editando && form ? (
        <EditorInforme form={form} borrador={borrador} onChange={setBorrador} />
      ) : (
      <div className="overflow-hidden rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
        {rep.document.draftNotice && (
          <p className="border-b border-[var(--atm-linea)] bg-[var(--atm-fondo)] px-5 py-2 text-xs text-zinc-500">
            {rep.document.draftNotice}
          </p>
        )}
        {rep.document.sections.map((s) => {
          return (
            <section
              key={s.id}
              className="border-t border-[var(--atm-linea)] px-5 py-4 first:border-t-0"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-zinc-800">{s.title}</h4>
              </div>

              {(

                <>
                  {s.fields.length > 0 && (
                    <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
                      {s.fields.map((f, i) => (
                        <div key={i} className="flex gap-2 text-sm">
                          <dt className="shrink-0 text-zinc-500">{f.label}:</dt>
                          <dd className="text-zinc-800">{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {s.paragraphs.map((p, i) => (
                    <p key={i} className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                      {p}
                    </p>
                  ))}

                  {/* EL UNIVERSO DE LICENCIAS, al lado de los totales oficiales.
                      Los totales de arriba los computa el backend y son los que
                      se imprimen. Esto es el inventario de lo hallado, y está
                      aquí porque «Total licencias autorizadas: 0» se leyó como
                      «este expediente no tiene licencias» en un caso que traía
                      77, todas con el estado administrativo sin determinar. */}
                  {s.id === "II" && censo && (
                    <div className="mt-3 border-t border-[var(--atm-linea)] pt-3 text-sm">
                      <p className="text-zinc-700">
                        <span className="text-zinc-500">Licencias encontradas en el expediente: </span>
                        <span className="font-semibold text-zinc-900">{censo.encontradas}</span>
                      </p>
                      <ul className="mt-1.5 space-y-0.5">
                        {censo.porEstado.map((g) => (
                          <li key={g.estado}>
                            <span className="text-zinc-500">{g.etiqueta}: </span>
                            <span className="font-medium text-zinc-900">{g.cantidad}</span>
                          </li>
                        ))}
                        {/* UN CERO NO PUEDE HACER DE VEREDICTO.
                            Con el umbral INDETERMINATE, «Computables para el
                            umbral: 0» se lee como «no alcanza», y lo que ocurre
                            es que no hay con qué juzgarlo: en 32894823 las 73
                            licencias autorizadas tienen el tipo sin determinar.
                            El estado lo dice el backend; aquí no se deduce de
                            contar `countsForThreshold`, que vale cero en los dos
                            casos. MET y NOT_MET siguen mostrando el recuento. */}
                        <li>
                          {rep.thresholdStatus === "INDETERMINATE" ? (
                            <>
                              <span className="text-zinc-500">Umbral contractual: </span>
                              <span className="font-medium text-[var(--atm-obs)]">no determinable</span>
                              <span className="text-zinc-500">
                                {" "}
                                — el motivo consta en las limitaciones de la Sección IV
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-zinc-500">Computables para el umbral: </span>
                              <span className="font-medium text-zinc-900">{censo.computables}</span>
                            </>
                          )}
                        </li>
                      </ul>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-[var(--atm-azul)]">
                          Ver el detalle de las {censo.encontradas} licencias
                        </summary>
                        <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-[var(--atm-linea)]">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-[var(--atm-fondo)] text-left text-zinc-600">
                              <tr>
                                <th className="px-2 py-1.5 font-medium">Folio</th>
                                <th className="px-2 py-1.5 font-medium">Período</th>
                                <th className="px-2 py-1.5 font-medium">CIE-10</th>
                                <th className="px-2 py-1.5 font-medium">Estado</th>
                                <th className="px-2 py-1.5 font-medium">Días autorizados</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rep.licenses.map((l, i) => (
                                <tr key={`${l.folio}-${i}`} className="border-t border-[var(--atm-linea)]">
                                  <td className="px-2 py-1 font-mono text-zinc-800">{l.folio}</td>
                                  <td className="px-2 py-1 text-zinc-700">{periodoLicencia(l)}</td>
                                  <td className="px-2 py-1 text-zinc-700">{l.cie10}</td>
                                  <td className="px-2 py-1 text-zinc-700">{etiquetaEstadoSingular(l.effectiveState)}</td>
                                  <td className="px-2 py-1 text-zinc-700">{diasLicencia(l)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </div>
                  )}

                  {/* La propuesta, con las MISMAS casillas que salen impresas. */}
                  {/* La propuesta, con las MISMAS casillas que salen impresas.
                      La casilla dibujada es de Diego (28909a1) y se queda: se
                      parece al formulario que el médico firma en papel mucho más
                      que un "[X]" monoespaciado. Lo que cambia respecto de su
                      versión es de dónde salen las opciones — `document.proposal`
                      y no `rep.proposal`—, para que la Sección V diga exactamente
                      lo mismo que el .docx y el PDF, que se componen de ahí. */}
                  {s.id === "V" && (
                    <div className="mt-2 space-y-1.5 text-sm">
                      {rep.document.proposal.options.map((o, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center border text-[11px] font-bold leading-none ${
                              o.checked ? "border-zinc-900 text-zinc-900" : "border-zinc-400 text-transparent"
                            }`}
                          >
                            X
                          </span>
                          <span className={o.checked ? "font-medium text-zinc-900" : "text-zinc-600"}>
                            {o.label.toUpperCase()}
                          </span>
                        </div>
                      ))}
                      {rep.document.proposal.note && <p className="text-zinc-600">{rep.document.proposal.note}</p>}
                    </div>
                  )}
                </>
              )}
            </section>
          );
        })}
      </div>
      )}

      {/* Historial de pronunciamientos */}
      {rep.reviews.length > 0 && !editando && (
        <div className="rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
          <h4 className="border-b border-[var(--atm-linea)] px-5 py-3 text-sm font-semibold text-zinc-800">
            Historial
          </h4>
          <ul className="divide-y divide-[var(--atm-linea)]">
            {[...rep.reviews].reverse().map((r) => (
              <li key={r.id} className="px-5 py-3 text-sm">
                <p className={r.decision === "APPROVED" ? "font-medium text-[var(--atm-ok)]" : "font-medium text-[var(--atm-obs)]"}>
                  {r.decision === "APPROVED" ? "Ratificado" : "Corrección del médico"}
                  <span className="ml-2 font-normal text-xs text-zinc-400">{fecha(r.createdAt)}</span>
                </p>
                {r.comments && <p className="mt-1 whitespace-pre-wrap text-zinc-600">{r.comments}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {msg && (
        <p className={`rounded-lg border px-4 py-2.5 text-sm ${msg.ok ? TONO.ok : TONO.mal}`}>{msg.texto}</p>
      )}

      {/* Acciones.

          FIJA AL VIEWPORT, no `sticky`. Era `sticky bottom-4` sobre el último
          hijo del contenedor: el bloque pegajoso sólo se sostiene mientras su
          contenedor está a la vista, y siendo el último elemento de una página
          que mide varias pantallas, no aparecía hasta haber bajado el informe
          entero. Con `canRequestChanges: true` el botón estaba renderizado y no
          se veía, que para quien tiene que rectificar es lo mismo que no
          estar. */}
      {puedeActuar && (
        <div className="fixed inset-x-0 bottom-4 z-20 mx-auto w-full max-w-5xl px-6">
        <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-4 shadow-lg">
          {editando ? (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setModo("ver")} className="rounded-lg border border-[var(--atm-linea)] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                Cancelar
              </button>
              {/* CONFIRMAR ES EL MISMO ACTO QUE ABRIÓ EL FORMULARIO. Desde
                  «Corregir» se guarda y el informe vuelve a la bandeja; desde
                  «Ratificar» se firma la versión que estos dos campos producen.
                  En los dos casos hace falta una evaluación elegida: sin ella no
                  hay nada que proponer ni que firmar. */}
              <button
                onClick={modo === "resolver" ? ratificar : enviarModificacion}
                disabled={busy || !cuerpoListo || faltaMotivo}
                className="rounded-lg bg-[var(--atm-azul)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--atm-azul2)] disabled:opacity-40"
              >
                {modo === "resolver"
                  ? busy
                    ? "Ratificando…"
                    : "Ratificar"
                  : busy
                    ? "Guardando…"
                    : "Guardar corrección"}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {cap.canRequestChanges && (
                <button onClick={() => abrirFormulario("modificar")} className="rounded-lg border border-[var(--atm-linea)] px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                  No estoy de acuerdo, corregir
                </button>
              )}
              {/* UN SOLO BOTÓN. Cuando el informe ya propone una evaluación,
                  ratifica; cuando no propone ninguna, abre el formulario donde
                  el médico la aporta y luego ratifica. Para él es la misma
                  acción, y así debe ser: la diferencia es del sistema, no suya. */}
              {puedeRatificar && (
                <button
                  onClick={cap.canApprove ? ratificar : () => abrirFormulario("resolver")}
                  disabled={busy || !cap.hasActiveSignature}
                  className="rounded-lg bg-[var(--atm-azul)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--atm-azul2)] disabled:opacity-40"
                >
                  {busy ? "Ratificando…" : "Ratificar"}
                </button>
              )}
              {!cap.hasActiveSignature && (
                <span className="text-xs text-[var(--atm-obs)]">
                  Necesitas cargar tu firma en «Mi firma» para ratificar.
                </span>
              )}
            </div>
          )}
        </div>
        </div>
      )}

      {/* Hueco para que la barra fija no tape el final del informe. */}
      {puedeActuar && <div aria-hidden className="h-24" />}
    </div>
  );
}
