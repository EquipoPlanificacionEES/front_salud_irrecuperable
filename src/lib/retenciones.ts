/**
 * LOS MOTIVOS DE RETENCIÓN, EN UN SOLO SITIO.
 *
 * Los códigos son los de `CaseHoldReason` en el backend. Aquí sólo se traducen:
 * no cambian el motivo, el estado ni lo que bloquea una retención. Cualquier
 * pantalla que muestre un motivo pasa por `presentarMotivoRetencion`; un código
 * que llegue sin traducir se muestra como «Retenido» en vez de romper la tabla.
 *
 * La categoría es de PRESENTACIÓN, para agrupar y filtrar a la vista.
 */

export type CategoriaRetencion = "DOCUMENTAL" | "IDENTIDAD" | "TECNICO" | "OPERACIONAL";

export interface MotivoRetencion {
  readonly etiqueta: string;
  readonly descripcion: string;
  readonly categoria: CategoriaRetencion;
}

export const CATEGORIA_RETENCION_LABEL: Record<CategoriaRetencion, string> = {
  DOCUMENTAL: "Documental",
  IDENTIDAD: "Identidad",
  TECNICO: "Técnico",
  OPERACIONAL: "Operacional",
};

export const MOTIVOS_RETENCION = {
  DUPLICATE_SOURCE_DOCUMENT: {
    etiqueta: "Documento fuente duplicado",
    descripcion: "El expediente llegó con un documento fuente que ya pertenecía a otro caso.",
    categoria: "DOCUMENTAL",
  },
  SOURCE_IDENTITY_CONFLICT: {
    etiqueta: "Conflicto de identidad en el expediente",
    descripcion: "Los antecedentes del expediente identifican a más de una persona.",
    categoria: "IDENTIDAD",
  },
  OUT_OF_MENTAL_HEALTH_SCOPE: {
    etiqueta: "Fuera del alcance de salud mental",
    descripcion: "El profesional declaró que el cuadro no corresponde a salud mental. Requiere reasignación.",
    categoria: "OPERACIONAL",
  },
  EXPECTED_IDENTITY_MISMATCH: {
    etiqueta: "Identidad no coincide con la planilla",
    descripcion: "El RUT o el número de trámite del expediente no es el que espera la planilla de la semana.",
    categoria: "IDENTIDAD",
  },
  NOT_IN_BATCH_SOURCE: {
    etiqueta: "Caso no encontrado en la planilla oficial",
    descripcion: "El expediente no figura en la planilla de la semana, o figura repetido. Se corrige con quien envió la planilla.",
    categoria: "OPERACIONAL",
  },
  PREASSIGNMENT_DATA_MISSING: {
    etiqueta: "Falta identidad legible para validar",
    descripcion: "El expediente no trae un RUT legible con el que compararlo contra la planilla.",
    categoria: "DOCUMENTAL",
  },
} as const satisfies Record<string, MotivoRetencion>;

export type CodigoRetencion = keyof typeof MOTIVOS_RETENCION;

const GENERICO: MotivoRetencion = {
  etiqueta: "Retenido",
  descripcion: "Retención administrativa sin motivo reconocido.",
  categoria: "OPERACIONAL",
};

export function presentarMotivoRetencion(codigo: string | null | undefined): MotivoRetencion {
  if (codigo && Object.prototype.hasOwnProperty.call(MOTIVOS_RETENCION, codigo)) {
    return MOTIVOS_RETENCION[codigo as CodigoRetencion];
  }
  return GENERICO;
}
