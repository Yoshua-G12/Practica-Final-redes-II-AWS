# Liga de Servidores AWS · Redes II

Aplicación de tres capas con temática de fútbol para la práctica final de Ingeniería en Sistemas. El balanceador reparte las visitas entre servidores EC2 y PostgreSQL conserva las visitas y los mensajes de la afición.

**Entorno del proyecto:** pila `PracticaIntegradora`, región **EE. UU. Este (Ohio), `us-east-2`**. Según el contexto proporcionado por el grupo, la arquitectura ya está desplegada y superó pruebas de balanceo, un millón de solicitudes y recuperación ante fallos. Esos resultados no se volvieron a comprobar durante esta personalización: aquí solo se modificaron y verificaron archivos locales.

**Estado de esta entrega:** personalización lista localmente; publicación de estáticos y actualización de la API pendientes de autorización. No se ejecutaron comandos de AWS, cargas a S3, actualizaciones, Instance Refresh, pruebas de carga, cambios en la base, commits ni push.

## Qué se personalizó

- **Liga de Servidores AWS:** estadio en verde oscuro, blanco y dorado; cancha y distintivos originales dibujados con HTML y CSS, sin imágenes, logos ni fuentes externas.
- **Equipos en la cancha:** presenta el equipo que atendió la última visita, su ID real de EC2 y su zona real de AWS. Conserva el botón «Volver a preguntar» y las ocho últimas respuestas de la sesión.
- **Marcador de la jornada:** mantiene el total, las peticiones y los porcentajes reales por servidor, calculados desde PostgreSQL. No se añadieron datos de muestra al sitio.
- **Muro de aficionados:** conserva el libro de visitas, las validaciones, el límite de 80 caracteres para el nombre y 500 para el mensaje, los bloqueos de envío y la confirmación del servidor que guardó cada mensaje.
- **Estado del estadio:** muestra carga, confirmaciones y errores de las operaciones. Se añadieron foco de teclado visible, etiquetas de formulario, enlace para saltar al contenido, adaptación móvil y respeto por movimiento reducido.

| Zona devuelta por la API | Nombre visual | Sector |
| --- | --- | --- |
| `us-east-2a` | Equipo Esmeralda | A |
| `us-east-2b` | Equipo Dorado | B |
| Cualquier otra zona | Equipo visitante | Se conserva la zona recibida |

Estos nombres son alias visuales de las zonas. Si Auto Scaling crea más instancias, cada una conserva su propia barra e ID aunque comparta equipo con otra instancia. La ilustración del encabezado representa los dos sectores previstos; no es una comprobación de disponibilidad.

## Arquitectura y tecnologías

1. **Presentación:** HTML5, CSS3 y JavaScript vanilla en S3 privado. CloudFront entrega los archivos mediante HTTPS y usa OAC para acceder al bucket.
2. **Aplicación:** CloudFront reenvía `/api/*` al Application Load Balancer por HTTP 80. El ALB reparte hacia Node.js/Express en EC2, puerto 3000. Auto Scaling mantiene la configuración original: mínimo 2, deseado 2, máximo 4.
3. **Datos:** RDS PostgreSQL privado, puerto 5432, con conexión cifrada desde la API mediante `pg`. El esquema y los registros existentes no se cambiaron.

```text
Navegador --HTTPS--> CloudFront --archivos--> S3 privado
                         |
                         +-- /api/* --> ALB :80 --> EC2 Node.js :3000
                                                       |
                                                  RDS :5432
                                                  privado
```

Se conservan la VPC `10.0.0.0/16`, las subredes públicas `10.0.1.0/24` y `10.0.2.0/24`, las privadas `10.0.11.0/24` y `10.0.12.0/24`, el Internet Gateway, los grupos de seguridad, la política de escalado y los parámetros. RDS sigue con `MultiAZ: false`. El único cambio del YAML está dentro del código de la API en `UserData`.

## Archivos y respaldo

```text
Practica Final Redes II/
├── infra-practica-integradora.yaml   # 26 recursos; agrega solo GET /api/equipo
├── comandos-cloudshell.sh           # Original conservado; contiene carga y limpieza
├── estilos.css                     # CSS original del profesor, conservado
├── sitio/
│   ├── index.html                   # Estadio y cuatro secciones de la liga
│   ├── estilos.css                  # Tema de fútbol y diseño responsive
│   └── app.js                       # Funciones anteriores y ficha opcional del equipo
├── README.md
├── .gitignore                      # Conservado
└── tmp/
    ├── respaldo-antes-liga/         # Copias anteriores de los archivos modificados
    └── validacion/                  # Herramientas y pruebas locales
```

`tmp/` está excluido de Git y no se publica en S3. Su respaldo conserva la versión local anterior; antes de desplegar, guarde también los archivos y la plantilla que estén realmente publicados, por si difieren de la copia local. Se conservan el PDF, el PPTX y el ZIP del profesor.

El frontend sigue teniendo solamente tres archivos, sin compilación ni dependencias de ejecución. No hay un backend nuevo separado: `server.js`, `package.json` y el servicio de Node.js se generan dentro de cada EC2 desde `Resources > LaunchTemplate > Properties > LaunchTemplateData > UserData` del YAML.

## API y funcionamiento

Los seis endpoints anteriores no se modificaron:

| Método y ruta | Funcionamiento y respuesta |
| --- | --- |
| `GET /api/ping` | Texto `ok`. Salud del ALB; no consulta la base. |
| `GET /api/salud` | Consulta PostgreSQL y devuelve `{ servidor, zona, hora_bd, version }`. |
| `GET /api/visita` | Inserta una visita y devuelve `{ mensaje, servidor, zona }`. Es una escritura aunque use GET. |
| `GET /api/estadisticas` | `{ respondio, total, servidores }`. Cada servidor contiene `{ servidor, zona, peticiones, ultimo_minuto, ultima }`. |
| `GET /api/mensajes` | Arreglo de los últimos 50 mensajes: `{ id, nombre, mensaje, servidor, fecha }`. |
| `POST /api/mensajes` | JSON `{ nombre, mensaje }`. Devuelve HTTP 201 con `{ mensaje, id, servidor }`; HTTP 400 si faltan valores. |
| **`GET /api/equipo`** | Nuevo: identidad del servidor con temática de fútbol. No consulta PostgreSQL ni registra visitas. |

El nuevo endpoint reutiliza `SERVIDOR` y `ZONA`, que ya se obtienen desde `INSTANCE_ID` y `AZ` mediante IMDSv2. Para pruebas locales sin esas variables conserva el valor `local`. No agrega dependencias ni interpolaciones `${...}` al YAML.

Ejemplo ilustrativo del JSON; el ID y la zona reales dependen de quién responda:

```json
{
  "liga": "Liga de Servidores AWS",
  "version": "liga-v1",
  "equipo": "Equipo Esmeralda",
  "servidor": "i-identificador-real-de-la-instancia",
  "zona": "us-east-2a",
  "mensaje": "Cada peticion suma al juego."
}
```

En «Equipos en la cancha», despliegue **Ficha oficial del equipo** y pulse **Consultar ficha** para utilizarlo. Esta llamada es manual y puede llegar a otro servidor: su resultado muestra su propio ID y zona y no sustituye la identidad de la última visita. Si devuelve 404 porque el servidor todavía tiene la API anterior, se muestra una alternativa informativa y las otras funciones siguen operativas. Los errores de red o de respuesta también se manejan sin bloquear el resto de la página.

Se registra una visita al abrir la página y otra por cada pulsación aceptada de «Volver a preguntar». No se agregaron bucles de visitas ni pruebas de carga. El temporizador consulta únicamente `/api/estadisticas`, con cinco segundos entre consultas terminadas; los porcentajes son `peticiones / total * 100`. El total cuenta visitas registradas, no todas las solicitudes HTTP. El muro se actualiza al abrir, al guardar y al pulsar «Actualizar mensajes».

Las rutas son relativas `/api/...`, compatibles con CloudFront y HTTPS. Se conserva `fetch`, `async/await`, tiempo límite de 15 segundos, escritura de datos con `textContent` y bloqueo de operaciones repetidas. Si se pierde una respuesta de escritura, no se reintenta automáticamente: se conserva el texto y conviene revisar el muro antes de reenviar. El backend original no ofrece claves de idempotencia.

## Despliegue manual A: publicar solamente el sitio

Este despliegue puede hacerse antes de actualizar la API. No requiere modificar CloudFormation, EC2 ni PostgreSQL. Los siguientes comandos son instrucciones para el usuario; no se ejecutaron durante esta entrega.

1. Entre en la cuenta correcta y seleccione **Ohio, `us-east-2`**. Confirme la pila existente `PracticaIntegradora`; no cree otra pila.
2. Guarde los tres archivos actualmente publicados en un respaldo privado. Si S3 tiene versionado, anote también sus versiones. No cambie la configuración de versionado para seguir esta guía.
3. Abra CloudShell en Ohio y cargue **los tres archivos de `sitio/`**, no el `estilos.css` de la raíz del proyecto. Deben quedar como `index.html`, `estilos.css` y `app.js` en el directorio actual.
4. Obtenga las salidas de la pila existente:

```bash
export AWS_DEFAULT_REGION=us-east-2
export AWS_REGION=us-east-2
PILA=PracticaIntegradora
salida() {
  aws cloudformation describe-stacks --stack-name "$PILA" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
BUCKET=$(salida BucketSitio)
DIST=$(salida DistribucionId)
SITIO=$(salida SitioWeb)
printf 'Bucket: %s\nDistribución: %s\nSitio: %s\n' "$BUCKET" "$DIST" "$SITIO"
ls -l index.html estilos.css app.js
```

Si las salidas están vacías, dicen `None` o la consulta falla, deténgase y revise cuenta, región y pila. Si aún no guardó los archivos publicados, puede descargarlos manualmente desde S3 a una carpeta distinta antes de continuar.

5. Publique CSS, JavaScript y al final HTML, manteniendo las claves en la raíz del bucket:

```bash
aws s3 cp estilos.css "s3://$BUCKET/estilos.css" --content-type 'text/css; charset=utf-8'
aws s3 cp app.js "s3://$BUCKET/app.js" --content-type 'application/javascript; charset=utf-8'
aws s3 cp index.html "s3://$BUCKET/index.html" --content-type 'text/html; charset=utf-8'
aws s3 ls "s3://$BUCKET/"
aws cloudfront create-invalidation --distribution-id "$DIST" \
  --paths '/' '/index.html' '/estilos.css' '/app.js'
```

No agregue el prefijo `sitio/` a las claves ni haga público el bucket. La publicación de tres objetos no es atómica: el JavaScript nuevo admite el HTML anterior para reducir problemas durante la transición. Espere a que la invalidación termine, recargue el navegador y compruebe también en una ventana privada. CloudFront mantiene separados los archivos con caché y `/api/*` sin caché.

6. Abra **`SitioWeb`**. Revise las cuatro secciones, los IDs/zonas reales, el marcador y un mensaje publicado y persistido tras recargar. La ficha puede mostrar que aún no está disponible; eso es compatible con el despliegue A.

No ejecute completo `comandos-cloudshell.sh`: incluye pruebas de carga, de falla y eliminación. El script original permanece sin cambios y depende de la región de la sesión.

## Despliegue manual B: actualizar la API gradualmente

**Cambiar `UserData` en el archivo o en una versión del Launch Template no reescribe el código de los EC2 que ya están ejecutándose.** En la configuración habitual, el script de arranque se ejecuta al primer inicio. Hay que aplicar la versión mediante sustitución gradual de instancias; un simple reinicio no es este mecanismo. Véase la documentación de [UserData en EC2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html).

### Antes de enviar la actualización

1. En `us-east-2`, guarde la plantilla actualmente desplegada y los valores de parámetros de `PracticaIntegradora`, sin publicar contraseñas. Anote ID del Launch Template, versión **numérica** del ASG, AMI efectiva e IDs de las dos instancias sanas.
2. Confirme dos destinos `healthy`, instancias `InService`, ausencia de otra actualización/Instance Refresh y que el grupo ya salió de la prueba de carga. No cambie mínimo, máximo ni capacidad deseada para esta personalización.
3. Compare la plantilla local con la desplegada. La diferencia local introducida aquí es exclusivamente `/api/equipo`. Si la pila real tiene cambios adicionales del usuario, incorpore solo este bloque a esa plantilla vigente antes de continuar.
4. En CloudFormation, seleccione la pila existente y prepare un **conjunto de cambios / change set** de tipo actualización con la plantilla revisada. Conserve los parámetros existentes, incluido el usuario y la contraseña; no sustituya valores por los predeterminados de este README.
5. Revise que solo se modifiquen `LaunchTemplate` y la referencia de su versión en `AutoScalingGroup`. No ejecute si aparecen reemplazos/cambios en RDS, red, seguridad, S3, CloudFront o escalado. Crear/revisar el conjunto de cambios y ejecutarlo son pasos distintos; el segundo inicia el reemplazo de EC2.

`LatestAmiId` es un parámetro de SSM: AWS puede resolver una AMI más reciente incluso si conserva la misma clave con «usar valor anterior». Compare la AMI efectiva en el detalle del cambio. Si cambia y no se pretende actualizarla, deténgase y prepare una revisión que conserve la AMI aprobada; no asuma que mantener el nombre del parámetro fija su valor. Véanse los [parámetros de SSM en CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cloudformation-supplied-parameter-types.html).

### Mecanismo previsto por esta plantilla: rolling update de CloudFormation

El YAML ya tiene `AutoScalingRollingUpdate` con `MaxBatchSize: 1`, `MinInstancesInService: 1` y `PauseTime: PT4M`. El ASG referencia `LaunchTemplate.LatestVersionNumber`. Por ello, al ejecutar el cambio de versión, CloudFormation **puede iniciar dentro de la propia actualización** la sustitución gradual de las instancias. No espere a `UPDATE_COMPLETE` para empezar a vigilar los destinos ni inicie simultáneamente un Instance Refresh. Es el comportamiento documentado de [UpdatePolicy](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-attribute-updatepolicy.html).

1. Ejecute manualmente el conjunto de cambios aprobado durante una ventana de bajo tráfico.
2. Observe en paralelo Eventos de CloudFormation, actividad del ASG y Destinos del grupo del ALB. La tanda máxima es una instancia; durante la transición puede quedar una sola atendiendo. No se promete ausencia de interrupciones.
3. Para cada instancia nueva, compruebe instalación del servicio y destino `healthy`. Desde EC2 Instance Connect, las consultas locales `curl -fsS http://localhost:3000/api/ping`, `curl -fsS http://localhost:3000/api/salud` y `curl -fsS http://localhost:3000/api/equipo` permiten verificar esa instancia concreta, sin depender del reparto del ALB. `salud` comprueba PostgreSQL; `equipo` debe devolver `liga-v1`, su ID y su zona. Son consultas manuales para después de autorizar el despliegue.
4. Al finalizar, exija `UPDATE_COMPLETE`, dos destinos sanos y las instancias usando la nueva versión numérica. Abrir el endpoint por CloudFront unas pocas veces no demuestra por sí solo que todas las instancias estén actualizadas.

**Limitación de la política original:** no tiene `cfn-signal` ni `WaitOnResourceSignals: true`. La pausa de cuatro minutos no comprueba que `/api/equipo` o PostgreSQL funcionen y no es un checkpoint manual. El estado `healthy` del ALB solo valida `/api/ping`. Si la instalación tarda más, la actualización puede avanzar sin validar toda la aplicación. Se conservó esta política por la restricción de no modificar recursos. Si necesita aprobar cada tanda o mantener dos destinos sanos en todo momento, posponga la ejecución y prepare una política distinta como cambio separado y autorizado.

### Solo si quedan instancias antiguas después de una actualización estable

Si la plantilla realmente desplegada no disparó el rolling update, primero investigue la diferencia de política/versión. Una vez estable y sin otra sustitución en curso, puede planificar un **Instance Refresh manual** desde EC2 > Auto Scaling Groups > grupo de la salida `GrupoAutoScaling` > Instance refresh. No lo inicie si las dos instancias ya usan la nueva versión.

Para un grupo estable de dos instancias, una opción es conservar 100 % sano, permitir hasta 150 % temporal (tres instancias, dentro del máximo 4) y usar al menos 300 segundos de calentamiento, ajustados al arranque observado. Requiere cuota y capacidad para la instancia temporal, y genera su costo. Use la versión numérica aprobada del ASG y «skip matching» para evitar reemplazos innecesarios. No seleccione `$Latest`/`$Default`, otra AMI o un cambio de capacidad sin revisar el alcance. Referencia: [inicio manual de Instance Refresh](https://docs.aws.amazon.com/autoscaling/ec2/userguide/start-instance-refresh.html).

Configure checkpoints de 50 % y 100 % con tiempo suficiente para comprobar la primera instancia antes de la segunda; el avance continúa cuando vence el intervalo, no exige una aprobación humana. Revise las pruebas por instancia y los destinos `healthy`. No ejecute nuevas operaciones de actualización mientras este mecanismo siga activo. Referencia: [checkpoints](https://docs.aws.amazon.com/autoscaling/ec2/userguide/asg-adding-checkpoints-instance-refresh.html).

### Verificación funcional posterior

- Abra `SitioWeb` y confirme que «Volver a preguntar» mantiene los IDs y zonas reales y actualiza el historial y marcador.
- Abra `SitioWeb` seguido de `/api/equipo`: espere HTTP 200, `liga-v1`, equipo, ID y zona. Compruebe cada instancia de forma individual como se indicó arriba.
- Verifique `/api/ping`, `/api/salud`, `/api/estadisticas` y el muro. Una publicación de prueba en el muro sí escribe un registro; hágala conscientemente y no la borre como parte de esta guía.
- Confirme que los registros anteriores persisten y que el grupo sigue con configuración 2/2/4. No hace falta repetir el millón de solicitudes para comprobar este endpoint.

## Plan de reversión

**Sitio:** vuelva a publicar los tres archivos estáticos que guardó antes del despliegue, y repita la invalidación. El respaldo local está en `tmp/respaldo-antes-liga/sitio/`, pero use el respaldo de S3 si la versión publicada era distinta. El tema nuevo también puede quedarse publicado con la API anterior gracias a la alternativa de la ficha.

**API durante una actualización:** si se detecta un fallo, no inicie otro despliegue ni detenga instancias manualmente. Revise Eventos y la salud de los destinos. Si la pila está en `UPDATE_IN_PROGRESS` y la consola ofrece cancelar la actualización, solicite la cancelación para que CloudFormation gestione su rollback. Vigile hasta un estado estable; no interrumpa un rollback en curso. Si termina en un estado de fallo, revise su causa antes de reintentar.

**API después de una actualización completada:** prepare otro conjunto de cambios con la plantilla anterior aprobada, conservando parámetros, AMI y recursos vigentes. Su ejecución vuelve a generar/aplicar el código anterior gradualmente. Verifique de nuevo dos destinos sanos y las rutas anteriores por instancia. Revertir solo el número del Launch Template no reescribe las instancias ya lanzadas; debe completar el mecanismo gradual correspondiente.

**Si se utilizó Instance Refresh:** cancelarlo detiene nuevas sustituciones, pero no deshace las realizadas. El rollback del refresh tiene requisitos, entre ellos una configuración deseada y versiones numéricas, y solo está disponible mientras sigue en curso. Si el ASG ya apuntaba a la versión nueva al iniciarlo, su configuración previa podría ser también la nueva: no prometa que auto rollback recuperará el código antiguo. Use la plantilla/código anterior aprobado y compruebe la convergencia del ASG. Consulte los [requisitos de rollback de Instance Refresh](https://docs.aws.amazon.com/autoscaling/ec2/userguide/instance-refresh-rollback.html).

No se necesita cambiar el esquema ni restaurar/borrar PostgreSQL para revertir esta personalización.

## Pruebas locales y límites

Se reutilizaron las herramientas de comprobación ya disponibles, sin agregar dependencias al sitio ni instalar paquetes nuevos para esta personalización.

- `node --check sitio/app.js`: sintaxis del frontend.
- Extracción de `UserData` y `server.js`: sintaxis Bash y JavaScript, JSON del paquete y tamaño de `UserData` inferior a 16 KiB, sin ejecutar el arranque.
- `bash -n comandos-cloudshell.sh`: solo análisis de sintaxis; el script no se ejecuta.
- Análisis YAML con etiquetas de CloudFormation: 26 recursos, cinco parámetros y comparación estructural con el respaldo. La única diferencia es el bloque nuevo de `/api/equipo`.
- Nueve pruebas de regresión del frontend y diez pruebas de la personalización, incluidas identidad por zona, porcentajes, alternativa 404, bloqueo de fichas repetidas, texto seguro y compatibilidad durante la transición de archivos estáticos.
- Referencias HTML/CSS/JS, IDs únicos, etiquetas de formulario, rutas relativas y presencia de los tres archivos de S3.
- Renderizado local en Chrome headless a 1440, 390 y 320 píxeles de ancho: cuatro secciones visibles y sin desbordamiento horizontal. Se revisaron las capturas completas con respuestas simuladas. Las imágenes están en `tmp/validacion/liga-escritorio.png`, `liga-movil.png` y `liga-movil-320.png`; no representan datos consultados en AWS.

Las pruebas usan respuestas simuladas y dependencias del backend sustituidas por dobles de prueba; no acceden a AWS, a metadatos EC2 ni a PostgreSQL real. La validez del YAML local no garantiza los permisos ni el resultado de una actualización en la cuenta. Se revisó el diseño en Chrome con anchos de escritorio y móvil; la comprobación en teléfonos físicos, así como la nueva versión desplegada y su rollback real, deben confirmarse antes de dar la publicación por finalizada.

Para repetir las pruebas de comportamiento disponibles en este espacio:

```bash
node tmp/validacion/frontend.test.cjs
node tmp/validacion/liga.test.cjs
```

## Capturas para la entrega

1. Sitio personalizado completo en escritorio y móvil, con las cuatro secciones.
2. Equipos Esmeralda y Dorado con IDs de EC2 y zonas reales; si solo responde uno, muestre el resultado real y revise el otro destino.
3. Marcador con total, peticiones y porcentajes reales por instancia.
4. Mensaje en el muro con servidor que lo guardó y persistencia después de recargar.
5. Ficha opcional funcionando con `liga-v1`; también puede documentar la alternativa antes de desplegar la API.
6. Código del endpoint en `UserData` y comparación del cambio mínimo del YAML.
7. Conjunto de cambios revisado, eventos del reemplazo gradual y estado final `UPDATE_COMPLETE` en `us-east-2`.
8. Dos destinos `healthy`, instancias en las zonas reales y versión numérica nueva del Launch Template.
9. Tres objetos de S3 e invalidación de CloudFront completada.
10. Evidencias previas del millón de solicitudes, balanceo y recuperación, guardadas por el grupo; no se regeneraron en esta tarea.

No incluya contraseñas ni archivos privados en capturas o repositorios. Se detiene el trabajo después de implementar y verificar localmente; cualquier operación de despliegue requiere autorización posterior.
