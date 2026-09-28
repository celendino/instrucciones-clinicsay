# scripts/lib — Librerías del repo

Esta carpeta contiene las librerías que usan los scripts de validación.

---

## Estructura

```
scripts/lib/
├── backend-validator/  ← Wrappers del validator generado desde el backend
├── .generated/         ← Copia ignorada del código fuente del backend
└── schemas/            ← Esquemas JSON exportados
```

---

## backend-validator/ — Wrappers del validator autoritativo

**Qué es:** Wrappers que sincronizan y cargan el validator original de `../clinicsay-backend` sin mantener una copia adaptada manualmente.

**Para qué sirve:** Validar los JSONs de clínicas antes de entregarlos. Se usa con:
- `scripts/validate-and-save.js`
- `scripts/lib/backend-validator/run-validation.ts`

**Quién lo mantiene:** El código fuente se mantiene en `../clinicsay-backend`. Ejecuta `npm run sync:validator` después de cambios del backend.

---

## schemas/

**Qué es:** Schemas JSON exportados del backend (`structured-logic-schema.json`).

**Para qué sirve:** Referencia técnica del schema de `structuredLogic`. Se genera con un comando manual (ver `README.md` raíz).

---

## Cuándo usar cada carpeta

| Tarea | Carpeta a usar |
|---|---|
| Validar JSON de clínica antes de entregar | `backend-validator/` |
| Entender el schema del JSON | `schemas/` |

---

## Reglas para asesores

- **NO modifiques** el validator generado ni `scripts/.generated/`
- Si necesitas que se actualice el validador local, pídeselo al administrador del sistema
- Si el validator fuente no está disponible en `../clinicsay-backend`, el sync debe fallar; no uses una copia manual desactualizada
