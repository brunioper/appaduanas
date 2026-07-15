# VeriCIF — Auditor de valoración aduanera con IA

Herramienta para despachantes y agencias de aduana: analiza facturas comerciales (fotos, PDF, Excel/CSV) y detecta **probable subvaluación** para evadir impuestos de importación.

## Qué hace

1. **Subís los documentos** del caso (factura, packing list, factura de flete) más los datos de la operación (origen, vía, Incoterm, valor declarado, tasa de impuestos).
2. **La IA extrae** proveedor, ítems, precios, Incoterm y cargos — y vos **corregís** cualquier error de lectura antes de analizar (los campos con baja confianza se resaltan).
3. **El análisis** produce un dictamen ✅ / ⚠️ / ❌ con cuatro controles:
   - **Consistencia interna** — cantidades × precios = totales, factura vs. valor declarado.
   - **Incoterm y CIF** — si la factura es FOB/EXW/FCA y se declaró tal cual en un país con base CIF, detecta el patrón *"FOB declarado como CIF"*, estima flete + seguro, reconstruye el CIF corregido y calcula los **impuestos dejados de percibir**.
   - **Comparación de precios por ítem** — rango de mercado (bajo/típico/alto en US$) por producto, con barra visual mostrando dónde cae el precio declarado y % de desvío. Usa referencias oficiales de la base de datos cuando existen; si no, estimación de IA (a la que **no** se le muestran los precios declarados, para evitar sesgo de anclaje).
   - **Señales de alerta** — precios redondos, precios idénticos entre productos distintos, valores apenas debajo de umbrales.
4. **Exportás** el informe (imprimir/PDF o JSON) y queda guardado en el **historial** (Supabase).

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completá tus claves
npm run dev                  # http://localhost:3000
```

### Variables de entorno (`.env.local`)

| Variable | Qué es |
|---|---|
| `OPENROUTER_API_KEY` | Tu clave de [openrouter.ai/keys](https://openrouter.ai/keys) |
| `MODEL_VISION` | Modelo que lee documentos (necesita visión). Gratis: `google/gemma-4-31b-it:free` |
| `MODEL_REASONING` | Modelo de análisis de precios. Gratis: `qwen/qwen3-next-80b-a3b-instruct:free` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Opcional — habilita historial y referencias de precios |

**Cambiar a un modelo premium** es una línea en `.env.local`, por ejemplo:

```env
MODEL_VISION=anthropic/claude-sonnet-4.5
MODEL_REASONING=anthropic/claude-sonnet-4.5
```

Todas las llamadas de IA pasan por un único módulo ([lib/ai.ts](lib/ai.ts)); ningún otro archivo conoce el proveedor. Los prompts viven en [prompts/](prompts/) para ajustarlos sin tocar lógica.

### Supabase (historial + referencias)

1. Creá un proyecto en [supabase.com](https://supabase.com).
2. SQL Editor → pegá y ejecutá [supabase/schema.sql](supabase/schema.sql).
3. Project Settings → API → copiá URL y `anon` key a `.env.local`.

Para cargar **valores de referencia oficiales** (tienen prioridad sobre las estimaciones de IA), insertá filas en `reference_prices` con `source = 'official'` — hay un ejemplo al final del schema.

### Probar con las muestras

En [samples/](samples/) hay 3 facturas ficticias:

| Archivo | Caso | Resultado esperado |
|---|---|---|
| `muestra-1-cif-honesta.csv` | CIF con precios de mercado | ✅ Consistente |
| `muestra-2-subvaluada.csv` | Electrónica ~80% bajo mercado | ❌ Probable subvaluación |
| `muestra-3-fob-como-cif.csv` | Total FOB declarado como valor en aduana | ❌ FOB declarado como CIF + impuestos dejados de percibir |

Para la muestra 3, elegí Incoterm **FOB** y declará el total de la factura (15.550) como valor en aduana.

## Deploy (Vercel)

1. Importá el repo en [vercel.com](https://vercel.com) → Add New Project.
2. Cargá las variables de entorno de `.env.local` en Project Settings → Environment Variables.
3. Deploy. (Los modelos gratis pueden tardar; el plan Hobby corta las funciones a los 10–60 s — si pasa, subí a un modelo premium o ajustá `maxDuration`.)

## Notas

- Los rangos de precio de la IA son **indicativos**; la determinación final del valor es del funcionario aduanero. La app lo recuerda en cada pantalla.
- Porcentajes de flete/seguro por defecto (editables en [lib/analysis.ts](lib/analysis.ts)): marítimo 8%, aéreo 15%, courier 18%, seguro 0,4%.
- Tipo de cambio: open.er-api.com con tabla de respaldo offline; se muestra siempre la fuente y la fecha.
- **Nunca** subas `.env.local` al repositorio (ya está en `.gitignore`). Si una clave se filtró, rotala en OpenRouter.
