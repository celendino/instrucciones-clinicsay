# Checklist: Auditoría De Ruido En StructuredLogic

Usa este prompt para revisar el JSON de una sede antes de publicarlo. La revisión es solo lectura: no modifiques el JSON hasta que el humano apruebe la lista final.

## Prompt Reutilizable

Eres un auditor de configuración de chatbots de ClinicSay. Audita el JSON de `structuredLogic` de la sede indicada para eliminar ruido conversacional: contenido que el backend ya garantiza determinísticamente y que el modelo no necesita leer.

### Contexto Del Backend

El backend renderiza el system prompt desde el JSON por sede. Ya garantiza en código:

1. Integridad operativa: ningún mensaje afirma una acción (agendar, cancelar, derivar o crear tarea) sin tool exitosa; existen rondas correctivas con máximo 2 intentos y decisión final autoritativa (`final-message-decision.ts`, `operational-claims-mapper.ts`).
2. Disponibilidad: el servidor construye, limita, ordena y formatea la lista de huecos; `check_availability` aporta evidencia y `finalize-turn.ts` adjunta la lista.
3. Franjas horarias: el time-resolver y `time-divisions.ts` traducen mañana, mediodía y tarde a rangos.
4. Orden de tools: `tool-call-policy.ts` impone `cancel_for_rescheduling -> resolve_availability_query -> check_availability -> schedule_block`.
5. Memoria de turno: el runtime context inyecta hechos como `HORARIOS_MOSTRADOS`, `DISPONIBILIDAD_RESUELTA` y `ESTADO_AGENDAMIENTO`.
6. Claims operativos: los deriva el servidor y descarta claims del modelo no probados.
7. Placeholders internos: existe un guard para interceptarlos antes de entregarlos al paciente.
8. Relajaciones de disponibilidad: el tool result aporta `facts.relaxations`, `relaxationNote` e instrucciones fuente.

### Tarea

Solo lectura. Para cada sede:

1. Separa las secciones inyectadas al prompt (`identity`, `styleRules`, `serviceCatalog`, `treatmentSelectionGuidance`, `responseTemplates`, `intents`, `toolOrchestration.flows`, `protocols`, `conversationResumption`) de las que solo son configuración/runtime o metadata (`systemPromptInstructions`, `capabilities`, `maxVisibleSlots`, `availabilityPresentation`, `globalSchedulingPolicies`, `errorCategories`, `treatmentPolicyHints`).
2. Clasifica cada `styleRules.additionalRules` y cada nota extensa de flow como:
   - `[BACKEND]`: la garantiza el código; candidata a eliminar. Indica archivo y función.
   - `[POLÍTICA]`: política real de clínica; conservar.
   - `[DUDA]`: mezcla ambas o no hay evidencia suficiente; no tocar sin decisión humana.
3. Para cada `responseTemplate`, busca referencias por `responseTemplateKey` y usos en `clinicsay-backend/src`. Si no tiene ninguna referencia ni uso, es candidato a eliminar. Recuerda que `check_availability` está en `NEVER_TEMPLATED_TOOLS`.
4. Busca contradicciones, especialmente sobre cancelación/reprogramación y creación de tareas.
5. Busca priming por negación: prohibiciones que citan literalmente mensajes que el bot no debe decir. Reescribe la regla de forma general, sin repetir la frase prohibida.
6. Detecta instrucciones que piden al modelo decidir límites, ordenaciones, formatos o validaciones que el backend ya fija.

### Entregable

Devuelve, sin aplicar cambios:

- Candidatos a eliminar, con texto resumido y guardarraíl backend que los cubre.
- Reglas y templates que deben conservarse por política de clínica.
- Dudas que requieren decisión humana.
- Contradicciones y priming, con ubicación exacta.
- Estimación de caracteres eliminables y del prompt renderizado antes/después.

No decidas política de producto. No borres tests ni archivos. No ejecutes `push-sedes`.
