# Sistema de Presupuestos de Obra Pública — Infraestructura Educativa de Caldas

[![Despliegue en GitHub Pages](https://github.com/sedcaldas/APUs/actions/workflows/deploy.yml/badge.svg)](https://sedcaldas.github.io/APUs/)

Aplicación web integral desarrollada para la formulación, administración, comparación y auditoría de presupuestos de obra pública para la infraestructura educativa del Departamento de Caldas.

🌐 **Enlace de Despliegue en GitHub Pages:** [https://sedcaldas.github.io/APUs/](https://sedcaldas.github.io/APUs/) (o [https://sedcaldas.github.io/](https://sedcaldas.github.io/))

---

## 🏛️ Estructura Territorial y Educativa

La plataforma implementa la gobernanza territorial estricta de Caldas:
$$\text{Departamento de Caldas} \longrightarrow \text{Subregión (6)} \longrightarrow \text{Municipio (27)} \longrightarrow \text{Institución Educativa} \longrightarrow \text{Sede Educativa} \longrightarrow \text{Proyecto} \longrightarrow \text{Presupuesto}$$

### Subregiones Oficiales:
1. **Centrosur**: Manizales (17001), Chinchiná (17174), Neira (17486), Palestina (17524), Villamaría (17873).
2. **Alto Occidente**: Filadelfia (17272), La Merced (17388), Marmato (17442), Riosucio (17614), Supía (17777).
3. **Bajo Occidente**: Anserma (17042), Belalcázar (17088), Risaralda (17616), San José (17665), Viterbo (17877).
4. **Magdalena Caldense**: La Dorada (17380), Norcasia (17495), Samaná (17662), Victoria (17867).
5. **Alto Oriente**: Manzanares (17433), Marquetalia (17444), Marulanda (17446), Pensilvania (17541).
6. **Norte**: Aguadas (17013), Aranzazu (17050), Pácora (17513), Salamina (17653).

---

## 🚀 Funcionalidades Principales

- **Tablero Ejecutivo (Dashboard):** Métricas clave de inversión en Caldas, costo directo vs indirecto (AIU 25%), gráficos de distribución por subregión y proyectos por tipología de intervención.
- **Navegación Territorial y Sedes:** Filtros en cascada desde subregión hasta sede con códigos DANE oficiales, zona (urbana/rural) y estado.
- **Editor de Presupuesto en Línea:** Tabla agrupada por capítulos de obra, edición reactiva de cantidades y precios unitarios, adición de partidas desde el catálogo de 3.310 actividades y recálculo en tiempo real.
- **Congelación e Inmutabilidad:** Aprobación oficial que genera una instantánea inmodificable (`snapshot`) para evitar que modificaciones posteriores alteren presupuestos aprobados.
- **Análisis de Precios Unitarios (APU):** Desglose detallado de recursos (materiales, mano de obra, herramienta menor y análisis básicos anidados) con prevención algorítmica de ciclos.
- **Insumos y Precios:** Catálogo de más de 3.200 insumos con comparativo de precios vigencias 2025 vs 2026, fuentes de cotización y porcentaje de incremento.
- **Parámetros, AIU y Pólizas:** Personal directivo, campamento, seguridad y salud en el trabajo, factores prestacionales legales y primas de seguros contractuales.
- **Centro de Operaciones Masivas (Excel/CSV):** Descarga de plantillas oficiales, prevalidación en simulación (Dry-Run) con reporte de inconsistencias por fila y aplicación transaccional.
- **Comparador de Escenarios:** Comparación lado a lado de versiones presupuestales con código de colores para partidas modificadas, agregadas o eliminadas.
- **Exportaciones Oficiales:** Descarga del presupuesto en formato Excel oficial (`.xlsx`) y resumen ejecutivo en PDF.
- **Auditoría y Trazabilidad:** Bitácora inmutable con registro cronológico de usuario, rol, fecha, entidad, valores anteriores y nuevos.
- **Control de Roles (RBAC):** Alternador en encabezado para 7 roles institucionales: Administrador, Formulador, Revisor, Aprobador, Administrador de Costos, Auditor y Consulta.

---

## 🛠️ Ejecución Local

### Opción 1: Servidor Completo FastAPI (Backend + Frontend)
```powershell
# 1. Instalar dependencias requeridas
pip install fastapi uvicorn sqlalchemy openpyxl pandas reportlab pydantic

# 2. Inicializar y sembrar la base de datos desde el libro Excel
python -m backend.app.seed_data

# 3. Iniciar el servidor local
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```
Abra en su navegador: `http://127.0.0.1:8000/`

### Opción 2: Despliegue Estático en GitHub Pages
La aplicación incluye un motor cliente autónomo con datos pre-exportados en `data/` y procesamiento de hojas de cálculo vía SheetJS.
Simplemente abra `index.html` en cualquier navegador web o despliéguelo en GitHub Pages.

---

## 📦 Instrucciones para Publicar en GitHub (`sedcaldas`)

```powershell
# 1. Inicializar repositorio git
git init
git add .
git commit -m "feat: Sistema de Presupuestos de Obra Pública Caldas con soporte GitHub Pages"

# 2. Configurar rama principal
git branch -M main

# 3. Vincular con el repositorio de sedcaldas en GitHub
# Si el repositorio es APUs:
git remote add origin https://github.com/sedcaldas/APUs.git

# O si el repositorio es sedcaldas.github.io:
# git remote add origin https://github.com/sedcaldas/sedcaldas.github.io.git

# 4. Enviar los cambios
git push -u origin main
```

En la configuración del repositorio en GitHub:
1. Ir a **Settings** → **Pages**.
2. En **Build and deployment** → **Source**, seleccionar **GitHub Actions** (o **Deploy from a branch** → Branch: `main` / Folder: `/ (root)`).
3. La aplicación quedará disponible públicamente en `https://sedcaldas.github.io/APUs/`.
