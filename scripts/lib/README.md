# scripts/lib — Librerías del repo

Esta carpeta contiene las librerías que usan los scripts de validación.

---

## Estructura

```
scripts/lib/
├── backend-validator/  ← Réplica funcional del validador (se usa con scripts)
└── schemas/            ← Esquemas JSON exportados
```

---

## backend-validator/ — Réplica funcional del validador

**Qué es:** Versión adaptada del validador del backend, con imports normalizados, que usan los scripts de validación locales.

**Para qué sirve:** Validar los JSONs de clínicas antes de entregarlos. Se usa con:
- `scripts/validate-and-save.js`
- `scripts/lib/backend-validator/run-validation.ts`

**Quién lo mantiene:** Solo el administrador del sistema. Los asesores no lo tocan.

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

- **NO modifiques** nada en `backend-validator/`
- Si necesitas que se actualice el validador local, pídeselo al administrador del sistema
- Si el validador local no detecta un error pero el backend lo rechaza, reporta al administrador — no intentes corregirlo tú
