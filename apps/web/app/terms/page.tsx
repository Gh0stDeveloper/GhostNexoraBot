import { ArrowLeft, FileText, Mail, Scale, ShieldCheck } from 'lucide-react'
import { getWebLocale } from '../../lib/i18n-server'

export const dynamic = 'force-dynamic'

export default async function TermsPage() {
  const locale = await getWebLocale()
  const es = locale !== 'en'
  const effective = es ? '16 de septiembre de 2026' : 'September 16, 2026'

  const sections = es ? [
    {
      title: '1. Identificación, alcance y aceptación',
      paragraphs: [
        'Estos Términos y Condiciones regulan el acceso y uso de Ghost Nexora Bot, su sitio web, panel administrativo, portal de subbots, herramientas de grupos, descargas oficiales, componentes de inteligencia artificial, integraciones, APIs internas y demás funciones publicadas por Ghost Developer / Nexora.',
        'Al instalar, ejecutar, administrar, vincular, descargar o utilizar cualquier parte del proyecto, aceptas estos términos en la medida permitida por la legislación aplicable. Si administras una instancia para terceros, eres responsable de informarles sobre las reglas y políticas aplicables a esa instancia.',
      ],
    },
    {
      title: '2. Naturaleza del proyecto y servicios de terceros',
      paragraphs: [
        'Ghost Nexora Bot es un proyecto de software independiente. No se presenta como producto oficial de Meta, WhatsApp, Telegram, Discord, GitHub, Ollama ni de otros proveedores mencionados en el software.',
        'El funcionamiento de determinadas características depende de servicios, protocolos, APIs, sitios web o infraestructura de terceros. Sus propietarios pueden modificar, limitar, bloquear o retirar funcionalidades sin control del proyecto. El uso de esos servicios también queda sujeto a sus propios términos, políticas, límites y reglas de contenido.',
      ],
    },
    {
      title: '3. Elegibilidad y responsabilidad del usuario',
      paragraphs: [
        'Debes cumplir la edad mínima, capacidad jurídica y requisitos establecidos por la ley de tu jurisdicción y por cada plataforma de terceros que utilices. Las funciones destinadas a contenido adulto o sensible solo pueden utilizarse por personas que tengan la edad legal necesaria y cuando dicho contenido sea lícito en su jurisdicción.',
        'Eres responsable de las acciones ejecutadas desde tus credenciales, sesiones, tokens, números vinculados, subbots y servidores. No compartas secretos administrativos ni credenciales de acceso con personas no autorizadas.',
      ],
    },
    {
      title: '4. Uso permitido',
      paragraphs: [
        'Puedes utilizar el proyecto para automatización legítima, administración de comunidades, entretenimiento, utilidades, descargas permitidas, funciones de IA, operación de subbots y demás casos de uso habilitados por el software, siempre que respetes la ley, los derechos de terceros y las reglas de las plataformas conectadas.',
        'Quien despliegue una instancia autohospedada es responsable de su configuración, permisos, seguridad, disponibilidad, cumplimiento normativo y de las acciones realizadas por sus administradores y usuarios.',
      ],
    },
    {
      title: '5. Conductas prohibidas',
      paragraphs: [
        'No se permite usar Ghost Nexora Bot para acceso no autorizado, fraude, phishing, distribución de malware, acoso, amenazas, explotación infantil, difusión ilícita de material íntimo, suplantación fraudulenta, evasión deliberada de medidas de seguridad, spam abusivo, ataques de denegación de servicio ni otras actividades ilegales.',
        'Tampoco debes emplear el proyecto para infringir derechos de autor, marcas, privacidad, secreto, imagen u otros derechos de terceros. Que una función técnica permita recuperar o procesar contenido no implica que exista autorización jurídica para hacerlo.',
      ],
    },
    {
      title: '6. Grupos, administración y moderación',
      paragraphs: [
        'Las funciones de grupos pueden leer metadatos operativos, contabilizar actividad, gestionar configuraciones, aplicar acciones de moderación, abandonar grupos o ejecutar otras operaciones cuando el bot disponga de permisos suficientes. Los administradores deben asegurarse de estar autorizados para realizar dichas acciones.',
        'Las decisiones de moderación configuradas por el administrador de una instancia son responsabilidad de ese administrador. Ghost Developer / Nexora no controla de forma ordinaria la política interna de comunidades operadas por terceros mediante instalaciones autohospedadas.',
      ],
    },
    {
      title: '7. Subbots, portales y acceso administrativo',
      paragraphs: [
        'Los tokens de portal, sesiones administrativas y credenciales de subbots son mecanismos de acceso sensibles. Deben almacenarse de forma segura y revocarse cuando exista riesgo de exposición. El administrador puede suspender o retirar accesos cuando sea necesario para proteger la plataforma o hacer cumplir estas condiciones.',
        'Un subbot puede tener capacidades, límites, configuración, tiempo de vigencia y aislamiento diferentes a la instancia principal. La disponibilidad de comandos depende de la compilación, configuración y servicios instalados.',
      ],
    },
    {
      title: '8. Inteligencia artificial y resultados automatizados',
      paragraphs: [
        'Las funciones basadas en Ollama, modelos locales u otros proveedores pueden producir respuestas incorrectas, incompletas, desactualizadas o no adecuadas para una situación específica. El contenido generado por IA no sustituye asesoramiento profesional médico, jurídico, financiero, de seguridad u otro asesoramiento especializado.',
        'El usuario debe revisar cualquier salida antes de ejecutarla, publicarla o utilizarla para decisiones relevantes. El administrador es responsable de configurar qué modelos y proveedores se habilitan en su instancia.',
      ],
    },
    {
      title: '9. Descargas, actualizaciones y software distribuido',
      paragraphs: [
        'Las páginas oficiales pueden ofrecer instaladores, APK, paquetes Linux, AppImage y otros artefactos. Cuando estén disponibles, los hashes, firmas, arquitectura y metadatos de versión se proporcionan para facilitar la verificación de integridad.',
        'Debes descargar software únicamente desde canales que consideres confiables y verificar los artefactos cuando sea posible. Las actualizaciones pueden modificar funciones, compatibilidad, dependencias o requisitos del sistema.',
      ],
    },
    {
      title: '10. Código fuente y licencia MIT',
      paragraphs: [
        'El código fuente del repositorio Ghost Nexora Bot se distribuye bajo la licencia MIT, cuyo texto incluido en el repositorio prevalece para los derechos concedidos sobre el software. Esa licencia permite amplios derechos de uso, copia, modificación, distribución y sublicencia, sujetos a conservar el aviso de copyright y la licencia.',
        'Estos Términos regulan el uso de los servicios, portales, infraestructura y funciones operadas alrededor del proyecto; no restringen derechos que la licencia MIT conceda expresamente sobre copias del código cubiertas por ella. Componentes de terceros conservan sus respectivas licencias.',
      ],
    },
    {
      title: '11. Propiedad intelectual, marcas y contenido',
      paragraphs: [
        'El nombre del proyecto, identidad visual, documentación original y otros materiales propios pertenecen a sus respectivos titulares, sin perjuicio de los derechos concedidos por la licencia aplicable al código. Las marcas y logotipos de terceros pertenecen a sus propietarios.',
        'El usuario conserva los derechos que le correspondan sobre su propio contenido. Al pedir al bot que procese contenido, declara tener la autorización necesaria para realizar dicho tratamiento y para enviar ese contenido a los servicios que haya configurado.',
      ],
    },
    {
      title: '12. Disponibilidad, cambios y funciones experimentales',
      paragraphs: [
        'No se garantiza que todas las funciones estén disponibles permanentemente, sin errores o con compatibilidad ininterrumpida con servicios externos. Algunas funciones pueden ser beta, experimentales, depender de un proveedor o requerir software adicional.',
        'Ghost Developer / Nexora puede corregir, sustituir, retirar o incorporar características para mantener seguridad, compatibilidad, rendimiento o evolución técnica. Los administradores de instalaciones autohospedadas deciden cuándo aplicar versiones nuevas, salvo mecanismos de actualización que hayan activado expresamente.',
      ],
    },
    {
      title: '13. Seguridad y despliegues autohospedados',
      paragraphs: [
        'La seguridad de una instalación depende también del sistema operativo, VPS, firewall, proxy inverso, TLS, secretos, base de datos, permisos, versiones instaladas y prácticas del administrador. Mantén dependencias actualizadas, usa HTTPS cuando corresponda, limita privilegios y protege copias de seguridad y archivos de sesión.',
        'Si modificas el código, expones puertos adicionales, instalas plugins o conectas APIs externas, asumes la responsabilidad de revisar el impacto técnico y legal de esas modificaciones.',
      ],
    },
    {
      title: '14. Suspensión, terminación y protección de la plataforma',
      paragraphs: [
        'El acceso a una instancia oficial o a sus servicios asociados puede limitarse o suspenderse cuando existan indicios razonables de abuso, riesgo de seguridad, incumplimiento de estos términos, requerimiento legal o necesidad técnica urgente. Cuando resulte razonable, se procurará preservar la integridad y disponibilidad del sistema.',
        'En una instalación autohospedada, el operador de esa instalación determina sus propias decisiones de acceso, además de las obligaciones derivadas de la licencia y de la legislación aplicable.',
      ],
    },
    {
      title: '15. Garantías y limitación de responsabilidad',
      paragraphs: [
        'En coherencia con la licencia MIT, el software se proporciona “tal cual”, sin garantías expresas o implícitas en la medida permitida por la ley. No se garantiza que una automatización, descarga, integración, respuesta de IA o interacción con un tercero produzca un resultado concreto.',
        'En la máxima medida permitida por la legislación aplicable, Ghost Developer / Nexora y los colaboradores del proyecto no serán responsables por daños indirectos, pérdida de datos, pérdida de beneficios, interrupciones, bloqueos de cuentas de terceros o consecuencias derivadas de una configuración insegura, uso ilícito o modificación no controlada del software. Nada de esta cláusula excluye responsabilidades que legalmente no puedan excluirse.',
      ],
    },
    {
      title: '16. Privacidad',
      paragraphs: [
        'El tratamiento de información personal relacionado con la web y el bot se describe en la Política de Privacidad. Los operadores de instalaciones autohospedadas pueden convertirse en responsables independientes del tratamiento de los datos que gestionen y deben cumplir las obligaciones legales que les correspondan.',
      ],
    },
    {
      title: '17. Cambios a estos términos',
      paragraphs: [
        'Estos términos pueden actualizarse para reflejar cambios técnicos, legales, de seguridad o de producto. La fecha de vigencia publicada en esta página permite identificar la versión aplicable. Los cambios materiales podrán comunicarse por los canales oficiales cuando resulte apropiado.',
      ],
    },
    {
      title: '18. Legislación aplicable, divisibilidad y conflictos',
      paragraphs: [
        'Estos términos se interpretarán conforme a las normas imperativas que resulten aplicables a cada relación y jurisdicción. Cuando no exista una jurisdicción pactada válidamente, cualquier controversia se someterá a la autoridad o tribunal competente determinado por la legislación aplicable.',
        'Si una cláusula resulta inválida o inaplicable, las demás conservarán su eficacia en la medida permitida. La falta de ejercicio inmediato de un derecho no implica renuncia permanente a ese derecho.',
      ],
    },
    {
      title: '19. Contacto',
      paragraphs: [
        'Para asuntos relacionados con estos términos, seguridad, privacidad o uso de la plataforma: ghostnexora@gmail.com. Canal oficial adicional: Telegram @Gh0stDeveloper.',
      ],
    },
  ] : [
    { title: '1. Identification, scope and acceptance', paragraphs: ['These Terms & Conditions govern access to and use of Ghost Nexora Bot, its website, administrative dashboard, subbot portal, group tools, official downloads, artificial-intelligence components, integrations, internal APIs and other functions published by Ghost Developer / Nexora.', 'By installing, running, administering, linking, downloading or using any part of the project, you accept these terms to the extent permitted by applicable law. If you operate an instance for third parties, you are responsible for informing them of the rules and policies applicable to that instance.'] },
    { title: '2. Project status and third-party services', paragraphs: ['Ghost Nexora Bot is an independent software project. It is not presented as an official product of Meta, WhatsApp, Telegram, Discord, GitHub, Ollama or other providers referenced by the software.', 'Some features depend on third-party services, protocols, APIs, websites or infrastructure. Their owners may change, limit, block or discontinue functionality beyond the project’s control. Use of those services is also subject to their own terms, policies, limits and content rules.'] },
    { title: '3. Eligibility and user responsibility', paragraphs: ['You must satisfy the minimum age, legal capacity and other requirements imposed by your jurisdiction and each third-party platform you use. Adult or sensitive-content features may only be used by persons legally permitted to access such content where it is lawful.', 'You are responsible for actions performed through your credentials, sessions, tokens, linked numbers, subbots and servers. Do not share administrative secrets or access credentials with unauthorized persons.'] },
    { title: '4. Permitted use', paragraphs: ['You may use the project for lawful automation, community administration, entertainment, utilities, permitted downloads, AI features, subbot operation and other uses enabled by the software, provided you comply with law, third-party rights and connected-platform rules.', 'Anyone operating a self-hosted deployment is responsible for its configuration, permissions, security, availability, regulatory compliance and the actions of its administrators and users.'] },
    { title: '5. Prohibited conduct', paragraphs: ['Ghost Nexora Bot may not be used for unauthorized access, fraud, phishing, malware distribution, harassment, threats, child exploitation, unlawful intimate material, fraudulent impersonation, deliberate security bypass, abusive spam, denial-of-service attacks or other illegal activity.', 'You must not use the project to infringe copyright, trademarks, privacy, confidentiality, publicity or other third-party rights. A technical ability to retrieve or process content does not itself create legal authorization to do so.'] },
    { title: '6. Groups, administration and moderation', paragraphs: ['Group features may read operational metadata, count activity, manage settings, apply moderation actions, leave groups or perform other operations when the bot has sufficient permissions. Administrators must ensure they are authorized to perform those actions.', 'Moderation decisions configured by a deployment administrator are that administrator’s responsibility. Ghost Developer / Nexora does not ordinarily control the internal policy of communities operated through third-party self-hosted installations.'] },
    { title: '7. Subbots, portals and administrative access', paragraphs: ['Portal tokens, administrative sessions and subbot credentials are sensitive access mechanisms. They must be stored securely and revoked if exposure is suspected. Access may be suspended or withdrawn when necessary to protect the platform or enforce these terms.', 'Subbots may have different capabilities, limits, configuration, lifetime and isolation from the main instance. Command availability depends on the build, configuration and installed services.'] },
    { title: '8. Artificial intelligence and automated output', paragraphs: ['Features powered by Ollama, local models or other providers may produce incorrect, incomplete, outdated or unsuitable answers. AI output is not a substitute for professional medical, legal, financial, security or other specialist advice.', 'Users must review output before executing, publishing or relying on it for consequential decisions. Deployment administrators are responsible for deciding which models and providers are enabled.'] },
    { title: '9. Downloads, updates and distributed software', paragraphs: ['Official pages may provide installers, APKs, Linux packages, AppImages and other artifacts. Where available, hashes, signatures, architecture and version metadata are supplied to help verify integrity.', 'Download software only from channels you trust and verify artifacts where possible. Updates may change features, compatibility, dependencies or system requirements.'] },
    { title: '10. Source code and MIT License', paragraphs: ['The Ghost Nexora Bot repository is distributed under the MIT License. The license text included in the repository controls the rights granted over covered software and permits broad use, copying, modification, distribution and sublicensing subject to retaining the copyright and license notice.', 'These Terms govern services, portals, infrastructure and operational features surrounding the project; they do not restrict rights expressly granted by the MIT License over covered source-code copies. Third-party components retain their respective licenses.'] },
    { title: '11. Intellectual property, trademarks and content', paragraphs: ['The project name, visual identity, original documentation and other proprietary materials belong to their respective owners, without limiting rights granted by the applicable software license. Third-party marks and logos belong to their owners.', 'Users retain any rights they hold in their own content. By asking the bot to process content, a user represents that they have the authority required for that processing and for transmission to configured services.'] },
    { title: '12. Availability, changes and experimental features', paragraphs: ['No guarantee is made that every feature will remain permanently available, error-free or continuously compatible with external services. Some features may be beta, experimental, provider-dependent or require additional software.', 'Ghost Developer / Nexora may fix, replace, remove or add features for security, compatibility, performance or technical evolution. Self-hosted administrators decide when to apply new releases unless they have expressly enabled an update mechanism.'] },
    { title: '13. Security and self-hosted deployments', paragraphs: ['Deployment security also depends on the operating system, VPS, firewall, reverse proxy, TLS, secrets, database, permissions, installed versions and administrator practices. Keep dependencies current, use HTTPS where appropriate, limit privileges and protect backups and session files.', 'If you modify the code, expose additional ports, install plugins or connect external APIs, you are responsible for reviewing the technical and legal impact of those changes.'] },
    { title: '14. Suspension, termination and platform protection', paragraphs: ['Access to an official instance or related services may be limited or suspended when there are reasonable signs of abuse, security risk, violation of these terms, legal requirement or urgent technical need. Where reasonable, measures will seek to preserve system integrity and availability.', 'For self-hosted deployments, that deployment’s operator controls access decisions, subject to the applicable license and law.'] },
    { title: '15. Warranties and limitation of liability', paragraphs: ['Consistent with the MIT License, the software is provided “as is,” without express or implied warranties to the extent permitted by law. No guarantee is made that any automation, download, integration, AI answer or third-party interaction will produce a particular result.', 'To the fullest extent permitted by applicable law, Ghost Developer / Nexora and project contributors will not be liable for indirect damages, data loss, lost profits, interruptions, third-party account restrictions or consequences arising from insecure configuration, unlawful use or uncontrolled software modification. This clause does not exclude liability that cannot legally be excluded.'] },
    { title: '16. Privacy', paragraphs: ['Processing of personal information associated with the website and bot is described in the Privacy Policy. Operators of self-hosted deployments may act as independent controllers of the data they process and must satisfy their own legal obligations.'] },
    { title: '17. Changes to these terms', paragraphs: ['These terms may be updated to reflect technical, legal, security or product changes. The effective date on this page identifies the applicable version. Material changes may be communicated through official channels where appropriate.'] },
    { title: '18. Applicable law, severability and disputes', paragraphs: ['These terms are interpreted subject to mandatory rules that apply to the relevant relationship and jurisdiction. Where no valid jurisdiction has been agreed, disputes will be submitted to the competent authority or court determined by applicable law.', 'If a provision is invalid or unenforceable, the remaining provisions remain effective to the extent permitted. Failure to immediately exercise a right does not permanently waive that right.'] },
    { title: '19. Contact', paragraphs: ['For matters concerning these terms, security, privacy or platform use: ghostnexora@gmail.com. Additional official channel: Telegram @Gh0stDeveloper.'] },
  ]

  return <main className="ops-page min-h-screen">
    <header className="sticky top-0 z-30 border-b border-white/[.08] bg-[#080809]/92 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4 px-5 py-4 md:px-8">
        <a href="/legal" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl border border-blue-500/25 bg-blue-500/[.1]"><FileText className="size-5 text-blue-300"/></span><span><strong className="block text-sm text-white">{es ? 'Términos y condiciones' : 'Terms & Conditions'}</strong><span className="text-[10px] font-bold uppercase tracking-[.16em] text-blue-300">Ghost Nexora Bot</span></span></a>
        <a href="/legal" className="ops-button-muted"><ArrowLeft className="size-4"/>{es ? 'Centro legal' : 'Legal center'}</a>
      </div>
    </header>

    <section className="mx-auto w-full max-w-[1180px] px-5 py-14 md:px-8 lg:py-20">
      <div className="grid gap-6 lg:grid-cols-[1fr_300px] lg:items-start">
        <article className="ops-panel p-6 md:p-9">
          <div className="border-b border-white/[.08] pb-7">
            <p className="font-mono text-xs font-black uppercase tracking-[.18em] text-blue-300">{es ? 'DOCUMENTO OFICIAL DE USO' : 'OFFICIAL USE DOCUMENT'}</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-.035em] text-white">{es ? 'Términos y condiciones' : 'Terms & Conditions'}</h1>
            <p className="mt-4 text-sm leading-7 text-zinc-300">{es ? 'Fecha de vigencia' : 'Effective date'}: <strong>{effective}</strong></p>
          </div>
          <div className="legal-prose">
            {sections.map((section) => <section key={section.title} id={`section-${section.title.split('.')[0]}`}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>)}
          </div>
        </article>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className="ops-panel p-5">
            <Scale className="size-5 text-blue-300"/>
            <h2 className="mt-4 font-black text-white">{es ? 'Operador del proyecto' : 'Project operator'}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">Ghost Developer / Nexora</p>
            <a href="mailto:ghostnexora@gmail.com" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-300 hover:text-blue-200"><Mail className="size-4"/>ghostnexora@gmail.com</a>
          </div>
          <div className="ops-panel p-5">
            <ShieldCheck className="size-5 text-emerald-300"/>
            <h2 className="mt-4 font-black text-white">{es ? 'Documentos relacionados' : 'Related documents'}</h2>
            <div className="mt-3 space-y-2 text-sm"><a className="block font-semibold text-blue-300 hover:text-blue-200" href="/privacy">{es ? 'Política de privacidad' : 'Privacy Policy'}</a><a className="block font-semibold text-blue-300 hover:text-blue-200" href="/help">{es ? 'Ayuda y soporte' : 'Help & Support'}</a><a className="block font-semibold text-blue-300 hover:text-blue-200" href="https://github.com/Gh0stDeveloper/GhostNexoraBot/blob/main/LICENSE" target="_blank" rel="noreferrer">MIT License</a></div>
          </div>
        </aside>
      </div>
    </section>
  </main>
}
