#!/bin/bash
# ==================================================================
# Practica integradora - comandos para AWS CloudShell
# Ejecute cada bloque por separado (copie y pegue), no todo junto.
# ==================================================================

# ---------- 0. Variables (ejecutar cada vez que abra CloudShell o una pestana nueva) ----------
PILA=PracticaIntegradora
salida() { aws cloudformation describe-stacks --stack-name $PILA --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
SITIO=$(salida SitioWeb)
API=$(salida BalanceadorAPI)
BUCKET=$(salida BucketSitio)
DIST=$(salida DistribucionId)
ASG=$(salida GrupoAutoScaling)
BD=$(salida EndpointBaseDatos)
TG=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names $ASG --query "AutoScalingGroups[0].TargetGroupARNs[0]" --output text)
echo "Sitio:  $SITIO"; echo "API:    $API"; echo "Bucket: $BUCKET"; echo "ASG:    $ASG"

# ---------- 1. Estado de la pila ----------
aws cloudformation describe-stacks --stack-name $PILA --query "Stacks[0].StackStatus" --output text

# ---------- 2. Subir la pagina estatica ----------
# Antes: Acciones > Cargar archivo, y suba index.html, estilos.css y app.js
aws s3 cp index.html  s3://$BUCKET/
aws s3 cp estilos.css s3://$BUCKET/
aws s3 cp app.js      s3://$BUCKET/
aws s3 ls s3://$BUCKET/

# Si cambia algun archivo despues, vuelva a subirlo e invalide la cache de CloudFront:
aws cloudfront create-invalidation --distribution-id $DIST --paths "/*"

# ---------- 3. Servidores y balanceador ----------
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names $ASG \
  --query "AutoScalingGroups[0].Instances[].[InstanceId,AvailabilityZone,LifecycleState,HealthStatus]" --output table

aws elbv2 describe-target-health --target-group-arn $TG \
  --query "TargetHealthDescriptions[].[Target.Id,TargetHealth.State]" --output table

# 10 peticiones: deben alternar entre servidores y zonas
for i in $(seq 1 10); do curl -s $API; echo; done

# ---------- 4. Pruebas de red: que se puede alcanzar desde internet y que no ----------
# 4a. El nombre de la base de datos resuelve a una IP PRIVADA (10.0.x.x)
getent hosts $BD

# 4b. Desde internet, el puerto 5432 de la base NO responde
timeout 5 bash -c "</dev/tcp/$BD/5432" && echo "5432 ABIERTO" || echo "5432 CERRADO desde internet"

# 4c. Un servidor tiene IP publica, pero su puerto 3000 solo acepta al balanceador
IP=$(aws ec2 describe-instances --filters "Name=tag:aws:autoscaling:groupName,Values=$ASG" "Name=instance-state-name,Values=running" \
  --query "Reservations[0].Instances[0].PublicIpAddress" --output text)
echo "IP publica de un servidor: $IP"
curl -s --max-time 5 http://$IP:3000/api/ping || echo "3000 CERRADO desde internet"

# 4d. El mismo servicio SI responde a traves del balanceador
curl -s ${API%/visita}/ping; echo

# ---------- 5. Trafico artificial (prueba de carga) ----------
sudo dnf install -y httpd-tools

# Prueba corta: 2,000 peticiones, 20 a la vez
ab -n 2000 -c 20 $API

# Reparto de la carga segun la propia API
curl -s ${API%/visita}/estadisticas; echo

# Prueba larga para activar Auto Scaling: 5 minutos, 30 a la vez
ab -t 300 -n 1000000 -c 30 $API

# En otra pestana de CloudShell (ejecute antes el bloque 0), repita cada minuto:
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names $ASG \
  --query "AutoScalingGroups[0].[DesiredCapacity,length(Instances)]" --output text
aws autoscaling describe-scaling-activities --auto-scaling-group-name $ASG \
  --max-items 5 --query "Activities[].[StartTime,StatusCode,Description]" --output table

# ---------- 6. Prueba de falla ----------
# Inicie una carga y, mientras corre, detenga un servidor en la consola:
# EC2 > Instancias > seleccione una > Estado de la instancia > Detener
ab -t 300 -c 20 $API
# En otra pestana:
aws elbv2 describe-target-health --target-group-arn $TG \
  --query "TargetHealthDescriptions[].[Target.Id,TargetHealth.State]" --output table

# ---------- 7. Limpieza (lunes, al terminar) ----------
aws s3 rm s3://$BUCKET --recursive
aws cloudformation delete-stack --stack-name $PILA
aws cloudformation wait stack-delete-complete --stack-name $PILA && echo "Pila eliminada"
