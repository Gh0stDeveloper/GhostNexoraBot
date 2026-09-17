import { ArrowLeft, Database, LockKeyhole, Mail, ServerCog, ShieldCheck } from 'lucide-react'
import { getWebLocale } from '../../lib/i18n-server'

export const dynamic = 'force-dynamic'

export default async function PrivacyPage() {
  const locale = await getWebLocale()
  const es = locale !== 'en'
  const effective = es ? '16 de septiembre de 2026' : 'September 16, 2026'

  const sections = es ? [
    {
      title: '1. Responsable y alcance',
      paragraphs: [
        'Esta Política de Privacidad describe cómo Ghost Developer / Nexora trata información relacionada con Ghost Nexora Bot, su web oficial, panel administrativo, portal de subbots, sistema de grupos, descargas, herramientas operativas y funciones integradas.',
        'La arquitectura permite instalaciones autohospedadas. Cuando una persona u organización instala y opera su propia instancia, esa persona u organización controla sus propios servidores, bases de datos, credenciales, registros, integraciones y decisiones de tratamiento, y puede actuar como responsable independiente de los datos de sus usuarios. Esta política no sustituye la política que dicho operador deba proporcionar.',
      ],
    },
    {
      title: '2. Datos que puede procesar la plataforma',
      bullets: [
        'Datos de acceso web: rol administrativo o de subbot, identificadores vinculados al portal, identificador del subbot y vigencia de la sesión.',
        'Identificadores técnicos de WhatsApp u otras plataformas conectadas, incluidos JID, identificadores de grupo o cuenta y datos necesarios para enrutar eventos y comandos.',
        'Metadatos de grupos: nombre/asunto, descripción, fecha de creación cuando esté disponible, cantidad de participantes y administradores, configuración del grupo, imagen de perfil y estado operativo.',
        'Estadísticas de actividad: conteos de mensajes, actividad diaria y, cuando la función lo requiere, representaciones hash de identificadores de remitentes para medir usuarios únicos sin mostrar directamente el identificador original en la estadística.',
        'Contenido enviado al bot cuando sea necesario para ejecutar un comando o función, por ejemplo consultas de IA, URLs de descarga, texto para utilidades, parámetros de administración o archivos que el usuario solicite procesar.',
        'Registros técnicos y de auditoría: eventos del runtime, errores, estado de servicios, solicitudes de control, métricas, información de actualización, resultados de tareas y datos necesarios para diagnosticar fallos.',
        'Configuración de la instancia: preferencias, permisos, funciones activadas, parámetros de grupos, datos de subbots y referencias a proveedores o integraciones configuradas por el administrador.',
        'Datos de distribución de software: versión, arquitectura, nombre del artefacto, tamaño, hash, estado de firma y metadatos de publicación.',
      ],
    },
    {
      title: '3. Contenido de mensajes y archivos',
      paragraphs: [
        'Ghost Nexora Bot necesita recibir eventos y contenido suficiente para interpretar comandos y ejecutar las funciones solicitadas. Esto no significa que todo mensaje de todos los chats se conserve permanentemente.',
        'La persistencia concreta depende del módulo, configuración, logs habilitados, base de datos de la instancia y servicios externos utilizados. Los administradores deben habilitar únicamente los registros y funciones necesarios para su operación y evitar conservar información que no necesiten.',
      ],
    },
    {
      title: '4. Finalidades del tratamiento',
      bullets: [
        'Autenticar administradores y usuarios autorizados del portal de subbots.',
        'Conectar el bot con las plataformas habilitadas y ejecutar comandos solicitados.',
        'Sincronizar grupos, mostrar estado operativo y permitir acciones administrativas autorizadas.',
        'Aplicar configuraciones, permisos, moderación y aislamiento entre instancia principal y subbots.',
        'Generar estadísticas operativas y detectar problemas de funcionamiento o abuso.',
        'Proporcionar funciones de IA, descargas, búsqueda, medios, juegos y otras utilidades cuando estén activadas.',
        'Mantener seguridad, integridad, disponibilidad, auditoría y capacidad de recuperación.',
        'Distribuir actualizaciones y permitir verificar integridad de instaladores y paquetes.',
      ],
    },
    {
      title: '5. Bases de tratamiento',
      paragraphs: [
        'Según la jurisdicción y el contexto, el tratamiento puede basarse en la ejecución de un servicio solicitado, el consentimiento cuando sea necesario, intereses legítimos de seguridad y operación, cumplimiento de obligaciones legales o la autorización del administrador de una comunidad para gestionar técnicamente su instancia.',
        'Cuando la legislación exija una base específica o un aviso adicional, corresponde al operador que efectivamente controla la instancia proporcionar esa información y obtener las autorizaciones necesarias.',
      ],
    },
    {
      title: '6. Sesiones, cookies y autenticación',
      paragraphs: [
        'La web utiliza cookies de sesión para mantener autenticación administrativa y del portal de subbots. Las cookies de sesión implementadas por el proyecto son HttpOnly, utilizan SameSite=Lax y se marcan como Secure cuando la URL pública está configurada con HTTPS.',
        'La sesión administrativa tiene por defecto una vigencia de hasta 12 horas. Una sesión de subbot queda limitada por la vigencia del token, la vigencia del propio subbot y un máximo técnico de hasta 7 días. El administrador puede revocar credenciales o invalidar accesos según la configuración de su instancia.',
      ],
    },
    {
      title: '7. Proveedores y terceros',
      paragraphs: [
        'Dependiendo de las funciones habilitadas, la plataforma puede interactuar con infraestructura de WhatsApp/Meta, Telegram, Discord, GitHub, redes de distribución de contenido, proveedores de APIs, servicios de descarga o búsqueda y modelos de IA. Ollama puede ejecutarse localmente, lo que permite que determinadas funciones de IA permanezcan dentro del servidor configurado por el administrador.',
        'Cada servicio externo aplica sus propias condiciones y políticas. El administrador debe revisar qué proveedores activa y qué información envía a ellos. Una instalación modificada puede añadir proveedores no incluidos en la versión oficial del proyecto.',
      ],
    },
    {
      title: '8. Transferencias y ubicación de datos',
      paragraphs: [
        'En instalaciones autohospedadas, la ubicación principal de los datos depende del VPS, servidor, almacenamiento y proveedores elegidos por el operador. Las plataformas externas pueden procesar información en otros países conforme a sus propias infraestructuras.',
        'Cuando una transferencia internacional requiera salvaguardas adicionales conforme a la legislación aplicable, el operador responsable de la instancia deberá adoptar el mecanismo legal correspondiente.',
      ],
    },
    {
      title: '9. Conservación',
      paragraphs: [
        'La información se conserva únicamente durante el tiempo razonablemente necesario para la finalidad operativa, de seguridad, auditoría o cumplimiento correspondiente, sujeto a la configuración de cada instancia. Las sesiones expiran automáticamente según sus límites técnicos; tokens y subbots también pueden quedar sujetos a sus propias fechas de expiración.',
        'Bases de datos, copias de seguridad, registros y archivos generados por una instalación autohospedada se conservan conforme a la política y configuración de su administrador. La eliminación de una cuenta o función no implica necesariamente la eliminación inmediata de copias de seguridad legítimamente conservadas hasta su siguiente ciclo de rotación.',
      ],
    },
    {
      title: '10. Seguridad',
      paragraphs: [
        'El proyecto implementa medidas técnicas orientadas a reducir riesgos, entre ellas sesiones firmadas mediante HMAC, comparación segura de credenciales, hashes para determinados identificadores y tokens, cookies HttpOnly, soporte de HTTPS, aislamiento de componentes y controles administrativos.',
        'Ningún sistema conectado a Internet puede garantizar seguridad absoluta. La protección final también depende de mantener actualizado el servidor, limitar puertos, configurar correctamente Nginx/TLS, proteger secretos, controlar permisos, revisar dependencias y asegurar copias de seguridad y sesiones de WhatsApp.',
      ],
    },
    {
      title: '11. Venta de datos y publicidad',
      paragraphs: [
        'El proyecto Ghost Nexora Bot no incorpora un mecanismo cuyo propósito sea vender datos personales de los usuarios. Si un operador externo modifica una instalación, añade publicidad, analítica o monetización propia, debe informar esas prácticas de forma independiente y cumplir la legislación aplicable.',
      ],
    },
    {
      title: '12. Derechos de las personas',
      paragraphs: [
        'Dependiendo de la legislación aplicable, una persona puede tener derechos de acceso, rectificación, eliminación, oposición, limitación, portabilidad o retiro del consentimiento. También puede tener derecho a presentar una reclamación ante la autoridad de protección de datos competente.',
        'Para información controlada por una instalación autohospedada, la solicitud debe dirigirse primero al administrador de esa instalación, porque Ghost Developer / Nexora puede no tener acceso técnico a sus servidores o bases de datos. Para servicios operados directamente por el proyecto, las solicitudes pueden enviarse a ghostnexora@gmail.com.',
      ],
    },
    {
      title: '13. Menores y contenido sensible',
      paragraphs: [
        'El servicio debe utilizarse respetando los requisitos de edad de las plataformas conectadas y la legislación aplicable. Las funciones que permitan acceder a contenido adulto o sensible no están dirigidas a menores y los administradores deben aplicar controles apropiados para impedir acceso no autorizado.',
        'No debe utilizarse la plataforma para procesar material de explotación sexual infantil ni ningún otro contenido cuya mera posesión, distribución o tratamiento sea ilegal.',
      ],
    },
    {
      title: '14. Código abierto y telemetría de terceros',
      paragraphs: [
        'El hecho de que el código sea público permite revisar qué información procesa la versión oficial. Sin embargo, una copia modificada puede comportarse de forma diferente. Antes de usar una instancia ajena, verifica quién la administra y qué versión del software ejecuta.',
        'Los recursos web externos —por ejemplo repositorios, CDNs o APIs activadas— pueden recibir datos técnicos ordinarios de conexión, como dirección IP y cabeceras HTTP, conforme a sus propias políticas. Los registros del proxy inverso o proveedor de hosting también pueden contener datos técnicos de acceso.',
      ],
    },
    {
      title: '15. Incidentes y vulnerabilidades',
      paragraphs: [
        'Si detectas una vulnerabilidad o exposición de datos, evita publicar secretos, tokens o datos personales. Repórtala por un canal oficial con la información mínima necesaria para reproducir y corregir el problema. Cuando la ley exija notificaciones específicas por una brecha, el responsable de la instancia afectada deberá cumplirlas.',
      ],
    },
    {
      title: '16. Cambios a esta política',
      paragraphs: [
        'Esta política puede actualizarse para reflejar nuevas funciones, proveedores, medidas de seguridad o requisitos legales. La fecha de vigencia permite identificar la versión publicada. Los cambios materiales podrán anunciarse en canales oficiales cuando resulte razonable.',
      ],
    },
    {
      title: '17. Contacto de privacidad',
      paragraphs: [
        'Consultas de privacidad, solicitudes sobre datos, reportes de seguridad o dudas sobre esta política: ghostnexora@gmail.com. Canal oficial adicional: Telegram @Gh0stDeveloper.',
      ],
    },
  ] : [
    { title: '1. Controller and scope', paragraphs: ['This Privacy Policy describes how Ghost Developer / Nexora processes information associated with Ghost Nexora Bot, its official website, administrative dashboard, subbot portal, group system, downloads, operational tools and integrated features.', 'The architecture supports self-hosted deployments. When a person or organization installs and operates its own instance, that operator controls its servers, databases, credentials, logs, integrations and processing decisions and may act as an independent data controller. This policy does not replace any policy that such an operator is required to provide.'] },
    { title: '2. Data the platform may process', bullets: ['Web access data: admin or subbot role, portal-linked identifiers, subbot identifier and session lifetime.', 'Technical identifiers from WhatsApp or other connected platforms, including JIDs, group/account identifiers and data needed to route events and commands.', 'Group metadata: subject/name, description, creation date where available, participant/admin counts, group configuration, profile image and operational state.', 'Activity statistics: message counts, daily activity and, where needed, hashed sender identifiers used to measure unique senders without displaying the original identifier in that statistic.', 'Content sent to the bot when needed to execute a requested function, such as AI prompts, download URLs, utility text, administrative parameters or files requested for processing.', 'Technical and audit logs: runtime events, errors, service state, control requests, metrics, update information, task results and data needed for troubleshooting.', 'Deployment configuration: preferences, permissions, enabled features, group settings, subbot data and references to providers or integrations configured by the administrator.', 'Software-distribution data: version, architecture, artifact name, size, hash, signature state and publication metadata.'] },
    { title: '3. Message and file content', paragraphs: ['Ghost Nexora Bot must receive enough event and content data to interpret commands and perform requested functions. This does not mean every message from every chat is stored permanently.', 'Actual persistence depends on the module, deployment configuration, enabled logs, instance database and external services. Administrators should enable only the logs and features they need and avoid retaining unnecessary information.'] },
    { title: '4. Purposes of processing', bullets: ['Authenticate administrators and authorized subbot-portal users.', 'Connect the bot to enabled platforms and execute requested commands.', 'Synchronize groups, display operational status and allow authorized administrative actions.', 'Apply configuration, permissions, moderation and isolation between the main instance and subbots.', 'Generate operational statistics and detect failures or abuse.', 'Provide AI, download, search, media, game and utility functions when enabled.', 'Maintain security, integrity, availability, auditability and recovery.', 'Distribute updates and support integrity verification of installers and packages.'] },
    { title: '5. Legal bases', paragraphs: ['Depending on the jurisdiction and context, processing may rely on performance of a requested service, consent where required, legitimate interests in security and operation, compliance with legal obligations, or authorization from a community administrator to technically manage its deployment.', 'Where law requires a specific legal basis or additional notice, the operator that actually controls the deployment must provide that information and obtain any required authorization.'] },
    { title: '6. Sessions, cookies and authentication', paragraphs: ['The website uses session cookies for administrator and subbot-portal authentication. Project session cookies are HttpOnly, use SameSite=Lax and are marked Secure when the configured public URL uses HTTPS.', 'The admin session defaults to a maximum of 12 hours. A subbot session is limited by portal-token expiry, subbot expiry and a technical maximum of 7 days. Administrators may revoke credentials or invalidate access according to their deployment configuration.'] },
    { title: '7. Providers and third parties', paragraphs: ['Depending on enabled features, the platform may interact with WhatsApp/Meta, Telegram, Discord, GitHub, content-delivery networks, API providers, download/search services and AI models. Ollama may run locally, allowing certain AI processing to remain on the administrator’s configured server.', 'Each external service applies its own terms and privacy practices. Administrators should review which providers they enable and which information is sent to them. Modified deployments may add providers not present in the official project.'] },
    { title: '8. Transfers and data location', paragraphs: ['For self-hosted deployments, primary data location depends on the VPS, server, storage and providers selected by the operator. External platforms may process information in other countries according to their infrastructure.', 'Where an international transfer requires additional safeguards under applicable law, the responsible deployment operator must implement the appropriate mechanism.'] },
    { title: '9. Retention', paragraphs: ['Information is retained only for as long as reasonably necessary for the relevant operational, security, audit or compliance purpose, subject to each deployment’s configuration. Sessions expire automatically according to technical limits; tokens and subbots may also have their own expiration dates.', 'Databases, backups, logs and files generated by self-hosted deployments are retained according to their administrator’s policy and configuration. Deletion of an account or feature may not immediately remove legitimately retained backups until the next rotation cycle.'] },
    { title: '10. Security', paragraphs: ['The project implements measures intended to reduce risk, including HMAC-signed sessions, timing-safe credential comparison, hashes for selected identifiers and tokens, HttpOnly cookies, HTTPS support, component isolation and administrative controls.', 'No Internet-connected system can guarantee absolute security. Protection also depends on keeping the server current, restricting ports, configuring Nginx/TLS correctly, protecting secrets, controlling permissions, reviewing dependencies and securing backups and WhatsApp sessions.'] },
    { title: '11. Data sales and advertising', paragraphs: ['Ghost Nexora Bot does not include a mechanism whose purpose is to sell users’ personal data. If an external operator modifies a deployment or adds its own advertising, analytics or monetization, that operator must independently disclose those practices and comply with applicable law.'] },
    { title: '12. Individual rights', paragraphs: ['Depending on applicable law, individuals may have rights of access, correction, deletion, objection, restriction, portability or withdrawal of consent, and may have the right to complain to a competent data-protection authority.', 'For data controlled by a self-hosted deployment, requests should first be directed to that deployment’s administrator because Ghost Developer / Nexora may have no technical access to its servers or databases. Requests concerning services directly operated by the project may be sent to ghostnexora@gmail.com.'] },
    { title: '13. Minors and sensitive content', paragraphs: ['The service must be used in accordance with age requirements of connected platforms and applicable law. Features capable of accessing adult or sensitive content are not directed to minors, and administrators should apply appropriate controls against unauthorized access.', 'The platform must never be used to process child sexual exploitation material or other content whose possession, distribution or processing is unlawful.'] },
    { title: '14. Open source and third-party telemetry', paragraphs: ['Public source code allows review of what the official version processes. A modified copy may behave differently. Before using another party’s instance, verify who operates it and which software version it runs.', 'External web resources —such as repositories, CDNs or enabled APIs— may receive ordinary connection data such as IP addresses and HTTP headers under their own policies. Reverse-proxy or hosting-provider logs may also contain technical access data.'] },
    { title: '15. Incidents and vulnerabilities', paragraphs: ['If you discover a vulnerability or data exposure, do not publish secrets, tokens or personal data. Report it through an official channel with the minimum information needed to reproduce and fix the issue. Where breach notifications are legally required, the controller of the affected deployment is responsible for them.'] },
    { title: '16. Changes to this policy', paragraphs: ['This policy may be updated to reflect new features, providers, security controls or legal requirements. The effective date identifies the published version. Material changes may be announced through official channels where reasonable.'] },
    { title: '17. Privacy contact', paragraphs: ['Privacy questions, data requests, security reports or questions about this policy: ghostnexora@gmail.com. Additional official channel: Telegram @Gh0stDeveloper.'] },
  ]

  return <main className="ops-page min-h-screen">
    <header className="sticky top-0 z-30 border-b border-white/[.08] bg-[#080809]/92 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4 px-5 py-4 md:px-8">
        <a href="/legal" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl border border-blue-500/25 bg-blue-500/[.1]"><LockKeyhole className="size-5 text-blue-300"/></span><span><strong className="block text-sm text-white">{es ? 'Política de privacidad' : 'Privacy Policy'}</strong><span className="text-[10px] font-bold uppercase tracking-[.16em] text-blue-300">Ghost Nexora Bot</span></span></a>
        <a href="/legal" className="ops-button-muted"><ArrowLeft className="size-4"/>{es ? 'Centro legal' : 'Legal center'}</a>
      </div>
    </header>

    <section className="mx-auto w-full max-w-[1180px] px-5 py-14 md:px-8 lg:py-20">
      <div className="grid gap-6 lg:grid-cols-[1fr_300px] lg:items-start">
        <article className="ops-panel p-6 md:p-9">
          <div className="border-b border-white/[.08] pb-7">
            <p className="font-mono text-xs font-black uppercase tracking-[.18em] text-blue-300">{es ? 'PRIVACIDAD · SEGURIDAD · TRANSPARENCIA' : 'PRIVACY · SECURITY · TRANSPARENCY'}</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-.035em] text-white">{es ? 'Política de privacidad' : 'Privacy Policy'}</h1>
            <p className="mt-4 text-sm leading-7 text-zinc-300">{es ? 'Fecha de vigencia' : 'Effective date'}: <strong>{effective}</strong></p>
          </div>
          <div className="legal-prose">
            {sections.map((section) => <section key={section.title}>
              <h2>{section.title}</h2>
              {'paragraphs' in section && section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {'bullets' in section && section.bullets && <ul className="list-disc">{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul>}
            </section>)}
          </div>
        </article>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className="ops-panel p-5">
            <ShieldCheck className="size-5 text-emerald-300"/>
            <h2 className="mt-4 font-black text-white">{es ? 'Protección técnica' : 'Technical protection'}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{es ? 'Sesiones firmadas, cookies HttpOnly, hashes de identificadores seleccionados, aislamiento y soporte HTTPS.' : 'Signed sessions, HttpOnly cookies, hashes for selected identifiers, isolation and HTTPS support.'}</p>
          </div>
          <div className="ops-panel p-5">
            <Database className="size-5 text-blue-300"/>
            <h2 className="mt-4 font-black text-white">{es ? 'Autohospedado' : 'Self-hosted'}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{es ? 'El operador de cada VPS controla sus bases de datos, logs, integraciones y política de conservación.' : 'Each VPS operator controls its databases, logs, integrations and retention policy.'}</p>
          </div>
          <div className="ops-panel p-5">
            <ServerCog className="size-5 text-violet-300"/>
            <h2 className="mt-4 font-black text-white">{es ? 'Contacto' : 'Contact'}</h2>
            <a href="mailto:ghostnexora@gmail.com" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-300 hover:text-blue-200"><Mail className="size-4"/>ghostnexora@gmail.com</a>
          </div>
        </aside>
      </div>
    </section>
  </main>
}
