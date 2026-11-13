# AGENTS.md --- Backend de armarios y outfits

## 1. Contexto del proyecto

Estamos desarrollando desde cero el backend de una aplicación web para
gestionar armarios, prendas y outfits.

El usuario está aprendiendo TypeScript y necesita que el agente explique
las decisiones y los cambios con claridad. No des por hecho que conoce
NestJS, Prisma, SQL, Docker, autenticación o patrones de arquitectura.

**Objetivo principal:** construir un backend mantenible, seguro y
probado, avanzando por fases pequeñas que puedan ejecutarse y
verificarse antes de continuar.

## 2. Forma de trabajar con el usuario

-   Trabaja **una fase cada vez**. No implementes toda la aplicación en
    una única operación.
-   Antes de una fase importante, resume el objetivo, los archivos que
    probablemente cambiarán y los criterios de aceptación.
-   Si hay decisiones importantes sin resolver, presenta las opciones y
    recomienda una con una explicación breve. No inventes requisitos de
    producto.
-   Inspecciona el repositorio y sus archivos antes de proponer cambios.
    Respeta las decisiones existentes que sean coherentes.
-   Para cambios amplios, prepara primero un plan breve y espera
    confirmación cuando la decisión afecte a arquitectura, seguridad,
    datos o costes.
-   Después de implementar, ejecuta las comprobaciones pertinentes
    (tests, lint, compilación y/o migraciones) y comunica sus resultados
    reales. No afirmes que una comprobación ha pasado si no se ejecutó.
-   Al terminar cada fase, explica:
    1.  Qué se ha construido.
    2.  Qué archivos se han creado o modificado.
    3.  Cómo funciona el flujo, paso a paso.
    4.  Los conceptos nuevos de TypeScript, NestJS, SQL o Prisma que
        aparecen.
    5.  Los comandos para ejecutarlo y probarlo.
    6.  Qué queda pendiente y cuál sería el siguiente paso.
-   Usa español para las explicaciones y comentarios dirigidos al
    usuario. Mantén los nombres de código, identificadores y
    convenciones técnicas en inglés.
-   Prefiere soluciones simples, explícitas y fáciles de aprender frente
    a abstracciones prematuras.
-   No añadas dependencias sin explicar por qué son necesarias.
-   Si detectas un error, explica la causa y la solución; no te limites
    a ocultarlo o a aplicar un parche sin contexto.

## 3. Stack técnico previsto

-   **Lenguaje:** TypeScript con modo estricto.
-   **Runtime:** Node.js, usando una versión LTS compatible con las
    dependencias elegidas.
-   **Framework HTTP:** NestJS.
-   **Base de datos:** PostgreSQL.
-   **Entorno local de base de datos:** Docker Compose, con volumen
    persistente.
-   **ORM y migraciones:** Prisma ORM, siguiendo la documentación
    oficial correspondiente a la versión instalada.
-   **Validación HTTP:** DTOs y `class-validator`/`class-transformer` si
    son compatibles con la configuración de NestJS.
-   **Autenticación:** JWT y hash de contraseñas con Argon2id, salvo que
    se justifique otra solución.
-   **Pruebas:** herramientas de test configuradas por NestJS, con
    pruebas unitarias e integración según corresponda.
-   **Documentación de API:** Swagger/OpenAPI mediante la integración
    oficial de NestJS.
-   **Control de versiones:** Git.
-   **Asistente de desarrollo:** OpenCode.

No cambies de framework, ORM ni estrategia de base de datos sin explicar
el motivo y solicitar confirmación.

## 4. Verificación de versiones y documentación

Antes de instalar o actualizar dependencias, consulta la documentación
oficial de las versiones relevantes. No mezcles instrucciones de
versiones principales distintas de Prisma, NestJS o Node.js.

-   Prefiere documentación oficial y ejemplos compatibles con el
    proyecto real.
-   Inspecciona `package.json`, el archivo de bloqueo y la configuración
    actual antes de recomendar comandos.
-   No actualices todas las dependencias automáticamente.
-   Si la documentación o el entorno no están disponibles, indícalo y
    trabaja con la información verificable del repositorio.
-   Usa los comandos del gestor de paquetes ya elegido; por defecto, npm
    si el proyecto ya utiliza npm.

## 5. Arquitectura

Empieza con un **monolito modular NestJS**. No introduzcas
microservicios ni una arquitectura distribuida.

Organiza el código por dominios y responsabilidades. La estructura
exacta debe adaptarse a la versión y convenciones del proyecto, pero
puede incluir módulos como:

-   `auth`: registro, inicio de sesión y autenticación.
-   `users`: perfil y datos del usuario.
-   `plans`: planes y límites configurables.
-   `subscriptions`: estado e historial de suscripciones.
-   `wardrobes`: armarios.
-   `garment-types`: tipos de prendas y sus atributos.
-   `wardrobe-items`: prendas guardadas en los armarios.
-   `outfits`: outfits y las prendas que los componen.
-   `prisma`: cliente y acceso a la base de datos.
-   `common`: utilidades compartidas justificadas.

No crees módulos vacíos solo por adelantado. Añade cada módulo cuando
corresponda a la fase actual.

Mantén separadas, cuando aporte claridad, las responsabilidades de
controladores, servicios, DTOs y acceso a datos. Evita capas adicionales
que no resuelvan una necesidad concreta.

## 6. Modelo de dominio previsto

Este es el modelo inicial de referencia. Antes de aplicar migraciones,
revisa las cardinalidades, los nombres, las restricciones y los índices;
explica cualquier cambio importante.

### Entidades

-   **User:** cuenta de usuario, correo único y datos de autenticación.
-   **Plan:** plan comercial, por ejemplo Free o Premium.
-   **PlanLimit:** límites configurables por plan y tipo de recurso.
-   **Subscription:** historial de suscripciones de un usuario, plan
    asociado, estado y fechas relevantes.
-   **Wardrobe:** armario propiedad de un usuario.
-   **GarmentType:** tipo o categoría de prenda, por ejemplo camiseta,
    pantalón, vestido o calzado.
-   **WardrobeItem:** prenda concreta guardada en un armario. Puede
    contener nombre, notas, color, talla, temporada, imagen y metadatos
    variables.
-   **Outfit:** conjunto creado por un usuario.
-   **OutfitItem:** relación entre un outfit y una prenda del armario,
    con campos opcionales como orden o posición.

### Relaciones y reglas

-   Un usuario puede tener varios armarios, sujeto a los límites de su
    plan.
-   Un armario pertenece a un único usuario.
-   Un armario puede contener muchas prendas.
-   Cada prenda pertenece a un armario y tiene un tipo de prenda.
-   Un usuario puede crear varios outfits, sujeto a los límites de su
    plan.
-   Un outfit puede incluir varias prendas.
-   La misma prenda puede reutilizarse en distintos outfits.
-   Una misma prenda no debería aparecer duplicada en el mismo outfit.
-   Las relaciones deben impedir que un usuario use armarios, prendas u
    outfits de otro usuario.
-   Los atributos específicos de cada tipo de prenda pueden guardarse
    inicialmente en un campo JSON validado en el backend. No permitas
    que ese JSON sustituya a los campos relacionales importantes.
-   Las imágenes se guardarán en un servicio de almacenamiento de
    objetos cuando se implemente esa función. En PostgreSQL se
    almacenarán referencias o URLs, no los archivos binarios.
-   Los límites de prendas y outfits se calculan por usuario en total,
    no de forma independiente por armario, salvo que el producto defina
    otra cosa explícitamente.
-   Una reducción de plan no debe borrar automáticamente datos. Debe
    impedir nuevas creaciones que excedan el límite, pero permitir
    consultar y eliminar recursos existentes.
-   Define explícitamente cómo se representa un límite ilimitado; no
    dependas de una interpretación ambigua de `0` o `null`.
-   Define qué plan y qué límites se aplican cuando no existe una
    suscripción activa.
-   La aplicación debe conservar el historial de suscripciones cuando
    cambie el plan.
-   Las operaciones que crean recursos sujetos a límites deben manejar
    condiciones de concurrencia para evitar que dos peticiones
    simultáneas superen el límite.

No supongas que estos requisitos están implementados solo porque figuren
aquí: constrúyelos y pruébalos por fases.

## 7. Seguridad y privacidad

-   Nunca almacenes contraseñas en texto plano. Usa Argon2id con
    parámetros apropiados para la librería seleccionada.
-   No incluyas secretos, tokens reales, contraseñas ni datos personales
    en el repositorio.
-   Incluye un `.env.example` con nombres de variables y valores
    ficticios o locales, nunca con credenciales reales.
-   Asegúrate de ignorar `.env` y otros archivos con secretos mediante
    `.gitignore`.
-   Valida todos los datos de entrada en el servidor.
-   No confíes en un `userId` enviado por el cliente para decidir la
    propiedad de un recurso protegido. Obtén la identidad del usuario
    desde el contexto autenticado.
-   Comprueba la propiedad de los recursos en cada operación de lectura,
    actualización, borrado y asociación.
-   Devuelve errores coherentes sin revelar información sensible,
    consultas SQL, tokens o trazas internas.
-   No registres contraseñas, tokens, secretos ni cuerpos de petición
    sensibles.
-   Configura expiración para los tokens. Explica las limitaciones del
    logout con JWT y no afirmes que un token queda invalidado
    inmediatamente si no existe un mecanismo real de revocación.
-   No implementes cobros reales ni almacenes datos de tarjetas.
-   Aplica controles de seguridad adicionales de forma proporcional y
    explica su finalidad.

## 8. Base de datos y migraciones

-   PostgreSQL se ejecuta localmente con Docker Compose.
-   Usa un volumen nombrado para persistencia y un healthcheck.
-   Separa configuración local, ejemplo de configuración y secretos.
-   Usa migraciones de Prisma para los cambios del esquema.
-   No edites una migración ya aplicada para simular un cambio nuevo;
    crea otra migración.
-   No ejecutes comandos que borren datos o volúmenes sin explicar el
    efecto y pedir confirmación explícita.
-   En particular, advierte antes de usar `docker compose down -v`,
    comandos de reset de Prisma o cualquier operación destructiva.
-   No ejecutes migraciones contra producción ni bases de datos remotas
    sin autorización explícita.
-   Mantén los datos de desarrollo reproducibles mediante un seed
    idempotente cuando sea necesario.
-   Usa transacciones para operaciones que deban completarse como una
    unidad.
-   Añade restricciones e índices cuando protejan reglas de negocio o
    mejoren consultas justificadamente.

## 9. API y validación

-   Usa rutas y nombres consistentes en inglés.
-   Valida los DTOs y rechaza campos inesperados cuando corresponda.
-   Implementa paginación en listados que puedan crecer.
-   Define formatos de respuesta y errores consistentes, sin crear un
    sistema excesivamente complejo al inicio.
-   Documenta los endpoints con Swagger cuando la API básica esté
    disponible.
-   Evita devolver hashes, secretos o campos internos innecesarios.
-   No permitas asignación masiva de campos sensibles a través de DTOs
    genéricos.
-   Considera límites de tamaño para texto, listas, JSON y archivos
    cuando se implemente la subida de imágenes.

## 10. Pruebas y criterios de calidad

Para cada funcionalidad, añade pruebas proporcionales al riesgo.

Como mínimo, verifica cuando corresponda:

-   Casos válidos y datos inválidos.
-   Campos obligatorios y formatos incorrectos.
-   Usuarios no autenticados.
-   Usuarios que intentan acceder a recursos ajenos.
-   Recursos inexistentes.
-   Límites del plan y cambios de plan.
-   Relaciones duplicadas o incompatibles.
-   Errores de base de datos y transacciones.
-   Casos de concurrencia relevantes.

Antes de dar una fase por terminada:

1.  Ejecuta los tests disponibles.
2.  Ejecuta el lint si existe.
3.  Ejecuta la compilación o comprobación de tipos.
4.  Revisa el diff de Git.
5.  Informa de cualquier prueba que no se haya podido ejecutar y del
    motivo.

No desactives reglas de TypeScript, lint o tests para hacer que una
implementación parezca correcta.

## 11. Fases de desarrollo

Avanza en este orden y no saltes a la siguiente fase sin resumir el
resultado y comprobar la anterior:

1.  **Inspección y planificación:** revisar el repositorio, explicar
    arquitectura y proponer hitos.
2.  **Proyecto base:** NestJS, configuración, scripts, Git y
    documentación inicial.
3.  **PostgreSQL local:** Docker Compose, variables de entorno, volumen
    y healthcheck.
4.  **Prisma:** conexión, servicio integrado con NestJS y primera
    migración.
5.  **Modelo de dominio:** entidades, relaciones, restricciones, índices
    y seed.
6.  **Autenticación y usuarios:** registro, login, perfil, hash seguro,
    JWT y pruebas.
7.  **Planes y límites:** planes configurables, plan efectivo, reglas de
    cuotas y pruebas.
8.  **Armarios y prendas:** CRUD, tipos de prenda, metadatos, propiedad,
    paginación y límites.
9.  **Outfits:** CRUD, asociaciones de prendas, reutilización y
    comprobaciones de propiedad.
10. **Calidad de API:** Swagger, manejo de errores, configuración y
    pruebas de integración.
11. **Imágenes:** almacenamiento externo y referencias en la base de
    datos.
12. **Suscripciones y pagos:** diseñar primero; integrar Stripe solo
    después de confirmar el modelo comercial y usar inicialmente el modo
    de prueba.
13. **Preparación para despliegue:** configuración por entorno, logs,
    seguridad, backups y documentación operativa.

La lista es una guía, no una orden de implementar todo automáticamente.

## 12. Reglas específicas para OpenCode

-   Al comenzar una sesión, lee este archivo y el estado actual del
    repositorio.
-   Si existe un `AGENTS.md` adicional en una subcarpeta, respeta
    también sus instrucciones aplicables.
-   Si el usuario pide planificar, analiza y presenta un plan sin
    modificar archivos.
-   Si el usuario pide implementar, trabaja solo en el alcance acordado.
-   Antes de comandos potencialmente destructivos, explica qué se
    perdería y pide autorización.
-   No afirmes haber iniciado servicios, aplicado migraciones, creado
    commits ni ejecutado tests si no lo has hecho.
-   No hagas commits automáticamente salvo que el usuario lo solicite.
-   No cambies archivos generados o de bloqueo innecesariamente.
-   Mantén los cambios pequeños y revisables.
-   Si una herramienta o comando falla, informa del error real y ofrece
    el siguiente paso seguro.

## 13. Primera tarea recomendada

Cuando se inicie el trabajo, la primera petición recomendada es:

> Lee `AGENTS.md` y revisa el estado actual del repositorio. No
> modifiques archivos todavía. Explícame qué hay creado, qué falta y
> cuál sería la siguiente fase más pequeña y segura. Comprueba las
> versiones y la documentación oficial que correspondan al estado actual
> del proyecto. Propón un plan con criterios de aceptación y comandos de
> verificación, y espera mi confirmación antes de implementar.

## 14. Recursos oficiales

-   NestJS: https://docs.nestjs.com/
-   TypeScript: https://www.typescriptlang.org/docs/
-   Prisma ORM: https://www.prisma.io/docs
-   Docker Compose: https://docs.docker.com/compose/
-   OpenCode: https://opencode.ai/docs/
-   PostgreSQL: https://www.postgresql.org/docs/

Consulta la documentación adecuada a las versiones reales del proyecto
en lugar de copiar ejemplos antiguos sin comprobarlos.
