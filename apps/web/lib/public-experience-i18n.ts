import type { WebLocale } from './i18n'

const copy = {
  es: {
    rankingNav: 'Ranking',
    rankingEyebrow: 'USO REAL / COMANDOS',
    rankingTitle: 'Top 10 comandos más usados',
    rankingIntro: 'Ranking calculado con ejecuciones reales registradas por la plataforma. Solo se muestran comandos públicos; las herramientas internas, administrativas y de contenido sensible quedan fuera de esta vista.',
    rankingLive: 'DATOS REALES',
    rankingExecutions: 'ejecuciones',
    rankingSuccess: 'éxito',
    rankingEmptyTitle: 'El ranking se está formando',
    rankingEmptyText: 'Todavía no hay suficientes ejecuciones públicas registradas. En cuanto existan datos, aquí aparecerán automáticamente los 10 comandos más usados.',
    loginAutoTitle: 'Iniciar sesión',
    loginAutoText: 'Acceso seguro a Ghost Nexora Bot.',
    loginAutoHint: 'ACCESO SEGURO',
    loginPlaceholder: 'Token de acceso',
    loginSubmit: 'Acceder',
    loginPasskey: 'Usar huella / Passkey',
    loginPasskeyWorking: 'Verificando dispositivo…',
    loginPasskeyError: 'No se pudo validar la Passkey.',
    loginReauth: 'Vuelve a autenticarte para continuar con esta acción.',
    loginMfaTitle: 'Confirma tu identidad',
    loginMfaText: 'Usa la huella, rostro o bloqueo seguro de tu dispositivo.',
    loginMfaButton: 'Confirmar con huella / Passkey',
  },
  en: {
    rankingNav: 'Ranking',
    rankingEyebrow: 'REAL USAGE / COMMANDS',
    rankingTitle: 'Top 10 most-used commands',
    rankingIntro: 'Ranking calculated from real executions recorded by the platform. Only public commands are shown; internal, administrative and sensitive-content tools are excluded from this view.',
    rankingLive: 'REAL DATA',
    rankingExecutions: 'executions',
    rankingSuccess: 'success',
    rankingEmptyTitle: 'The ranking is taking shape',
    rankingEmptyText: 'There are not enough recorded public executions yet. As soon as usage data is available, the 10 most-used commands will appear here automatically.',
    loginAutoTitle: 'Sign in',
    loginAutoText: 'Secure access to Ghost Nexora Bot.',
    loginAutoHint: 'SECURE ACCESS',
    loginPlaceholder: 'Access token',
    loginSubmit: 'Sign in',
    loginPasskey: 'Use fingerprint / Passkey',
    loginPasskeyWorking: 'Verifying device…',
    loginPasskeyError: 'The Passkey could not be verified.',
    loginReauth: 'Sign in again to continue with this action.',
    loginMfaTitle: 'Confirm your identity',
    loginMfaText: 'Use fingerprint, face or your device secure lock.',
    loginMfaButton: 'Confirm with fingerprint / Passkey',
  },
} as const

export type PublicExperienceKey = keyof typeof copy.es

export function publicExperienceT(locale: WebLocale, key: PublicExperienceKey) {
  return copy[locale][key]
}
