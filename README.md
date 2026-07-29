# Registro diario de biodigestores

App web instalable (PWA) para el registro diario de biodigestores a escala botella:
volumen de biogás, composición, pH y estabilidad FOS/TAC por método Nordmann.

Funciona sin conexión. **Los datos nunca salen del dispositivo**: se guardan en IndexedDB
del navegador. Acá no hay servidor ni base de datos: lo que se publica es solamente la
interfaz y los cálculos.

---

## Publicar en GitHub Pages

1. Crear un repositorio nuevo en github.com (por ejemplo `registro-biodigestores`).
2. Subir **el contenido de esta carpeta** a la raíz del repo — no la carpeta en sí.
   Se puede arrastrar y soltar desde la página del repo; para las subcarpetas
   (`vendor/`, `icons/`) conviene arrastrarlas enteras.
3. En el repo: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.

A los pocos minutos queda disponible en:

```
https://TU-USUARIO.github.io/registro-biodigestores/
```

### Instalar en cada dispositivo

- **Android (Chrome):** abrir la URL → menú ⋮ → *Instalar aplicación*.
- **iPhone (Safari):** abrir la URL → botón compartir → *Agregar a inicio*.
  Tiene que ser Safari; desde Chrome en iOS no aparece la opción.
- **PC (Chrome/Edge):** abrir la URL → ícono de instalar en la barra de direcciones.

---

## Al publicar un cambio: subir la versión del caché

El service worker guarda la app entera para que abra offline. Si se sube un cambio sin
tocar la versión, los dispositivos que ya la tienen instalada **siguen usando los archivos
viejos**.

Antes de subir cualquier modificación, editar la primera línea útil de `sw.js`:

```js
const CACHE_VERSION = 'v1';   // → 'v2', 'v3', ...
```

Con eso, la próxima vez que se abra la app aparece el aviso *"Hay una versión nueva"* con
el botón para actualizar.

---

## Pasar datos entre dispositivos

IndexedDB es por dispositivo y por navegador: lo que se carga en el celular no aparece
solo en la PC. El puente es el Excel.

1. En el dispositivo de origen: **Exportar a Excel**.
2. Pasar el archivo (mail, nube, cable, lo que sea).
3. En el dispositivo de destino: **Importar Excel**.

La importación reconstruye el historial completo y sigue calculando Día, volumen acumulado
y FOS/TAC correctamente desde ahí. Las filas con la misma fecha se reemplazan, no se duplican.

El mismo archivo sirve como respaldo. Conviene exportar seguido: si se borra el sitio del
navegador, se borran los datos.

---

## Estructura

```
index.html               interfaz
styles.css               estilos (tabla en PC, tarjetas en celular)
app.js                   lógica: IndexedDB, cálculos Nordmann, import/export
sw.js                    service worker — acá se sube CACHE_VERSION
manifest.webmanifest     metadatos de instalación
vendor/xlsx.full.min.js  SheetJS 0.18.5, servido local para que ande sin conexión
icons/                   íconos de instalación
```

## Cálculos

Fórmulas Nordmann, con `Cac` (normalidad del ácido) guardado **por registro**, para que
cambiar el valor a mitad de un ensayo no recalcule hacia atrás las mediciones anteriores.

```
Vol2 = VolTotal(pH 4,3) − Vol1(pH 5,1)
TAC  = Vol1 × Cac × 50000 / masa                    [mg CaCO₃/L]
FOS  = ((Vol2 × Cac × 332 / masa) − 0,15) × 500     [mg HAc/L]
```

Todos los volúmenes de biogás en mL, para escala botella.
