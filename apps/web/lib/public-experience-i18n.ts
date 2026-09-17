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
    loginAutoTitle: 'Un solo acceso',
    loginAutoText: 'Introduce tu token y el sistema identifica automáticamente el tipo de acceso. Si es administrativo abrirá el panel correspondiente; si pertenece a un subbot abrirá directamente su portal.',
    loginAutoHint: 'No necesitas elegir entre administrador o subbot.',
    loginPlaceholder: 'Pega tu token de acceso',
    loginSubmit: 'Continuar de forma segura',
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
    loginAutoTitle: 'One access point',
    loginAutoText: 'Enter your token and the system automatically identifies the access type. An administrative token opens the admin panel, while a subbot token opens its own portal directly.',
    loginAutoHint: 'You do not need to choose between administrator or subbot.',
    loginPlaceholder: 'Paste your access token',
    loginSubmit: 'Continue securely',
  },
} as const

export type PublicExperienceKey = keyof typeof copy.es

export function publicExperienceT(locale: WebLocale, key: PublicExperienceKey) {
  return copy[locale][key]
}
