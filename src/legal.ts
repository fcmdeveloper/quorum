/**
 * Textos de responsabilidad y seguridad. Se muestran al abrir Quorum por primera vez
 * (y cada vez que cambie TERMS_VERSION) y quedan disponibles en "Acerca de".
 */
import type { IconName } from './ui/components';

/** Subir este número obliga a volver a aceptar el aviso (p. ej. si cambia el texto). */
export const TERMS_VERSION = 2;

/** Lo que Quorum nunca hará: para reconocer estafas que se hacen pasar por Quorum. */
export const NEVER_ASK: string[] = [
  'Pedirte la frase semilla o las claves de otra billetera, ni el código de tus tarjetas. Lo único que Quorum te pide escribir son los números secretos de una bóveda que tú creaste en Quorum, y solo dentro del asistente de esa bóveda.',
  'Escribirte por mensaje, correo, redes o teléfono para que firmes, autorices o envíes algo.',
  'Pedirte que hagas clic en un enlace para "verificar", "actualizar" o "recuperar" tu cuenta.',
  'Crear operaciones por su cuenta: solo existe lo que tú o tus cofirmantes proponen.',
  'Cobrarte por usar la app, ni pedirte fondos para "desbloquear" nada.',
];

export const RESPONSIBILITY: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'key',
    title: 'Tú tienes el control, y la responsabilidad',
    text: 'Quorum es una app de autocustodia: no guarda tus claves. Si creas una bóveda en Quorum, sus números secretos se generan en tu teléfono, se muestran una vez y no se guardan. Si pierdes tus dispositivos o respaldos por debajo del quórum, nadie —tampoco Quorum— puede recuperar tus fondos.',
  },
  {
    icon: 'lock',
    title: 'Bóvedas creadas en Quorum',
    text: 'Una bóveda creada en Quorum no puede volver a cuenta normal dentro de la app: es una regla de Quorum, y tú asumes esa decisión al crearla. Para salir, se mueven los fondos con multifirma a otra cuenta.',
  },
  {
    icon: 'eye',
    title: 'Revisa siempre lo que firmas',
    text: 'Antes de aprobar, confirma el monto, el destino y el tipo de operación en tu dispositivo. Las operaciones en el XRP Ledger son definitivas y no se pueden deshacer.',
  },
  {
    icon: 'alert-triangle',
    title: 'Software en versión beta',
    text: 'Quorum se entrega "tal cual", sin garantías de ningún tipo. Pruébalo primero en testnet o con montos pequeños. Minify SpA y quienes contribuyen al proyecto no se hacen responsables por pérdidas derivadas de su uso.',
  },
  {
    icon: 'info',
    title: 'No es asesoría financiera',
    text: 'Quorum no recomienda inversiones ni custodia fondos de nadie. Los precios en USD o EUR son solo referenciales.',
  },
];
