export type Locale = 'es' | 'en'

const catalog = {
  es: {
    title: 'Ghost Nexora Manager', subtitle: 'Control oficial del runtime', connect: 'Conectar', disconnect: 'Desconectar',
    url: 'URL de Control API', token: 'Token de acceso', status: 'Estado', platforms: 'Plataformas', metrics: 'Métricas', logs: 'Logs',
    settings: 'Configuración', pairing: 'Vinculación WhatsApp', refresh: 'Actualizar', save: 'Guardar', update: 'Actualizar runtime',
    online: 'En línea', offline: 'Fuera de línea', memory: 'Memoria RSS', uptime: 'Tiempo activo', subbots: 'Subbots',
    pairQr: 'Solicitar QR', pairCode: 'Solicitar código', phone: 'Número con código de país', noData: 'Sin datos',
    remoteNotice: 'Para conexiones remotas usa HTTPS mediante un proxy seguro. El runtime escucha localhost por defecto.',
    managerRequired: 'Esta operación requiere el gestor nativo del sistema.', language: 'Idioma', prefix: 'Prefijo', botName: 'Nombre del bot',
  },
  en: {
    title: 'Ghost Nexora Manager', subtitle: 'Official runtime control', connect: 'Connect', disconnect: 'Disconnect',
    url: 'Control API URL', token: 'Access token', status: 'Status', platforms: 'Platforms', metrics: 'Metrics', logs: 'Logs',
    settings: 'Settings', pairing: 'WhatsApp pairing', refresh: 'Refresh', save: 'Save', update: 'Update runtime',
    online: 'Online', offline: 'Offline', memory: 'RSS memory', uptime: 'Uptime', subbots: 'Subbots',
    pairQr: 'Request QR', pairCode: 'Request code', phone: 'Phone with country code', noData: 'No data',
    remoteNotice: 'For remote connections use HTTPS through a secure reverse proxy. Runtime listens on localhost by default.',
    managerRequired: 'This operation requires the native host manager.', language: 'Language', prefix: 'Prefix', botName: 'Bot name',
  },
} as const

export function makeTranslator(locale: Locale) {
  return (key: keyof typeof catalog.es) => catalog[locale][key]
}
