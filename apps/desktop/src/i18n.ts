export type Locale = 'es' | 'en'

const catalog = {
  es: {
    title: 'Ghost Nexora Manager', subtitle: 'Control oficial del runtime', connect: 'Conectar', disconnect: 'Desconectar',
    url: 'URL del Manager API', token: 'Token de acceso', status: 'Estado', platforms: 'Plataformas', metrics: 'Métricas', logs: 'Logs',
    settings: 'Configuración', pairing: 'Vinculación WhatsApp', refresh: 'Actualizar', save: 'Guardar', update: 'Actualizar runtime',
    runtimeControl: 'Control del servicio', start: 'Iniciar', stop: 'Detener', restart: 'Reiniciar',
    online: 'En línea', offline: 'Fuera de línea', memory: 'Memoria RSS', uptime: 'Tiempo activo', subbots: 'Subbots',
    pairQr: 'Solicitar QR', pairCode: 'Solicitar código', phone: 'Número con código de país', noData: 'Sin datos',
    remoteNotice: 'Usa https://tu-dominio/manager para conexiones remotas. HTTP solo está permitido en localhost.',
    managerRequired: 'Esta operación requiere el Manager Agent persistente del host.', language: 'Idioma', prefix: 'Prefijo', botName: 'Nombre del bot',
  },
  en: {
    title: 'Ghost Nexora Manager', subtitle: 'Official runtime control', connect: 'Connect', disconnect: 'Disconnect',
    url: 'Manager API URL', token: 'Access token', status: 'Status', platforms: 'Platforms', metrics: 'Metrics', logs: 'Logs',
    settings: 'Settings', pairing: 'WhatsApp pairing', refresh: 'Refresh', save: 'Save', update: 'Update runtime',
    runtimeControl: 'Service control', start: 'Start', stop: 'Stop', restart: 'Restart',
    online: 'Online', offline: 'Offline', memory: 'RSS memory', uptime: 'Uptime', subbots: 'Subbots',
    pairQr: 'Request QR', pairCode: 'Request code', phone: 'Phone with country code', noData: 'No data',
    remoteNotice: 'Use https://your-domain/manager for remote connections. HTTP is allowed only on localhost.',
    managerRequired: 'This operation requires the persistent host Manager Agent.', language: 'Language', prefix: 'Prefix', botName: 'Bot name',
  },
} as const

export function makeTranslator(locale: Locale) {
  return (key: keyof typeof catalog.es) => catalog[locale][key]
}
